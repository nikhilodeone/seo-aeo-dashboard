import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildReport } from "@/lib/analysis/report";
import { parseGscCsv } from "@/lib/analysis/gsc";
import { crawlSite } from "@/lib/server/crawler";
import { assertFetchable, FetchError, isPrivateIp, safeFetch } from "@/lib/server/guard";
import { analyseRobots, crawlAllowed } from "@/lib/server/robots";
import type { RawData } from "@/lib/types";
import { compRoutes, ownRoutes, serve } from "./fixtures";

let own: Awaited<ReturnType<typeof serve>>;
let comp: Awaited<ReturnType<typeof serve>>;
let raw: RawData;

beforeAll(async () => {
  process.env.ALLOW_PRIVATE_HOSTS = "true";
  own = await serve("127.0.0.1", ownRoutes);
  comp = await serve("127.0.0.2", compRoutes);

  const [a, b] = await Promise.all([
    crawlSite(own.origin, { maxPages: 10, deadlineMs: 20_000 }),
    crawlSite(comp.origin, { maxPages: 10, deadlineMs: 20_000 }),
  ]);
  raw = {
    version: 1,
    input: { url: own.origin, competitors: [comp.origin], country: "in", language: "en", serpBudget: 0, maxPages: 10, autoDiscover: false },
    collectedAt: new Date().toISOString(),
    own: a,
    competitors: [b],
    competitorSource: "manual",
    suggested: [],
    competitorErrors: [],
    serp: {},
    aiQuestions: [],
    gsc: [],
    gscMonths: 3,
  };
});

afterAll(async () => {
  await own?.close();
  await comp?.close();
});

describe("crawler", () => {
  it("reads pages, robots and sitemap from a real HTTP site", () => {
    expect(raw.own.pages.length).toBeGreaterThanOrEqual(4);
    expect(raw.own.sitemapFound).toBe(true);
    expect(raw.own.robots.bots["GPTBot"]).toBe("blocked");
    expect(raw.own.robots.bots["PerplexityBot"]).toBe("unspecified");
    expect(raw.competitors[0].robots.bots["PerplexityBot"]).toBe("blocked");
  });
  it("ignores SPA fallbacks for llms.txt and accepts real ones", () => {
    expect(raw.own.llmsTxt).toBe(false);
    expect(raw.competitors[0].llmsTxt).toBe(true);
  });
  it("extracts schema, question headings and answer blocks", () => {
    const page = raw.competitors[0].pages.find((p) => p.path === "/electric-bikes")!;
    expect(page.schemaTypes).toContain("FAQPage");
    expect(page.hasSameAs).toBe(true);
    expect(page.questionHeadings).toBe(2);
    expect(page.answerBlocks).toBe(2);
    expect(page.lists).toBe(1);
  });
  it("blocks private addresses when not in dev mode", async () => {
    process.env.ALLOW_PRIVATE_HOSTS = "false";
    try {
      await expect(safeFetch(`${own.origin}/`)).rejects.toBeInstanceOf(FetchError);
      expect(() => assertFetchable("http://169.254.169.254/latest/meta-data")).toThrow();
      expect(() => assertFetchable("http://localhost/")).toThrow();
      expect(() => assertFetchable("ftp://example.com/")).toThrow();
    } finally {
      process.env.ALLOW_PRIVATE_HOSTS = "true";
    }
  });
  it("classifies private IPs", () => {
    for (const ip of ["10.0.0.1", "172.20.1.1", "192.168.0.5", "127.0.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"]) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"]) expect(isPrivateIp(ip)).toBe(false);
  });
});

describe("robots", () => {
  it("applies longest-match Allow/Disallow", () => {
    const txt = "User-agent: *\nDisallow: /private\nAllow: /private/public\n";
    expect(crawlAllowed(txt, "SEOGapBot", "/private/x")).toBe(false);
    expect(crawlAllowed(txt, "SEOGapBot", "/private/public/a")).toBe(true);
    expect(crawlAllowed(txt, "SEOGapBot", "/open")).toBe(true);
  });
  it("inherits a wildcard block for AI bots", () => {
    const r = analyseRobots("User-agent: *\nDisallow: /\n");
    expect(r.blocksAll).toBe(true);
    expect(r.bots["OAI-SearchBot"]).toBe("blocked");
  });
});

describe("report", () => {
  it("finds the electric bike content gap", () => {
    const r = buildReport(raw, { hoursPerWeek: 10, startDate: "2026-11-02" });
    const gap = r.gaps.find((g) => g.key.includes("electric bike"));
    expect(gap?.status).toBe("missing");
    expect(r.opportunities.some((o) => o.type === "content-gap" && /electric bike/.test(o.keyword ?? ""))).toBe(true);
  });
  it("flags road bike as weak: present in body, headlined by the competitor", () => {
    const r = buildReport(raw, { hoursPerWeek: 10 });
    const g = r.gaps.find((x) => x.key === "road bike");
    expect(g).toBeTruthy();
    expect(["weak", "covered"]).toContain(g!.status);
  });
  it("scores AEO higher for the site built for it", () => {
    const r = buildReport(raw, { hoursPerWeek: 10 });
    expect(r.competitorAeo[0].score).toBeGreaterThan(r.ownAeo.score);
    expect(r.ownAeo.checks.find((c) => c.id === "ai-crawlers")!.ratio).toBe(1);
    expect(r.competitors[0].retrievalBotsBlocked).toContain("PerplexityBot");
  });
  it("never schedules more hours than capacity", () => {
    const r = buildReport(raw, { hoursPerWeek: 6, startDate: "2026-11-02" });
    for (const w of r.plan.weeks) expect(w.hours).toBeLessThanOrEqual(6 + 1e-6);
    expect(r.plan.tasks.every((t) => t.startWeek >= 1 && t.endWeek <= 12)).toBe(true);
  });
  it("builds a brief from competitor headings", () => {
    const r = buildReport(raw, { hoursPerWeek: 10 });
    const b = r.briefs.find((x) => /electric bike/.test(x.keyword));
    expect(b).toBeTruthy();
    expect(b!.outline.some((o) => o.source === "competitor")).toBe(true);
    expect(b!.titleOptions.every((t) => t.length <= 60)).toBe(true);
  });
  it("turns Search Console rows into measured striking-distance wins", () => {
    const csv = "Top queries,Clicks,Impressions,CTR,Position\nroad bikes for beginners,12,2400,0.5%,8.2\nbicycle repair,40,900,4.4%,2.1\n";
    const { rows, error } = parseGscCsv(csv);
    expect(error).toBeUndefined();
    const r = buildReport({ ...raw, gsc: rows }, { hoursPerWeek: 10 });
    const s = r.opportunities.find((o) => o.type === "striking");
    expect(s?.confidence).toBe("measured");
    expect(s?.extraClicks).toBeGreaterThan(0);
    expect(r.keywords.some((k) => k.rankSource === "gsc")).toBe(true);
  });
});

describe("gsc csv", () => {
  it("handles quotes, semicolons and percent CTR", () => {
    const { rows } = parseGscCsv('Query;Clicks;Impressions;CTR;Position\n"best, bikes";3;100;3,0%;9.5\n'.replace("3,0%", "3.0%"));
    expect(rows[0]).toMatchObject({ query: "best, bikes", clicks: 3, impressions: 100, position: 9.5 });
    expect(rows[0].ctr).toBeCloseTo(0.03);
  });
  it("reports a helpful error for the wrong file", () => {
    expect(parseGscCsv("a,b\n1,2").error).toMatch(/columns/);
  });
});
