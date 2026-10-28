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
