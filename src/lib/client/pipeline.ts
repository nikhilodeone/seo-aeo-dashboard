import { discoveryQueries } from "../analysis/discovery";
import { aggregateSite, candidateTerms, gapAnalysis } from "../analysis/keywords";
import type { RankInfo } from "../analysis/ranks";
import type { AiQuestion, Capabilities, RawData, RunInput, SerpResult, SiteProfile, SuggestedCompetitor } from "../types";
import { hostOf, normalizeUrlInput } from "../util";
import * as api from "./api";

export type StepId = "crawl-own" | "discover" | "crawl-comp" | "serp" | "ai" | "build";
export interface Step {
  id: StepId;
  label: string;
  status: "pending" | "running" | "done" | "skipped" | "error";
  detail?: string;
}

export const STEP_LABELS: Record<StepId, string> = {
  "crawl-own": "Read your site",
  discover: "Find competitors",
  "crawl-comp": "Read competitor sites",
  serp: "Check Google rankings and questions",
  ai: "Ask AI for questions and competitors",
  build: "Score gaps and build the plan",
};

export const initialSteps = (): Step[] =>
  (Object.keys(STEP_LABELS) as StepId[]).map((id) => ({ id, label: STEP_LABELS[id], status: "pending" }));

const BLOCK = [
  "wikipedia.org", "youtube.com", "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "reddit.com", "quora.com",
  "pinterest.com", "medium.com", "github.com", "amazon.com", "amazon.in", "amazon.co.uk", "flipkart.com", "ebay.com", "walmart.com",
  "indeed.com", "glassdoor.com", "justdial.com", "indiamart.com", "myntra.com", "ajio.com", "nykaa.com", "nykaafashion.com", "tatacliq.com",
  "meesho.com", "snapdeal.com", "jiomart.com", "shopclues.com", "etsy.com", "alibaba.com", "aliexpress.com", "olx.in", "sulekha.com",
  "shopify.com", "wordpress.com", "blogspot.com", "ebay.in", "quora.com", "duckduckgo.com", "bing.com", "yahoo.com", "brave.com", "tripadvisor.com", "yelp.com", "trustpilot.com", "forbes.com",
  "nytimes.com", "theguardian.com", "bbc.com", "timesofindia.indiatimes.com", "hindustantimes.com", "economictimes.indiatimes.com",
  "google.com", "apple.com", "play.google.com", "apps.apple.com", "tiktok.com", "vimeo.com", "scribd.com", "slideshare.net",
];
const blocked = (d: string) => BLOCK.some((b) => d === b || d.endsWith(`.${b}`)) || /^amazon\./.test(d);

const noRank = (): RankInfo => ({ position: null, source: null, clicks: null, impressions: null, ctr: null, queries: 0 });
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export interface PipelineHooks {
  onStep: (id: StepId, status: Step["status"], detail?: string) => void;
}

export async function runPipeline(
  input: RunInput,
  caps: Capabilities,
  hooks: PipelineHooks,
  keep?: Pick<RawData, "gsc" | "gscMonths"> | null,
): Promise<RawData> {
  const ownUrl = normalizeUrlInput(input.url);
  if (!ownUrl) throw new Error("Enter a full website address, like example.com");
  const ownHost = hostOf(ownUrl);
  const { onStep } = hooks;

  /* 1. Own site */
  onStep("crawl-own", "running", "Fetching pages, robots.txt and sitemap");
  const own = (await api.crawlSite(input.url.trim(), input.maxPages)).profile;
  onStep("crawl-own", "done", `${own.pages.length} page${own.pages.length === 1 ? "" : "s"} read${own.errors.length ? `, ${own.errors.length} skipped` : ""}`);

  const ownMap = aggregateSite(own);
  const seeds = candidateTerms(ownMap, own.brandTokens)
    .filter((t) => t.ngram >= 2)
    .slice(0, 40)
    .map((t) => t.label);

  const serp: Record<string, SerpResult> = {};
  let budget = caps.serp ? Math.max(0, input.serpBudget) : 0;
  let serpNote = caps.serp ? "" : "Add SERPER_API_KEY to see live rankings, People Also Ask and automatic competitors";
  let serpFailed = false;
  const runSerp = async (queries: string[]) => {
    for (const batch of chunk(queries, 8)) {
      if (serpFailed) return;
      try {
        const r = await api.searchSerp(batch, input.country, input.language);
        for (const res of r.results) serp[res.query.toLowerCase()] = res;
        if (r.errors.length) serpNote = r.errors[0];
      } catch (e) {
        if (e instanceof api.ApiError && e.code === "auth") throw e;
        serpFailed = true;
        serpNote = (e as Error).message;
      }
    }
  };

  const manual = [...new Set(input.competitors.map((c) => normalizeUrlInput(c)).filter((c): c is string => !!c).map(hostOf))].filter((d) => d !== ownHost).slice(0, 5);

  /* 2a. Competitor discovery queries: broad "what you sell + where" searches, run first so a small budget never starves them. */
  const discQueries = !manual.length && input.autoDiscover ? discoveryQueries(ownMap, own.brandTokens, input.country) : [];
  if (caps.serp && discQueries.length) {
    onStep("discover", "running", `Searching Google for who else covers ${discQueries.length} of your topics`);
    await runSerp(discQueries);
  }
  const discSet = new Set(discQueries.map((q) => q.toLowerCase()));

  /* 2b. Rankings for your own keywords (phase A) */
  const phaseA = seeds.slice(0, Math.min(10, Math.max(0, Math.floor(budget * 0.4))));
  if (phaseA.length) {
    onStep("serp", "running", `Checking ${phaseA.length} of your keywords`);
    await runSerp(phaseA);
    budget -= phaseA.length;
  }

  /* 3. Competitors */
  let compDomains: string[] = [];
  let source: RawData["competitorSource"] = "none";
  let aiQs: AiQuestion[] = [];
  const suggested: SuggestedCompetitor[] = [];
  let webNote = "";
  let discovered = false;
  let discoverNote = "";

  // Results for the broad discovery queries count double: they are the ones that surface real rivals.
  const tally = new Map<string, { n: number; sum: number; w: number }>();
  for (const res of Object.values(serp)) {
    const weight = discSet.has(res.query.toLowerCase()) ? 2 : 1;
    for (const o of res.organic.slice(0, 10)) {
      if (o.domain === ownHost || o.domain.endsWith(`.${ownHost}`) || blocked(o.domain)) continue;
      const t = tally.get(o.domain) ?? { n: 0, sum: 0, w: 0 };
      t.n++;
      t.w += weight;
      t.sum += o.position;
      tally.set(o.domain, t);
    }
  }
  const ranked = [...tally.entries()].sort((a, b) => b[1].w - a[1].w || a[1].sum / a[1].n - b[1].sum / b[1].n);
  for (const [domain, t] of ranked.slice(0, 8)) suggested.push({ domain, appearances: t.n, avgPosition: Math.round((t.sum / t.n) * 10) / 10, source: "serp" });

  /* Free fallback when no Serper key: ask a keyless search which sites show up for the site's topics. */
  let webTried = false;
  if (!manual.length && input.autoDiscover && !suggested.length && !caps.serp && caps.discover && seeds.length) {
    webTried = true;
    onStep("discover", "running", "Searching the web for sites that cover your topics");
    try {
      const r = await api.webDiscover(discQueries.length ? discQueries : seeds.slice(0, 6), input.country);
      const wt = new Map<string, { n: number; sum: number }>();
      for (const res of r.results) {
        const seenHere = new Set<string>();
        for (const h of res.hits.slice(0, 10)) {
          const d = h.domain;
          if (!d || d === ownHost || d.endsWith(`.${ownHost}`) || blocked(d) || seenHere.has(d)) continue;
          seenHere.add(d);
          const t = wt.get(d) ?? { n: 0, sum: 0 };
          t.n++;
          t.sum += h.position;
          wt.set(d, t);
        }
      }
      const wr = [...wt.entries()].sort((a, b) => b[1].n - a[1].n || a[1].sum / a[1].n - b[1].sum / b[1].n);
      for (const [domain, t] of wr.slice(0, 8)) suggested.push({ domain, appearances: t.n, avgPosition: Math.round((t.sum / t.n) * 10) / 10, source: "web" });
    } catch (e) {
      if (e instanceof api.ApiError && e.code === "auth") throw e;
      webNote = (e as Error).message;
    }
  }

  onStep("discover", "running");
  if (manual.length) {
    compDomains = manual;
    source = "manual";
    onStep("discover", "done", `Using your ${manual.length} competitor${manual.length === 1 ? "" : "s"}`);
  } else if (input.autoDiscover && suggested.length) {
    const strong = suggested.filter((s) => s.appearances >= 2);  // appearances = number of queries it showed up in
    // Read a few extra candidates; the ones that do not match your topics are dropped after reading.
    const pool = [...strong, ...suggested.filter((s) => !strong.includes(s))];
    compDomains = pool.slice(0, 6).map((s) => s.domain);
    discovered = true;
    source = suggested[0].source === "web" ? "web" : "serp";
    onStep("discover", "done", `Found ${compDomains.length} candidates from ${source === "web" ? "a web search" : "Google results"}`);
  } else if (input.autoDiscover && caps.ai) {
    try {
      const d = await api.aiDiscover({ domain: ownHost, title: own.pages[0]?.title ?? "", topTerms: seeds.slice(0, 12), country: input.country });
      compDomains = d.competitors.map((c) => c.domain).filter((c) => c !== ownHost).slice(0, 4);
      for (const c of d.competitors) suggested.push({ domain: c.domain, appearances: 0, avgPosition: 0, source: "ai", reason: c.reason });
      aiQs = d.questions.map((q) => ({ q: q.q, topic: q.topic }));
      source = compDomains.length ? "ai" : "none";
      onStep("discover", compDomains.length ? "done" : "skipped", compDomains.length ? `AI suggested ${compDomains.length}. Check they are right` : "AI found no competitors");
    } catch (e) {
      if (e instanceof api.ApiError && e.code === "auth") throw e;
      discoverNote = `AI suggestions failed: ${(e as Error).message}`;
      onStep("discover", "skipped", (e as Error).message);
    }
  } else {
    if (input.autoDiscover) discoverNote = webTried ? `The free web search found no usable competitors. ${webNote}`.trim() : caps.serp ? "Google results did not show any clear competitors for your keywords." : "No search or AI key is set, so competitors could not be found automatically.";
    onStep("discover", "skipped", !input.autoDiscover ? "No competitors entered" : webTried ? `${webNote || "The web search found no clear competitors"}. Enter competitor URLs to compare` : "Enter competitor URLs, or add a Serper or Anthropic key to find them automatically");
  }

  /* 4. Competitor sites */
  const competitors: SiteProfile[] = [];
  const competitorErrors: RawData["competitorErrors"] = [];
  if (compDomains.length) {
    onStep("crawl-comp", "running", `Reading ${compDomains.length} site${compDomains.length === 1 ? "" : "s"}`);
    for (const group of chunk(compDomains, 3)) {
      await Promise.all(
        group.map(async (d) => {
          try {
            competitors.push((await api.crawlSite(d, 8)).profile);
          } catch (e) {
            if (e instanceof api.ApiError && e.code === "auth") throw e;
            competitorErrors.push({ domain: d, error: (e as Error).message });
          }
        }),
      );
    }
    competitors.sort((a, b) => compDomains.indexOf(a.domain) - compDomains.indexOf(b.domain));
    if (discovered) {
      // Keep only candidates whose pages are about the same things as yours.
      const words = (p: SiteProfile) => {
        const set = new Set<string>();
        for (const t of candidateTerms(aggregateSite(p), p.brandTokens).slice(0, 60)) for (const w of t.key.split(" ")) if (w.length > 2) set.add(w);
        return set;
      };
      const mine = words(own);
      const scored = competitors.map((c) => {
        const theirs = words(c);
        let shared = 0;
        for (const w of theirs) if (mine.has(w)) shared++;
        return { c, shared, size: theirs.size };
      });
      let keep = scored.filter((x) => x.shared >= 2);
      if (!keep.length) keep = scored.filter((x) => x.shared >= 1).sort((a, b) => b.shared - a.shared).slice(0, 2);
      const kept = new Set(keep.map((x) => x.c.domain));
      const dropped = scored.filter((x) => !kept.has(x.c.domain));
      competitors.length = 0;
      competitors.push(...keep.sort((a, b) => b.shared - a.shared).slice(0, 4).map((x) => x.c));
      for (const d of dropped) competitorErrors.push({ domain: d.c.domain, error: `Left out: its pages do not cover the same topics as yours (${d.shared} words in common).` });
      if (!competitors.length) discoverNote = "Candidates were found but none covers the same topics as your site.";
    }
    onStep("crawl-comp", competitors.length ? "done" : "error", `${competitors.length} read${competitorErrors.length ? `, ${competitorErrors.length} failed` : ""}`);
  } else {
    onStep("crawl-comp", "skipped", "No competitors to read");
  }

  /* 5. Rankings for the keywords competitors have and you lack (phase B) */
  if (budget > 0 && !serpFailed) {
    let queries: string[] = [];
    if (competitors.length) {
      const gaps = gapAnalysis({ profile: own, map: ownMap }, competitors.map((profile) => ({ profile, map: aggregateSite(profile) })), noRank);
      queries = gaps.filter((g) => g.status === "missing" || g.status === "weak").slice(0, Math.min(budget, 16)).map((g) => g.label);
    }
    const spare = budget - queries.length;
    if (spare > 0) queries.push(...seeds.slice(phaseA.length, phaseA.length + spare));
    queries = queries.filter((q) => !serp[q.toLowerCase()]).slice(0, budget);
    if (queries.length) {
      onStep("serp", "running", `Checking ${queries.length} more keywords`);
      await runSerp(queries);
    }
  }
  const nSerp = Object.keys(serp).length;
  onStep("serp", nSerp ? "done" : "skipped", nSerp ? `${nSerp} keywords checked${serpNote ? `. ${serpNote}` : ""}` : serpNote || "No budget set for rankings");

  /* 6. AI questions when Google gave none */
  const hasPaa = Object.values(serp).some((s) => s.paa.length);
  if (caps.ai && !hasPaa && !aiQs.length) {
    onStep("ai", "running");
    try {
      aiQs = (await api.aiQuestions(seeds.slice(0, 8), input.country)).questions;
      onStep("ai", "done", `${aiQs.length} questions suggested`);
    } catch (e) {
      if (e instanceof api.ApiError && e.code === "auth") throw e;
      onStep("ai", "skipped", (e as Error).message);
    }
  } else {
    onStep("ai", "skipped", caps.ai ? "Google already supplied real questions" : "Add ANTHROPIC_API_KEY for AI question ideas");
  }

  return {
    version: 1,
    input: { ...input, url: own.origin },
    collectedAt: new Date().toISOString(),
    own,
    competitors,
    competitorSource: source,
    discoverNote: discoverNote || undefined,
    suggested,
    competitorErrors,
    serp,
    aiQuestions: aiQs,
    gsc: keep?.gsc ?? [],
    gscMonths: keep?.gscMonths ?? 3,
  };
}
