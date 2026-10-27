import { tokenSet, AI_RETRIEVAL_BOTS } from "../text";
import type { CompetitorSummary, RawData, Report } from "../types";
import { median, nextMonday } from "../util";
import { auditAeo } from "./aeo";
import { buildBriefs } from "./briefs";
import { aggregateSite, buildKeywordRows, candidateTerms, gapAnalysis } from "./keywords";
import { buildOpportunities } from "./opportunities";
import { buildPlan } from "./plan";
import { buildQuestions } from "./questions";
import { makeRankLookup } from "./ranks";
import { auditSeo } from "./technical";

export interface ReportSettings {
  hoursPerWeek: number;
  startDate?: string;
}

/** Pure and deterministic: the same collected data always yields the same report. */
export function buildReport(raw: RawData, settings: ReportSettings, prev?: RawData | null): Report {
  const ownMap = aggregateSite(raw.own);
  const comps = raw.competitors.map((profile) => ({ profile, map: aggregateSite(profile) }));
  const brandTokens = [...new Set([...raw.own.brandTokens, ...comps.flatMap((c) => c.profile.brandTokens)])];

  const rank = makeRankLookup(raw);
  const prevRank = prev ? makeRankLookup(prev) : undefined;
  const keywords = buildKeywordRows(ownMap, raw.own.brandTokens, rank, prevRank);
  const gaps = gapAnalysis({ profile: raw.own, map: ownMap }, comps, rank);

  const ownSeo = auditSeo(raw.own);
  const ownAeo = auditAeo(raw.own);
  const competitorSeo = raw.competitors.map(auditSeo);
  const competitorAeo = raw.competitors.map(auditAeo);

  const questions = buildQuestions(raw, keywords.filter((k) => k.intent !== "navigational").map((k) => ({ label: k.label, intent: k.intent })));
  const opportunities = buildOpportunities({ raw, own: raw.own, seo: ownSeo, aeo: ownAeo, gaps, keywords, questions, brandTokens });
  const briefs = buildBriefs(opportunities, raw.own, raw.competitors, questions, brandTokens);
  const plan = buildPlan(opportunities, settings.hoursPerWeek, settings.startDate ?? nextMonday());

  const competitorKeySets = comps.map((c) => new Set(candidateTerms(c.map, brandTokens).slice(0, 120).map((t) => tokenSet(t.key))));
  const ownKeySet = new Set(candidateTerms(ownMap, brandTokens).slice(0, 120).map((t) => tokenSet(t.key)));
  const competitors: CompetitorSummary[] = comps.map((c, i) => {
    let shared = 0;
    for (const k of competitorKeySets[i]) if (ownKeySet.has(k)) shared++;
    const inner = c.profile.pages.filter((p) => p.depth > 0);
    return {
      domain: c.profile.domain,
      pages: c.profile.pages.length,
      seoScore: competitorSeo[i].score,
      aeoScore: competitorAeo[i].score,
      medianWords: median((inner.length ? inner : c.profile.pages).map((p) => p.wordCount)),
      topTerms: candidateTerms(c.map, brandTokens).slice(0, 6).map((t) => t.label),
      sharedKeywords: shared,
      schemaTypes: [...new Set(c.profile.pages.flatMap((p) => p.schemaTypes))].slice(0, 8),
      retrievalBotsBlocked: AI_RETRIEVAL_BOTS.filter((b) => c.profile.robots.bots[b] === "blocked"),
    };
  });

  const covered = new Set(keywords.map((k) => tokenSet(k.key)));
  const ideas: Report["ideas"] = [];
  const seenIdea = new Set<string>();
  for (const res of Object.values(raw.serp)) {
    for (const q of res.related) {
      const k = tokenSet(q.toLowerCase());
      if (seenIdea.has(k) || covered.has(k)) continue;
      seenIdea.add(k);
      ideas.push({ query: q, from: res.query });
    }
  }

  const differentiators = comps.length
    ? keywords.filter((k) => k.norm >= 35 && k.key.includes(" ") && competitorKeySets.every((s) => !s.has(tokenSet(k.key)))).slice(0, 8)
    : [];

  return {
    generatedAt: new Date().toISOString(),
    domain: raw.own.domain,
    hasSerp: Object.keys(raw.serp).length > 0,
    hasGsc: raw.gsc.length > 0,
    hasCompetitors: comps.length > 0,
    ownSeo,
    ownAeo,
    competitorSeo,
    competitorAeo,
    competitors,
    keywords,
    gaps,
    differentiators,
    ideas: ideas.slice(0, 40),
    questions,
    opportunities,
    briefs,
    plan,
    topTerms: keywords.slice(0, 12).map((k) => k.label),
  };
}

