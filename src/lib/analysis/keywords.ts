import { classifyIntent, contentTokens, termWeight, tokenSet } from "../text";
import type { GapRow, GapStatus, KeywordRow, PageData, SiteProfile, SiteTerm } from "../types";
import { clamp } from "../util";
import type { RankInfo } from "./ranks";

export type SiteTermMap = Map<string, SiteTerm>;

interface Acc {
  score: number;
  pages: number;
  inTitle: number;
  inH1: number;
  inH2: number;
  inMeta: number;
  body: number;
  best: { w: number; url: string | null };
  prom: Map<string, string>;
  surf: Map<string, number>;
}

export function aggregateSite(profile: SiteProfile): SiteTermMap {
  const accs = new Map<string, Acc>();
  for (const page of profile.pages) {
    for (const [key, stat] of Object.entries(page.terms)) {
      const w = termWeight(stat);
      let a = accs.get(key);
      if (!a) {
        a = { score: 0, pages: 0, inTitle: 0, inH1: 0, inH2: 0, inMeta: 0, body: 0, best: { w: 0, url: null }, prom: new Map(), surf: new Map() };
        accs.set(key, a);
      }
      a.score += w;
      a.pages += 1;
      if (stat.t) a.inTitle++;
      if (stat.h1) a.inH1++;
      if (stat.h2) a.inH2++;
      if (stat.m) a.inMeta++;
      a.body += stat.b;
      if (w > a.best.w) a.best = { w, url: page.url };
      if (stat.t || stat.h1 || stat.h2) a.prom.set(page.url, page.title);
      const sf = page.surf[key] ?? key;
      a.surf.set(sf, (a.surf.get(sf) ?? 0) + 1);
    }
  }
  const scores = [...accs.values()].map((a) => a.score).sort((x, y) => y - x);
  const ref = Math.max(1, (scores[0] + (scores[1] ?? scores[0]) + (scores[2] ?? scores[0])) / 3);
  const out: SiteTermMap = new Map();
  for (const [key, a] of accs) {
    const label = [...a.surf.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? key;
    out.set(key, {
      key,
      label,
      ngram: key.split(" ").length,
      score: a.score,
      norm: Math.round(clamp(100 * Math.sqrt(a.score / ref))),
      pages: a.pages,
      inTitle: a.inTitle,
      inH1: a.inH1,
      inH2: a.inH2,
      inMeta: a.inMeta,
      body: a.body,
      bestPage: a.best.url,
      prominentUrls: [...a.prom.entries()].slice(0, 4).map(([url, title]) => ({ url, title })),
    });
  }
  return out;
}

export function isBranded(key: string, brandTokens: string[]): boolean {
  const squash = key.replace(/ /g, "");
  const words = key.split(" ");
  return brandTokens.some((b) => b.length >= 3 && (words.includes(b) || squash.includes(b)));
}

/** Drop a phrase when a longer phrase containing it carries nearly the same weight. */
export function pruneMaximal(terms: SiteTerm[]): SiteTerm[] {
  const sorted = [...terms].sort((a, b) => b.score - a.score);
  const kept: SiteTerm[] = [];
  for (const t of sorted) {
    const padded = ` ${t.key} `;
    const swallowed = kept.some((l) => l.ngram > t.ngram && ` ${l.key} `.includes(padded) && l.score >= 0.7 * t.score);
    if (!swallowed) kept.push(t);
  }
  return kept;
}

/** Rank a site's terms for display: multi-word phrases first, single words only when they headline pages. */
export function candidateTerms(map: SiteTermMap, brandTokens: string[]): SiteTerm[] {
  const all = [...map.values()].filter((t) => {
    if (isBranded(t.key, brandTokens)) return false;
    if (t.ngram === 1) return t.inTitle + t.inH1 >= 2 || (t.inTitle + t.inH1 >= 1 && t.pages >= 3);
    return t.score >= 3;
  });
  return pruneMaximal(all)
    .map((t) => ({ t, rank: t.score * (t.ngram === 1 ? 0.6 : 1) }))
    .sort((a, b) => b.rank - a.rank)
    .map((x) => x.t);
}

/** Best own page for a free-text query, by how many of its words appear in the page's title, H1 or URL. */
export function bestPageFor(query: string, pages: PageData[]): string | null {
  const q = contentTokens(query);
  if (!q.size) return null;
  let best: { url: string; score: number } | null = null;
  for (const p of pages) {
    const hay = contentTokens([p.title, ...p.h1, ...p.h2.slice(0, 6), p.path.replace(/[-_/]/g, " ")].join(" "));
    let hit = 0;
    for (const t of q) if (hay.has(t)) hit++;
    const s = hit / q.size + Math.min(0.1, p.wordCount / 20000);
    if (hit > 0 && (!best || s > best.score)) best = { url: p.url, score: s };
  }
  return best && best.score >= 0.5 ? best.url : null;
}

export function buildKeywordRows(
  ownMap: SiteTermMap,
  brandTokens: string[],
  rank: (key: string) => RankInfo,
  prevRank?: (key: string) => RankInfo,
  limit = 80,
): KeywordRow[] {
  const cands = candidateTerms(ownMap, brandTokens).slice(0, limit);
  return cands.map((t) => {
    const r = rank(t.key);
    const p = prevRank?.(t.key);
    return {
      key: t.key,
      label: t.label,
      intent: classifyIntent(t.label, brandTokens),
      branded: false,
      norm: t.norm,
      pages: t.pages,
      inTitle: t.inTitle > 0,
      inH1: t.inH1 > 0,
      inH2: t.inH2 > 0,
      inMeta: t.inMeta > 0,
      bestPage: t.bestPage,
      position: r.position,
      rankSource: r.source,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      prevPosition: p?.position ?? null,
    };
  });
}

interface CompAgg {
  profile: SiteProfile;
  map: SiteTermMap;
}

const isProminent = (t: SiteTerm) => t.inTitle + t.inH1 >= 1 || t.inH2 >= 2;

export function gapAnalysis(
  own: { profile: SiteProfile; map: SiteTermMap },
  comps: CompAgg[],
  rank: (key: string) => RankInfo,
): GapRow[] {
  if (!comps.length) return [];
  const brand = new Set<string>([...own.profile.brandTokens, ...comps.flatMap((c) => c.profile.brandTokens)]);
  const brandList = [...brand];

  // Candidate phrases come from competitors.
  const candidates = new Map<string, SiteTerm>();
  for (const c of comps) {
    for (const t of candidateTerms(c.map, brandList).slice(0, 120)) {
      if (t.norm < 25) continue;
      const set = tokenSet(t.key);
      const prev = candidates.get(set);
      if (!prev || t.score > prev.score) candidates.set(set, t);
    }
  }

  // Own index by token set, plus a superset search.
  const ownBySet = new Map<string, SiteTerm>();
  for (const t of own.map.values()) ownBySet.set(tokenSet(t.key), t);
  const ownList = [...own.map.values()].filter((t) => t.ngram >= 2 && t.score >= 2);
  const ownMax = Math.max(1, ...[...own.map.values()].map((t) => t.score));

  const rows: GapRow[] = [];
  for (const [set, term] of candidates) {
    const tokens = set.split(" ");
    const per = comps.map((c) => {
      const t = c.map.get(term.key) ?? [...c.map.values()].find((x) => tokenSet(x.key) === set);
      return { domain: c.profile.domain, term: t ?? null };
    });
    const having = per.filter((p) => p.term && p.term.norm >= 20);
    const prominentOn = per.filter((p) => p.term && isProminent(p.term));
    const compCoverage = Math.max(having.length, prominentOn.length);
    if (term.ngram === 1 && prominentOn.length < 2) continue;
    if (compCoverage === 0) continue;
    const compStrength = having.length ? having.reduce((s, p) => s + (p.term?.norm ?? 0), 0) / having.length : 0;

    let ownTerm = ownBySet.get(set) ?? null;
    if (!ownTerm) {
      const sup = ownList.filter((o) => {
        const ot = new Set(o.key.split(" "));
        return tokens.every((t) => ot.has(t));
      });
      if (sup.length) ownTerm = sup.sort((a, b) => b.score - a.score)[0];
    }
    const ownNorm = ownTerm ? Math.round(clamp(100 * Math.sqrt(ownTerm.score / ownMax))) : 0;
    const ownProm = ownTerm ? isProminent(ownTerm) : false;

    let status: GapStatus;
    if (!ownTerm || ownTerm.score < 1.5) status = "missing";
    else if (!ownProm && ownNorm < 0.45 * Math.max(compStrength, 30)) status = "weak";
    else if (ownProm && ownNorm >= 1.25 * compStrength && compCoverage <= 1) status = "strength";
    else status = "covered";

    const share = compCoverage / comps.length;
    const priority = Math.round(clamp(share * 60 + compStrength * 0.4) * (term.ngram === 1 ? 0.7 : 1));
    const r = rank(term.key);
    rows.push({
      key: term.key,
      label: term.label,
      intent: classifyIntent(term.label, brandList),
      status,
      priority,
      compCoverage,
      compTotal: comps.length,
      compStrength: Math.round(compStrength),
      ownNorm,
      ownPage: ownTerm?.bestPage ?? null,
      competitors: per
        .filter((p) => p.term)
        .map((p) => ({
          domain: p.domain,
          prominent: !!p.term && isProminent(p.term),
          url: p.term?.prominentUrls[0]?.url ?? p.term?.bestPage ?? null,
          title: p.term?.prominentUrls[0]?.title ?? null,
        })),
      position: r.position,
    });
  }
  return rows.sort((a, b) => b.priority - a.priority);
}
