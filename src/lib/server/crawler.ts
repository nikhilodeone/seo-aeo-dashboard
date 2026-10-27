import { domainLabel, hostOf, inferCountry, normalizeUrlInput } from "../util";
import { tokenize } from "../text";
import type { PageData, SiteProfile } from "../types";
import { FetchError, safeFetch, userAgent } from "./guard";
import { normalizeLink, parsePage } from "./page-parser";
import { analyseRobots, crawlAllowed } from "./robots";

export interface CrawlOptions {
  maxPages: number;
  deadlineMs: number;
  ignoreRobots?: boolean;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

const looksLikeHtml = (s: string) => /^\s*<(!doctype|html|head|body)/i.test(s);

async function getText(url: string, timeoutMs = 6000): Promise<string | null> {
  try {
    const r = await safeFetch(url, { timeoutMs, maxBytes: 600_000, accept: "text/plain,application/xml,text/xml,*/*;q=0.5" });
    if (r.status !== 200) return null;
    if (looksLikeHtml(r.text)) return null; // SPA fallbacks return index.html for everything
    return r.text;
  } catch {
    return null;
  }
}

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s][^<\]]*?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1].trim());
}

async function readSitemaps(origin: string, declared: string[], deadline: number): Promise<{ urls: string[]; found: boolean; total: number }> {
  const candidates = declared.length ? declared.slice(0, 3) : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  const urls: string[] = [];
  let found = false;
  let total = 0;
  for (const c of candidates) {
    if (Date.now() > deadline) break;
    const xml = await getText(c);
    if (!xml || !/<(urlset|sitemapindex)/i.test(xml)) continue;
    found = true;
    const list = locs(xml);
    if (/<sitemapindex/i.test(xml)) {
      for (const child of list.slice(0, 3)) {
        if (Date.now() > deadline) break;
        const cx = await getText(child);
        if (!cx) continue;
        const cl = locs(cx);
        total += cl.length;
        urls.push(...cl.slice(0, 600));
      }
    } else {
      total += list.length;
      urls.push(...list.slice(0, 1000));
    }
    if (urls.length) break;
  }
  return { urls, found, total };
}

/** Diversify across top-level sections so a 12-page crawl is not twelve blog posts. */
export function pickUrls(candidates: string[], base: string, max: number, exclude: Set<string>): string[] {
  const seen = new Set<string>(exclude);
  const groups = new Map<string, string[]>();
  for (const raw of candidates) {
    const n = normalizeLink(raw, base);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    const seg = new URL(n).pathname.split("/").filter(Boolean)[0] ?? "";
    if (!groups.has(seg)) groups.set(seg, []);
    groups.get(seg)!.push(n);
  }
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length);
  for (const g of ordered) g.sort((a, b) => a.length - b.length);
  const out: string[] = [];
  for (let round = 0; out.length < max; round++) {
    let added = false;
    for (const g of ordered) {
      if (g[round] && out.length < max) {
        out.push(g[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

function brandTokensFor(host: string, pages: PageData[]): string[] {
  const tokens = new Set<string>();
  const label = domainLabel(host);
  if (label.length >= 3) tokens.add(label.toLowerCase());
  // Recurring title suffix, e.g. "Running shoes | Acme Sports" -> acme, sports
  const suffixes = pages
    .map((p) => p.title.split(/\s[|\-–—•·]\s/).slice(1).pop()?.trim().toLowerCase())
    .filter((s): s is string => !!s && s.length > 2);
  const counts = new Map<string, number>();
  for (const s of suffixes) counts.set(s, (counts.get(s) ?? 0) + 1);
  for (const [s, c] of counts) {
    if (c >= Math.max(2, Math.ceil(pages.length * 0.4))) for (const t of tokenize(s)) if (t.length >= 3) tokens.add(t);
  }
  return [...tokens];
}

export async function crawlSite(input: string, opts: CrawlOptions): Promise<SiteProfile> {
  const startUrl = normalizeUrlInput(input);
  if (!startUrl) throw new FetchError("Enter a full website address, like example.com", "invalid");
  const deadline = Date.now() + opts.deadlineMs;
  const errors: string[] = [];
  const ignoreRobots = opts.ignoreRobots ?? process.env.CRAWL_IGNORE_ROBOTS === "true";

  // 1. Home page (also resolves redirects such as example.com -> www.example.com).
  // When the person typed no scheme we try https first and fall back to http for the rare http-only site.
  const hadScheme = /^https?:\/\//i.test(input.trim());
  let home;
  try {
    home = await safeFetch(startUrl, { timeoutMs: 10_000 });
  } catch (e) {
    if (hadScheme || !(e instanceof FetchError) || e.code !== "network") throw e;
    home = await safeFetch(startUrl.replace(/^https:/, "http:"), { timeoutMs: 10_000 });
  }
  if (home.status >= 400) throw new FetchError(`The site answered with HTTP ${home.status}`, "http");
  if (!/html|xml/i.test(home.contentType) && !looksLikeHtml(home.text)) throw new FetchError("That address did not return a web page", "content-type");
  const origin = new URL(home.url).origin;
  const domain = hostOf(origin);

  // 2. robots.txt, llms.txt, sitemap
  const [robotsText, llms] = await Promise.all([getText(`${origin}/robots.txt`), getText(`${origin}/llms.txt`)]);
  const robots = analyseRobots(robotsText);
  const ua = userAgent();
  const canCrawl = (path: string) => ignoreRobots || crawlAllowed(robotsText, ua, path);
  if (robots.blocksAll && !ignoreRobots) errors.push("robots.txt disallows all crawlers; only the home page was analysed.");

  const sm = await readSitemaps(origin, robots.sitemaps, deadline);

  // 3. Pages
  const homeParsed = parsePage(home.text, home.url, home.status);
  const pages: PageData[] = [homeParsed.page];
  const fetched = new Set<string>([home.url.replace(/\/$/, "") || home.url, home.url]);

  const fetchOne = async (url: string) => {
    if (Date.now() > deadline) return;
    const path = new URL(url).pathname;
    if (!canCrawl(path)) {
      errors.push(`Skipped ${path} (blocked by robots.txt)`);
      return;
    }
    try {
      const r = await safeFetch(url, { timeoutMs: 8000 });
      if (r.status >= 400) {
        errors.push(`${path} returned HTTP ${r.status}`);
        return;
      }
      if (!/html/i.test(r.contentType) && !looksLikeHtml(r.text)) return;
      const parsed = parsePage(r.text, r.url, r.status);
      pages.push(parsed.page);
      for (const l of parsed.links) discovered.add(l);
    } catch (e) {
      errors.push(`${path}: ${(e as Error).message}`);
    }
  };

  const discovered = new Set<string>(homeParsed.links);
  if (!robots.blocksAll || ignoreRobots) {
    const wave1 = pickUrls([...sm.urls, ...homeParsed.links], origin, opts.maxPages - 1, fetched);
    wave1.forEach((u) => fetched.add(u));
    await pool(wave1, 4, fetchOne);

    if (pages.length < opts.maxPages && Date.now() < deadline) {
      const wave2 = pickUrls([...discovered], origin, opts.maxPages - pages.length, fetched);
      wave2.forEach((u) => fetched.add(u));
      await pool(wave2, 4, fetchOne);
    }
  }

  const lang = pages.find((p) => p.lang)?.lang ?? null;
  return {
    origin,
    domain,
    fetchedAt: new Date().toISOString(),
    pages,
    robots,
    llmsTxt: llms !== null && llms.trim().length > 10,
    sitemapFound: sm.found,
    sitemapUrls: sm.total,
    brandTokens: brandTokensFor(domain, pages),
    errors: errors.slice(0, 25),
    lang,
    country: inferCountry(domain, lang),
  };
}
