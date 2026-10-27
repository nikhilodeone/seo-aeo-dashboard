import { classifyIntent, contentTokens, tokenSet } from "../text";
import type { Brief, Intent, Opportunity, QuestionRow, SiteProfile } from "../types";
import { hashId, median, titleCase, trimTo } from "../util";

const NOISE_H = /^(related|share|comments?|leave a|subscribe|newsletter|contact|follow|menu|search|about us|our team|recent posts?|categories|tags?|you may also|read more|table of contents|conclusion)\b/i;

const TEMPLATE: Record<Intent, (kw: string) => string[]> = {
  informational: (k) => [`What is ${k}?`, `How ${k} works`, `Benefits of ${k}`, `How to choose ${k}`, `Common mistakes to avoid`, `Frequently asked questions`],
  commercial: (k) => [`What to look for in ${k}`, `Top options compared`, `Pricing and what affects it`, `Who each option suits`, `How to choose`, `Frequently asked questions`],
  transactional: (k) => [`${k}: options and pricing`, `How the process works`, `What is included`, `Why choose us`, `Frequently asked questions`],
  navigational: (k) => [`About ${k}`, `Frequently asked questions`],
  general: (k) => [`What is ${k}?`, `Types and options`, `How to choose ${k}`, `Costs and what affects them`, `Frequently asked questions`],
};

function titles(kw: string, intent: Intent, year: number): string[] {
  const K = titleCase(kw);
  const lead = /^(best|top)\b/i.test(kw);
  const base: Record<Intent, string[]> = {
    informational: [`${K}: What It Is and How It Works`, `${K} Explained: A Practical Guide (${year})`],
    commercial: [lead ? `${K} in ${year}: Compared and Reviewed` : `Best ${K} in ${year}: Compared and Reviewed`, `${K}: How to Choose and What It Costs`],
    transactional: [`${K}: Options, Pricing and How to Order`, `${K}: What to Know Before You Buy`],
    navigational: [`${K}`],
    general: [`${K}: A Complete Guide (${year})`, `${K}: Everything You Need to Know`],
  };
  return base[intent].map((t) => trimTo(t, 60));
}

function meta(kw: string, intent: Intent): string {
  switch (intent) {
    case "commercial":
      return trimTo(`Compare ${kw} on what matters: features, pricing and who each option suits, with answers to common questions.`, 155);
    case "transactional":
      return trimTo(`Explore ${kw}: options, pricing and how ordering works, with answers to the questions buyers ask most.`, 155);
    default:
      return trimTo(`What ${kw} is, how it works and how to choose the right option. Clear answers to the questions people ask most.`, 155);
  }
}

const SCHEMA: Record<Intent, string[]> = {
  informational: ["Article", "FAQPage", "BreadcrumbList"],
  commercial: ["ItemList or Product", "FAQPage", "BreadcrumbList"],
  transactional: ["Product or Service", "LocalBusiness (if you serve a local area)", "FAQPage", "BreadcrumbList"],
  navigational: ["Organization", "BreadcrumbList"],
  general: ["Article", "FAQPage", "BreadcrumbList"],
};

const SNIPPET: Record<Intent, string> = {
  informational: "Open with a 40 to 55 word definition directly under the H1 that restates the question and answers it in full.",
  commercial: "Add a comparison table, plus a one-sentence 'best for' verdict per option, near the top.",
  transactional: "Lead with price range, what is included and how to order, within the first 60 words.",
  navigational: "State clearly who you are and where to go next.",
  general: "Open with a 40 to 55 word direct answer to the main question, then expand.",
};

const DEFAULT_WORDS: Record<Intent, number> = { informational: 1500, commercial: 1300, transactional: 800, navigational: 500, general: 1100 };

export function buildBrief(
  opp: Opportunity,
  own: SiteProfile,
  competitors: SiteProfile[],
  questions: QuestionRow[],
  brandTokens: string[],
): Brief | null {
  const kw = opp.keyword;
  if (!kw) return null;
  const intent = classifyIntent(kw, brandTokens);
  const kwTokens = contentTokens(kw);
  const need = Math.max(1, Math.ceil(kwTokens.size * 0.75));

  const has = (text: string) => {
    const t = contentTokens(text);
    let hit = 0;
    for (const k of kwTokens) if (t.has(k)) hit++;
    return hit >= need;
  };

  const competitorPages: Brief["competitorPages"] = [];
  const headingCounts = new Map<string, { text: string; n: number }>();
  for (const c of competitors) {
    const brand = new Set(c.brandTokens);
    for (const p of c.pages) {
      if (!(has(p.title) || p.h1.some(has))) continue;
      competitorPages.push({ domain: c.domain, url: p.url, title: p.title, words: p.wordCount });
      for (const h of p.h2) {
        const text = h.trim();
        if (text.length < 4 || text.length > 90 || NOISE_H.test(text)) continue;
        const toks = [...contentTokens(text)];
        if (toks.some((t) => brand.has(t))) continue;
        const k = tokenSet(toks.join(" "));
        const cur = headingCounts.get(k);
        if (cur) cur.n++;
        else headingCounts.set(k, { text, n: 1 });
      }
    }
  }

  const outline: Brief["outline"] = [...headingCounts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 7)
    .map((h) => ({ h2: h.text, source: "competitor" as const }));

  const related = questions.filter((q) => has(q.q) || has(q.topic)).slice(0, 5);
  for (const q of related.slice(0, 3)) outline.push({ h2: q.q, source: "question" });
  if (outline.length < 4) for (const t of TEMPLATE[intent](kw)) if (outline.length < 7) outline.push({ h2: t, source: "template" });

  const words = competitorPages.map((p) => p.words).filter((w) => w > 200);
  const wordCountTarget = words.length ? Math.min(2500, Math.max(600, Math.round((median(words) * 1.1) / 100) * 100)) : DEFAULT_WORDS[intent];

  const internal = own.pages
    .filter((p) => p.url !== opp.targetUrl && (has(p.title) || p.h1.some(has) || [...kwTokens].some((k) => contentTokens(`${p.title} ${p.h1.join(" ")}`).has(k))))
    .sort((a, b) => b.wordCount - a.wordCount)
    .slice(0, 3)
    .map((p) => ({ url: p.url, title: p.title || p.path }));

  const year = new Date().getFullYear();
  const mode: Brief["mode"] = opp.type === "content-gap" ? "new-page" : "optimise";
  return {
    id: hashId("brief", `${opp.id}|${kw}`),
    keyword: kw,
    intent,
    mode,
    targetUrl: mode === "optimise" ? opp.targetUrl ?? null : null,
    titleOptions: titles(kw, intent, year),
    h1: titleCase(kw),
    metaDescription: meta(kw, intent),
    outline,
    questions: related.map((q) => q.q),
    schema: SCHEMA[intent],
    wordCountTarget,
    internalLinks: internal,
    competitorPages: competitorPages.slice(0, 6),
    snippetHint: SNIPPET[intent],
  };
}

export function buildBriefs(
  opps: Opportunity[],
  own: SiteProfile,
  competitors: SiteProfile[],
  questions: QuestionRow[],
  brandTokens: string[],
  limit = 8,
): Brief[] {
  const out: Brief[] = [];
  const seen = new Set<string>();
  const eligible = opps.filter((o) => (o.type === "content-gap" || o.type === "onpage" || o.type === "striking") && o.keyword);
  for (const o of eligible) {
    const k = tokenSet([...contentTokens(o.keyword!)].join(" "));
    if (seen.has(k)) continue;
    seen.add(k);
    const b = buildBrief(o, own, competitors, questions, brandTokens);
    if (b) out.push(b);
    if (out.length >= limit) break;
  }
  return out;
}
