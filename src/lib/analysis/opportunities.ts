import { tokenSet } from "../text";
import type {
  AeoAudit,
  Confidence,
  GapRow,
  KeywordRow,
  Opportunity,
  OppType,
  Phase,
  QuestionRow,
  RawData,
  SeoAudit,
  SiteProfile,
} from "../types";
import { clamp, fmtNum, hashId, pathOf, trimTo } from "../util";
import { bestPageFor } from "./keywords";
import { ctrAt, ownPositionIn, stemKey } from "./ranks";

export interface OppContext {
  raw: RawData;
  own: SiteProfile;
  seo: SeoAudit;
  aeo: AeoAudit;
  gaps: GapRow[];
  keywords: KeywordRow[];
  questions: QuestionRow[];
  brandTokens: string[];
}

const PHASE: Record<OppType, Phase> = {
  technical: "Foundations",
  "aeo-infra": "Foundations",
  striking: "Quick wins",
  ctr: "Quick wins",
  onpage: "Quick wins",
  snippet: "Quick wins",
  "aeo-question": "Quick wins",
  "content-gap": "Content build",
};

function make(
  o: Omit<Opportunity, "id" | "score" | "quickWin" | "phase"> & { idSeed?: string },
): Opportunity {
  const impact = Math.round(clamp(o.impact));
  const ease = Math.round(clamp(o.ease));
  const { idSeed, ...rest } = o;
  return {
    ...rest,
    impact,
    ease,
    id: hashId(o.type, idSeed ?? `${o.keyword ?? ""}|${o.title}`),
    phase: PHASE[o.type],
    score: Math.round(impact * 0.55 + ease * 0.45),
    quickWin: impact >= 40 && ease >= 60,
  };
}

/** log-scaled: 1 click/mo ~ 19, 10 ~ 43, 100 ~ 70, 1000 ~ 100 */
const fromClicks = (c: number) => clamp(30 * Math.log10(1 + Math.max(0, c)) + 10);

const easeForPosition = (pos: number) => (pos <= 10 ? 88 - (pos - 4) * 2 : pos <= 20 ? 66 - (pos - 11) : pos <= 50 ? 42 : 25);

export function buildOpportunities(ctx: OppContext): Opportunity[] {
  const { raw, own, gaps, keywords, questions } = ctx;
  const out: Opportunity[] = [];
  const months = Math.max(1, raw.gscMonths);
  const usedKeys = new Set<string>();

  /* ---------- 1. Measured: Search Console ---------- */
  if (raw.gsc.length) {
    const rows = raw.gsc.filter((r) => r.impressions / months >= 5);
    const striking = rows
      .filter((r) => r.position >= 4 && r.position <= 20)
      .map((r) => {
        const target = r.position <= 10 ? 3 : 8;
        const extra = (r.impressions / months) * Math.max(0, ctrAt(target) - ctrAt(r.position));
        return { r, extra };
      })
      .sort((a, b) => b.extra - a.extra)
      .slice(0, 14);
    for (const { r, extra } of striking) {
      const page = bestPageFor(r.query, own.pages);
      usedKeys.add(stemKey(r.query));
      out.push(
        make({
          type: "striking",
          title: `Push "${r.query}" from position ${Math.round(r.position)} toward the top 3`,
          keyword: r.query,
          why: "Already on page one or two, so a focused edit can move it without writing anything new.",
          evidence: [
            `Average position ${r.position.toFixed(1)}, ${fmtNum(r.impressions)} impressions, ${r.clicks} clicks (Search Console)`,
            `Moving to position ${r.position <= 10 ? 3 : 8} could add roughly ${Math.max(1, Math.round(extra))} clicks a month`,
          ],
          actions: [
            `Put "${r.query}" in the title tag, H1 and first 100 words of ${page ? pathOf(page) : "the best matching page"}`,
            "Add a section answering the 2 or 3 closest questions people ask, with a direct answer first",
            "Link to this page from 3 related pages using descriptive anchor text",
            "Refresh facts, dates and examples so it is clearly more complete than the pages above it",
          ],
          impact: fromClicks(extra),
          ease: easeForPosition(r.position),
          effortHrs: r.position <= 10 ? 1.5 : 2.5,
          confidence: "measured",
          basis: "Your Search Console impressions and positions. Click gain uses a generic CTR curve, so treat it as an estimate.",
          targetUrl: page,
          extraClicks: Math.round(extra),
        }),
      );
    }
    const lowCtr = rows
      .filter((r) => r.position <= 3 && r.impressions / months >= 20 && r.ctr < ctrAt(r.position) * 0.5)
      .map((r) => ({ r, extra: (r.impressions / months) * (ctrAt(r.position) - r.ctr) }))
      .sort((a, b) => b.extra - a.extra)
      .slice(0, 6);
    for (const { r, extra } of lowCtr) {
      const page = bestPageFor(r.query, own.pages);
      out.push(
        make({
          type: "ctr",
          title: `Rewrite the title and description for "${r.query}"`,
          keyword: r.query,
          why: "You rank well but searchers are not clicking. The snippet is the weak point.",
          evidence: [`Position ${r.position.toFixed(1)} but CTR ${(r.ctr * 100).toFixed(1)}%, about half of what that position usually earns (Search Console)`],
          actions: [
            "Lead the title with the searcher's words, add a concrete benefit or number, keep it under 60 characters",
            "Rewrite the meta description as a one-sentence promise plus a reason to click, under 155 characters",
            "Check the live result. If the snippet shows odd text, set a clear first paragraph or description",
          ],
          impact: fromClicks(extra),
          ease: 88,
          effortHrs: 0.5,
          confidence: "measured",
          basis: "Your Search Console CTR versus a generic CTR curve.",
          targetUrl: page,
          extraClicks: Math.round(extra),
        }),
      );
    }
  }

  /* ---------- 2. Measured: live SERP ranks ---------- */
  for (const k of keywords) {
    if (k.rankSource !== "serp" || usedKeys.has(k.key)) continue;
    if (k.position !== null && k.position >= 4 && k.position <= 20) {
      usedKeys.add(k.key);
      out.push(
        make({
          type: "striking",
          title: `Push "${k.label}" from position ${k.position} toward the top 3`,
          keyword: k.label,
          why: "You already rank on page one or two for a topic central to your site.",
          evidence: [`Position ${k.position} in Google results today`, `Topic strength on your site: ${k.norm}/100`],
          actions: [
            `Make "${k.label}" explicit in the title tag, H1 and opening paragraph`,
            "Add a direct-answer block and 3 to 4 related questions lower on the page",
            "Add internal links from related pages with descriptive anchors",
          ],
          impact: 35 + k.norm * 0.4,
          ease: easeForPosition(k.position),
          effortHrs: 2,
          confidence: "measured",
          basis: "Rank checked in live Google results. No search-volume data, so impact is estimated from how central the topic is to your site.",
          targetUrl: k.bestPage,
        }),
      );
    } else if (k.position === null && k.norm >= 40) {
      usedKeys.add(k.key);
      out.push(
        make({
          type: "onpage",
          title: `"${k.label}" is on your site but you are outside the top 20`,
          keyword: k.label,
          why: "You write about it, but Google does not treat your page as a strong answer.",
          evidence: [`Not found in the top results today`, `Topic strength on your site: ${k.norm}/100`],
          actions: [
            "Compare the top 3 results: what do they cover that you do not?",
            "Make one page the clear home for this topic and point internal links to it",
            "Add the missing sections, examples and a direct-answer block",
          ],
          impact: 30 + k.norm * 0.4,
          ease: 40,
          effortHrs: 4,
          confidence: "measured",
          basis: "Rank checked in live Google results; impact estimated.",
          targetUrl: k.bestPage,
        }),
      );
    }
  }

  /* ---------- 3. Featured answers held by others ---------- */
  for (const res of Object.values(raw.serp)) {
    const ab = res.answerBox;
    const pos = ownPositionIn(res, own.domain);
    if (ab?.domain && ab.domain !== own.domain && pos !== null && pos <= 10) {
      out.push(
        make({
          type: "snippet",
          title: `Win the featured answer for "${res.query}"`,
          keyword: res.query,
          why: "You are on page one, but another site owns the answer box above you.",
          evidence: [`${ab.domain} holds the featured answer; you rank #${pos}`, ab.snippet ? `Their answer: "${trimTo(ab.snippet, 140)}"` : "Their answer format is a paragraph, list or table"],
          actions: [
            "Add a 40 to 55 word direct answer under a heading phrased like the query",
            "Match the format that won: a list for steps, a table for comparisons, a paragraph for definitions",
            "Make your answer more specific than theirs (a number, a condition, a time frame)",
          ],
          impact: 72,
          ease: 62,
          effortHrs: 1.5,
          confidence: "measured",
          basis: "Live Google results.",
          targetUrl: bestPageFor(res.query, own.pages),
        }),
      );
    }
  }

  /* ---------- 4. On-page alignment (crawl) ---------- */
  for (const g of gaps.filter((x) => x.status === "weak").slice(0, 8)) {
    if (usedKeys.has(g.key)) continue;
    usedKeys.add(g.key);
    const prom = g.competitors.filter((c) => c.prominent);
    out.push(
      make({
        type: "onpage",
        title: `Feature "${g.label}" in a title or heading${g.ownPage ? ` on ${pathOf(g.ownPage)}` : ""}`,
        keyword: g.label,
        why: "You mention it, but competitors headline it. Search engines weight titles and headings most.",
        evidence: [
          `${prom.length} of ${g.compTotal} competitors use it in titles or headings (${prom.map((c) => c.domain).slice(0, 3).join(", ")})`,
          `On your site it appears only in body text (strength ${g.ownNorm}/100 vs ${g.compStrength}/100)`,
        ],
        actions: [
          `Work "${g.label}" into the title tag and H1 of ${g.ownPage ? pathOf(g.ownPage) : "the closest page"}, or add an H2 section about it`,
          "Mention it naturally in the first 100 words and in image alt text where accurate",
          "Link to the page from other pages that use the phrase",
        ],
        impact: g.priority,
        ease: 82 - (g.compStrength > 70 ? 10 : 0),
        effortHrs: 1,
        confidence: "crawled",
        basis: "On-page comparison against competitor pages. No search-volume data.",
        targetUrl: g.ownPage,
      }),
    );
  }
  for (const k of keywords.filter((x) => x.norm >= 45 && !x.inTitle && !x.inH1 && !x.inH2 && x.key.includes(" ")).slice(0, 5)) {
    if (usedKeys.has(k.key)) continue;
    usedKeys.add(k.key);
    out.push(
      make({
        type: "onpage",
        title: `You write about "${k.label}" but never headline it`,
        keyword: k.label,
        why: "A topic you clearly care about is invisible in your titles and headings.",
        evidence: [`Strength ${k.norm}/100 in body text across ${k.pages} page${k.pages === 1 ? "" : "s"}, absent from every title, H1 and H2`],
        actions: [`Add "${k.label}" to the title or an H2 on ${k.bestPage ? pathOf(k.bestPage) : "its best page"}`, "Check the page answers the question behind the phrase in its first paragraph"],
        impact: 30 + k.norm * 0.35,
        ease: 80,
        effortHrs: 1,
        confidence: "crawled",
        basis: "Crawl of your own pages.",
        targetUrl: k.bestPage,
      }),
    );
  }

  /* ---------- 5. Content gaps (crawl) ---------- */
  const seenSets = new Set<string>();
  for (const g of gaps.filter((x) => x.status === "missing" && x.intent !== "navigational")) {
    if (out.filter((o) => o.type === "content-gap").length >= 12) break;
    const set = tokenSet(g.key);
    if (seenSets.has(set) || usedKeys.has(g.key)) continue;
    seenSets.add(set);
    const who = g.competitors.filter((c) => c.prominent).map((c) => c.domain);
    const ranks = g.position === null ? [] : [`You rank at position ${g.position} today`];
    out.push(
      make({
        type: "content-gap",
        title: `Create a page for "${g.label}"`,
        keyword: g.label,
        why: `${g.compCoverage} of ${g.compTotal} competitors cover this topic and your site does not.`,
        evidence: [
          `Covered by ${(who.length ? who : g.competitors.map((c) => c.domain)).slice(0, 4).join(", ")}`,
          `Intent looks ${g.intent === "general" ? "mixed" : g.intent}`,
          ...ranks,
        ],
        actions: [
          "Build a page whose title, H1 and URL carry the phrase",
          "Cover the sections the competitor pages share (see the content brief), then add something they lack",
          "Open with a direct answer, add an FAQ block, and add matching schema",
          "Link to it from your home page or a hub page and from 3 related pages",
        ],
        impact: g.priority,
        ease: 36 + (g.compCoverage === 1 ? 10 : 0),
        effortHrs: 6,
        confidence: "crawled",
        basis: "Topics competitors headline that you do not. No search-volume data: check demand before committing to the largest pages.",
        targetUrl: null,
      }),
    );
  }

  /* ---------- 6. AEO questions ---------- */
  const weight = { serp: 62, ai: 46, pattern: 30 } as const;
  const qOpps = questions
    .filter((q) => !q.answered)
    .sort((a, b) => weight[b.source] + b.answeredBy.length * 6 - (weight[a.source] + a.answeredBy.length * 6))
    .slice(0, 10);
  for (const q of qOpps) {
    out.push(
      make({
        type: "aeo-question",
        title: `Answer "${q.q}"`,
        keyword: q.topic,
        why: "Assistants and answer boxes quote pages that state a clear answer to the exact question.",
        evidence: [
          q.source === "serp" ? `Appears in Google's People Also Ask for "${q.topic}"` : q.source === "ai" ? "Suggested by AI as a common question for your topics" : "Generated from your top keywords. Verify demand before writing",
          q.answeredBy.length ? `Competitors already answering it: ${q.answeredBy.join(", ")}` : "No crawled competitor page answers it directly",
        ],
        actions: [
          `Add an H2 or H3 worded as "${q.q}" to the most relevant page`,
          "Answer in 40 to 55 words immediately below, then expand with detail",
          "Mark up visible Q&A with FAQPage schema",
        ],
        impact: weight[q.source] + Math.min(12, q.answeredBy.length * 6),
        ease: 76,
        effortHrs: 1,
        confidence: q.source === "serp" ? "measured" : "estimated",
        basis: q.source === "serp" ? "Live People Also Ask data." : "Not from live search data.",
        targetUrl: bestPageFor(q.topic, own.pages),
        idSeed: q.q,
      }),
    );
  }

  /* ---------- 7. Technical issues (crawl) ---------- */
  const TECH: Record<string, { title: (n: number) => string; impact: number; ease: number; effort: (n: number) => number; action: string; why: string }> = {
    "no-title": { title: (n) => `Add title tags to ${n} page${n > 1 ? "s" : ""}`, impact: 85, ease: 85, effort: (n) => 0.25 * n, action: "Write a unique title under 60 characters that leads with the page's main keyword.", why: "The title tag is the strongest on-page signal and the headline in results." },
    "no-h1": { title: (n) => `Add an H1 to ${n} page${n > 1 ? "s" : ""}`, impact: 60, ease: 85, effort: (n) => 0.25 * n, action: "Add one H1 that states what the page is about in the searcher's words.", why: "The H1 tells engines and readers the page's topic." },
    "title-length": { title: (n) => `Fix title length on ${n} page${n > 1 ? "s" : ""}`, impact: 45, ease: 85, effort: (n) => 0.2 * n, action: "Keep titles between 30 and 60 characters so they are not cut off or too thin to rank.", why: "Long titles are truncated and short titles waste space." },
    "no-meta": { title: (n) => `Write meta descriptions for ${n} page${n > 1 ? "s" : ""}`, impact: 40, ease: 88, effort: (n) => 0.2 * n, action: "Write a 120 to 155 character summary with the keyword and a reason to click.", why: "Descriptions do not rank pages but drive click-through." },
    "dup-title": { title: (n) => `Make ${n} duplicate titles unique`, impact: 55, ease: 80, effort: (n) => 0.25 * n, action: "Give every page its own title that reflects its specific topic.", why: "Duplicate titles make pages compete with each other." },
    thin: { title: (n) => `Expand ${n} thin page${n > 1 ? "s" : ""}`, impact: 55, ease: 40, effort: (n) => 2 * n, action: "Add specifics people need: details, examples, comparisons, FAQs. Or merge the page into a stronger one.", why: "Very short pages rarely rank or get quoted." },
    "img-alt": { title: (n) => `Add alt text on ${n} page${n > 1 ? "s" : ""}`, impact: 35, ease: 80, effort: (n) => 0.3 * n, action: "Describe each meaningful image in a short phrase. Use empty alt only for decoration.", why: "Alt text supports image search and accessibility." },
    "no-viewport": { title: () => "Add a mobile viewport tag", impact: 70, ease: 95, effort: () => 0.25, action: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the template.', why: "Without it, pages render as desktop on phones." },
    noindex: { title: (n) => `Check ${n} page${n > 1 ? "s" : ""} set to noindex`, impact: 90, ease: 90, effort: () => 0.5, action: "If the page should rank, remove the noindex directive.", why: "Noindex pages cannot appear in search results." },
    "js-shell": { title: (n) => `Server-render ${n} page${n > 1 ? "s" : ""} that load content with JavaScript`, impact: 90, ease: 25, effort: () => 16, action: "Use server-side rendering or static generation for pages you want found.", why: "Crawlers, and most AI bots, may see an empty page." },
    https: { title: () => "Serve all pages over HTTPS", impact: 70, ease: 70, effort: () => 2, action: "Install a certificate and redirect HTTP to HTTPS.", why: "HTTPS is a baseline trust and ranking signal." },
    canonical: { title: (n) => `Add canonical URLs to ${n} page${n > 1 ? "s" : ""}`, impact: 30, ease: 85, effort: () => 0.5, action: "Add a self-referencing canonical tag in the template.", why: "Prevents duplicate-URL confusion." },
  };
  const groups = new Map<string, number>();
  for (const p of ctx.seo.pages) for (const i of p.issues) groups.set(i.id, (groups.get(i.id) ?? 0) + 1);
  for (const [id, n] of groups) {
    const t = TECH[id];
    if (!t) continue;
    out.push(
      make({
        type: "technical",
        title: t.title(n),
        why: t.why,
        evidence: [`${n} of ${ctx.seo.pages.length} crawled pages affected`],
        actions: [t.action],
        impact: t.impact,
        ease: t.ease,
        effortHrs: Math.max(0.5, Math.round(t.effort(n) * 2) / 2),
        confidence: "crawled",
        basis: "Direct observation from the crawl.",
        idSeed: id,
      }),
    );
  }
  for (const s of ctx.seo.siteIssues) {
    if (s.id === "no-sitemap") {
      out.push(make({ type: "technical", title: "Publish an XML sitemap", why: "Helps engines discover every page you want indexed.", evidence: [s.message], actions: ["Generate /sitemap.xml, list it in robots.txt and submit it in Search Console."], impact: 50, ease: 80, effortHrs: 1, confidence: "crawled", basis: "Direct observation from the crawl.", idSeed: s.id }));
    } else if (s.id === "robots-block-all") {
      out.push(make({ type: "technical", title: "Stop robots.txt blocking all crawlers", why: "While this stands, nothing on the site can be crawled.", evidence: [s.message], actions: ["Remove 'Disallow: /' for user-agent * unless this is a staging site."], impact: 100, ease: 95, effortHrs: 0.25, confidence: "crawled", basis: "Direct observation from the crawl.", idSeed: s.id }));
    }
  }

  /* ---------- 8. AEO infrastructure ---------- */
  for (const c of ctx.aeo.checks) {
    if (c.ratio >= 0.75) continue;
    out.push(
      make({
        type: "aeo-infra",
        title: `${c.label}: ${c.ratio === 0 ? "missing" : "partly in place"}`,
        why: "Answer engines favour sites they can read, attribute and quote.",
        evidence: [c.detail],
        actions: [c.fix],
        impact: 22 + c.weight * 4.6 * (1 - c.ratio * 0.5),
        ease: c.ease,
        effortHrs: c.effortHrs,
        confidence: "crawled",
        basis: "Direct observation from the crawl. Effect on citations is not guaranteed by any provider.",
        idSeed: c.id,
      }),
    );
  }

  return out.sort((a, b) => b.score - a.score);
}

