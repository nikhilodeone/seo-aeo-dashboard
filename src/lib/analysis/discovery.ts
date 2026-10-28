import { isStopword, tokenize } from "../text";
import type { SiteTerm } from "../types";
import { isBranded, type SiteTermMap } from "./keywords";

/** Shop and page furniture, sizes, colours: words that say nothing about what a business sells. */
const NOISE = new Set(
  ("size sizes add added cart filter filters question questions ask custom quick pick sort view price prices login account search menu checkout wishlist return returns " +
    "policy contact about blog faq faqs privacy terms review reviews rated help shipping order orders free sale new shop buy best sellers seller collection collections " +
    "product products home page pages read more load show size chart xs xxs xl xxl xxxl small medium large black white blue red green pink grey gray brown beige navy " +
    "yellow orange purple gold silver color colour colors colours rs inr cod delivery track payment pay email phone subscribe newsletter follow share login register").split(" "),
);

const COUNTRY_NAME: Record<string, string> = {
  in: "india", gb: "uk", uk: "uk", au: "australia", ca: "canada", ae: "uae", sg: "singapore", de: "germany", fr: "france", nz: "new zealand",
  za: "south africa", pk: "pakistan", bd: "bangladesh", lk: "sri lanka", my: "malaysia", ph: "philippines", ng: "nigeria", ie: "ireland",
};

function usable(t: SiteTerm): boolean {
  const words = t.key.split(" ");
  if (words.some((w) => NOISE.has(w) || /\d/.test(w))) return false;
  if (t.ngram === 1 && t.key.length < 4) return false;
  return t.ngram <= 2 && t.pages >= 2 && t.inTitle + t.inH1 + t.inH2 >= 1;
}

/**
 * What the site sells, as a few broad head terms ("designer", "dress", "blazer").
 * Competitors rank for these, not for product names like "frida blazer".
 */
export function headTerms(map: SiteTermMap, brandTokens: string[], max = 5): SiteTerm[] {
  const ranked = [...map.values()]
    .filter((t) => !isBranded(t.key, brandTokens) && usable(t))
    .map((t) => ({ t, score: t.pages + 2 * (t.inH1 + t.inH2) + t.inTitle }))
    .sort((a, b) => b.score - a.score || a.t.key.length - b.t.key.length);
  const out: SiteTerm[] = [];
  for (const { t } of ranked) {
    // Skip a phrase whose words are already covered by a higher-ranked one ("co-ord" after "co-ord set").
    if (out.some((o) => o.key.includes(t.key) || t.key.includes(o.key))) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Queries aimed at "who else sells this, here": head terms plus where, so results are real rivals, not product pages. */
export function discoveryQueries(map: SiteTermMap, brandTokens: string[], country: string, max = 6): string[] {
  const heads = headTerms(map, brandTokens, 5).map((t) => t.label.toLowerCase());
  if (!heads.length) return [];
  const where = COUNTRY_NAME[country.toLowerCase()] ?? "";
  const q = (s: string) => `${s} ${where}`.trim();
  const out: string[] = [];
  if (heads.length >= 2) out.push(q(`${heads[0]} ${heads[1]} online`));
  for (const h of heads.slice(0, 4)) out.push(q(`${h} online`));
  out.push(q(`${heads[0]} brands`));
  return [...new Set(out)].slice(0, max);
}

/* ---------- Owner-supplied context ---------- */

export interface ParsedContext {
  /** Domains typed in the description, e.g. "we compete with aza.com". */
  domains: string[];
  /** Brand names listed after phrases like "competitors:", "like" or "such as". Need a search to turn into a domain. */
  rivalNames: string[];
  /** The description with those parts removed, used to build search queries. */
  topicText: string;
}

const DOMAIN_RE = /\b(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9][a-z0-9-]*\.)+[a-z]{2,24})\b(?:\/\S*)?/gi;
const RIVAL_CLAUSE = /(?:competitors?|rivals?|competes? with|competing with|compete against|similar to|alternatives? to|such as|including|like|e\.g\.?|vs\.?|versus)\s*:?\s*([^.\n;()]+)/gi;
const FILLER = new Set(
  "brand company business store shop website site selling sell sells offer offers offering online india indian we our us my their they customers customer based platform provide provides focused focus specialising specializing specialises specializes also mainly mostly".split(" "),
);

export function parseContext(text: string): ParsedContext {
  const raw = (text ?? "").slice(0, 600);
  const domains = [...new Set([...raw.matchAll(DOMAIN_RE)].map((m) => m[1].toLowerCase()))].slice(0, 5);
  let rest = raw.replace(DOMAIN_RE, " ");

  const rivalNames: string[] = [];
  for (const m of rest.matchAll(RIVAL_CLAUSE)) {
    for (const part of m[1].split(/,|&|\/|\band\b|\bor\b|\betc\b/i)) {
      const name = part.trim().replace(/^(?:(?:like|such as|including|as|e\.g\.?|namely)\s+)+/i, "").replace(/^[\s"'“‘]+|[\s"'”’]+$/g, "");
      // Brand names are capitalised; this keeps "like a boutique for women" out.
      if (!name || name.length > 32 || name.split(/\s+/).length > 4 || !/^[\p{Lu}]/u.test(name)) continue;
      if (!rivalNames.some((r) => r.toLowerCase() === name.toLowerCase())) rivalNames.push(name);
    }
  }
  rest = rest.replace(RIVAL_CLAUSE, " ");
  return { domains, rivalNames: rivalNames.slice(0, 4), topicText: rest.replace(/\s+/g, " ").trim() };
}

/** Search queries built straight from the owner's description of the business. */
export function contextQueries(topicText: string, country: string): string[] {
  const words: string[] = [];
  for (const w of tokenize(topicText)) {
    if (isStopword(w) || FILLER.has(w) || w.length < 3 || /^\d+$/.test(w)) continue;
    if (!words.includes(w)) words.push(w);
  }
  if (words.length < 2) return [];
  const where = COUNTRY_NAME[country.toLowerCase()] ?? "";
  const q = (s: string) => (where && s.includes(where) ? s : `${s} ${where}`).trim();
  const out = [q(`${words.slice(0, 6).join(" ")}`), q(`${words.slice(0, 3).join(" ")} brands`)];
  if (words.length >= 5) out.push(q(`${words.slice(-3).join(" ")} online`));
  return [...new Set(out)];
}

/** Which result is really the named brand's own site? Matches the name against the domain label. */
export function matchBrandDomain(name: string, domains: string[]): string | null {
  const norm = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (norm.length < 3) return null;
  for (const d of domains) {
    const parts = d.toLowerCase().replace(/^www\./, "").split(".");
    const label = (parts.length > 2 && parts[parts.length - 2].length <= 3 ? parts[parts.length - 3] : parts[parts.length - 2] ?? "").replace(/[^a-z0-9]/g, "");
    if (label.length >= 4 && (label.includes(norm) || (norm.length >= 5 && norm.includes(label)))) return d;
  }
  return null;
}
