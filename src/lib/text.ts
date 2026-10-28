import type { Intent, TermStat } from "./types";

const STOP = new Set(
  `a about above after again against all am an and any are aren't as at be because been before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he her here hers herself him himself his how i if in into is isn't it its itself just let's me more most my myself no nor not of off on once only or other ought our ours ourselves out over own same she should shouldn't so some such than that the their theirs them themselves then there these they this those through to too under until up very was wasn't we were weren't what when where which while who whom why will with won't would wouldn't you your yours yourself yourselves also get got may might must shall via per etc`
    .split(/\s+/),
);

/** Single words that are never useful as a keyword on their own. */
const GENERIC = new Set(
  `home menu contact login log sign signup register cart search privacy policy terms cookie cookies copyright rights reserved skip content read click here learn see view new one use like blog news about page site website www com http https email phone call free shop online best top service services product products company team help support faq faqs pdf download share follow facebook twitter instagram linkedin youtube whatsapp us our your you we all more get need make way ways time year years day today work works working good great high low full small big large quality offer offers provide provides including include includes find look looking sale price prices order orders buy delivery shipping`
    .split(/\s+/),
);

const QUESTION_RE =
  /^(what|how|why|when|where|who|which|can|could|does|do|did|is|are|was|were|should|will|would|may|might|are there|is there)\b/i;

export function isQuestion(text: string): boolean {
  const t = text.trim();
  return t.endsWith("?") || QUESTION_RE.test(t);
}

export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

/** Light singularisation so "tyres" and "tyre" are one term. Not linguistics, just good enough for gap analysis. */
export function stem(tok: string): string {
  if (tok.length > 4 && tok.endsWith("ies")) return `${tok.slice(0, -3)}y`;
  if (tok.length > 3 && tok.endsWith("s") && !/(ss|us|is|ous)$/.test(tok)) return tok.slice(0, -1);
  return tok;
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  const matches = text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
  for (const m of matches) out.push(m.replace(/['’]s$/, "").replace(/['’]/g, ""));
  return out;
}

const CHUNK_SPLIT = /[\n\r.!?;:,()[\]{}"“”‘’|•·–—/\\]+|\s[-–—]\s/g;

function isGoodPhrase(tokens: string[]): boolean {
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  if (STOP.has(first) || STOP.has(last)) return false;
  if (tokens.length === 1) {
    return first.length >= 3 && !GENERIC.has(first) && !/^\d+$/.test(first);
  }
  if (tokens.some((t) => t.length < 1)) return false;
  const stops = tokens.filter((t) => STOP.has(t)).length;
  if (stops > 1) return false;
  const meaningful = tokens.filter((t) => !STOP.has(t) && !GENERIC.has(t) && !/^\d+$/.test(t));
  return meaningful.length >= (tokens.length === 2 ? 2 : 2);
}

export interface Phrase {
  key: string;
  surface: string;
  n: number;
}

/** Extract 1-3 word phrases from text. Never crosses punctuation. Keys are stemmed. */
export function extractPhrases(text: string, maxN = 3): Phrase[] {
  const out: Phrase[] = [];
  for (const chunk of text.split(CHUNK_SPLIT)) {
    const toks = tokenize(chunk);
    if (!toks.length) continue;
    for (let n = 1; n <= maxN; n++) {
      for (let i = 0; i + n <= toks.length; i++) {
        const win = toks.slice(i, i + n);
        if (!isGoodPhrase(win)) continue;
        out.push({ key: win.map(stem).join(" "), surface: win.join(" "), n });
      }
    }
  }
  return out;
}

/** Per-page importance of a term. Used both when trimming page terms and when aggregating a site. */
export function termWeight(s: TermStat): number {
  return (
    (s.t ? 5 : 0) +
    (s.h1 ? 5 : 0) +
    2.5 * Math.min(s.h2 ?? 0, 2) +
    1 * Math.min(s.h3 ?? 0, 2) +
    (s.m ? 2 : 0) +
    0.4 * Math.min(s.b, 6)
  );
}

export function tokenSet(key: string): string {
  return key.split(" ").sort().join(" ");
}

export function contentTokens(text: string): Set<string> {
  return new Set(
    tokenize(text)
      .filter((t) => !STOP.has(t) && t.length > 1)
      .map(stem),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function classifyIntent(kw: string, brandTokens: string[] = []): Intent {
  const k = kw.toLowerCase();
  const squashed = k.replace(/\s+/g, "");
  if (brandTokens.some((b) => b.length >= 3 && squashed.includes(b))) return "navigational";
  if (/\b(buy|order|purchase|near me|discount|coupon|quote|hire|book|booking|for sale|shop|wholesale|supplier|dealer|install|installation|repair|rental|rent)\b/.test(k)) return "transactional";
  if (/\b(best|top|review|reviews|vs|versus|compare|comparison|alternative|alternatives|price|prices|pricing|cost|cheap|cheapest|affordable|brands?)\b/.test(k)) return "commercial";
  if (QUESTION_RE.test(k) || /\b(guide|tutorial|tips|ideas|examples?|meaning|definition|checklist|template|steps|benefits|types|difference|explained|learn)\b/.test(k)) return "informational";
  return "general";
}

export const AI_RETRIEVAL_BOTS = ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Claude-SearchBot", "Claude-User"] as const;
export const AI_TRAINING_BOTS = ["GPTBot", "ClaudeBot", "anthropic-ai", "Google-Extended", "Applebot-Extended", "CCBot", "Bytespider", "Meta-ExternalAgent"] as const;
export const AI_BOTS = [...AI_RETRIEVAL_BOTS, ...AI_TRAINING_BOTS];

export const isStopword = (w: string): boolean => STOP.has(w);
