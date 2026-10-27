import { contentTokens } from "../text";
import type { Intent, QuestionRow, RawData, SiteProfile } from "../types";
import { titleCase } from "../util";
import { stemKey } from "./ranks";

interface HeadingIndex {
  domain: string;
  items: { url: string; tokens: Set<string> }[];
}

function indexHeadings(p: SiteProfile): HeadingIndex {
  const items: HeadingIndex["items"] = [];
  for (const page of p.pages) {
    for (const h of [page.title, ...page.h1, ...page.h2, ...page.h3]) {
      if (h) items.push({ url: page.url, tokens: contentTokens(h) });
    }
  }
  return { domain: p.domain, items };
}

function matches(q: Set<string>, idx: HeadingIndex): string | null {
  if (q.size < 2) return null;
  let best: { url: string; score: number } | null = null;
  for (const it of idx.items) {
    let hit = 0;
    for (const t of q) if (it.tokens.has(t)) hit++;
    const s = hit / q.size;
    if (s >= 0.7 && (!best || s > best.score)) best = { url: it.url, score: s };
  }
  return best?.url ?? null;
}

function patterns(label: string, intent: Intent): string[] {
  switch (intent) {
    case "informational":
      return [`What is ${label}?`, `How does ${label} work?`];
    case "commercial":
      return [`What is the best ${label}?`, `How much does ${label} cost?`];
    case "transactional":
      return [`How do I choose ${label}?`, `What should I know before buying ${label}?`];
    default:
      return [`What is ${label}?`, `How do I choose ${label}?`];
  }
}

export function buildQuestions(
  raw: Pick<RawData, "own" | "competitors" | "serp" | "aiQuestions">,
  topKeywords: { label: string; intent: Intent }[],
): QuestionRow[] {
  const seen = new Set<string>();
  const list: { q: string; source: QuestionRow["source"]; topic: string }[] = [];
  const push = (q: string, source: QuestionRow["source"], topic: string) => {
    const k = stemKey(q);
    if (!k || seen.has(k)) return;
    seen.add(k);
    list.push({ q: q.trim(), source, topic });
  };

  for (const res of Object.values(raw.serp)) for (const p of res.paa) push(p.question, "serp", res.query);
  for (const a of raw.aiQuestions) push(a.q, "ai", a.topic);
  if (list.length < 6) {
    for (const k of topKeywords.slice(0, 6)) for (const q of patterns(k.label, k.intent)) push(q, "pattern", k.label);
  }

  const own = indexHeadings(raw.own);
  const comps = raw.competitors.map(indexHeadings);
  return list.slice(0, 40).map((item) => {
    const toks = contentTokens(item.q);
    const matchedUrl = matches(toks, own);
    return {
      q: /[?]$/.test(item.q) ? item.q : `${item.q}?`,
      source: item.source,
      topic: titleCase(item.topic),
      answered: !!matchedUrl,
      matchedUrl,
      answeredBy: comps.filter((c) => matches(toks, c)).map((c) => c.domain),
    };
  });
}
