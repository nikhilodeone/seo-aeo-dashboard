import * as cheerio from "cheerio";
import { countWords, extractPhrases, isQuestion, termWeight } from "../text";
import type { PageData, TermStat } from "../types";
import { hostOf, pathOf } from "../util";

const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|ico|css|js|json|xml|zip|rar|gz|mp4|mp3|mov|woff2?|ttf|eot|docx?|xlsx?|pptx?|apk|exe|dmg)$/i;
const SKIP_PATH = /\/(wp-admin|wp-json|wp-login|wp-content|login|signin|sign-in|register|cart|checkout|account|my-account|cdn-cgi|feed|tag|tags|author|search|cookie-policy)(\/|$)/i;

export function normalizeLink(href: string, base: string): string | null {
  let u: URL;
  try {
    u = new URL(href, base);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (hostOf(u.href) !== hostOf(base)) return null;
  if (u.search) return null;
  if (SKIP_EXT.test(u.pathname) || SKIP_PATH.test(u.pathname)) return null;
  u.hash = "";
  let out = u.toString();
  if (out.endsWith("/") && u.pathname !== "/") out = out.slice(0, -1);
  return out;
}

interface LdAcc {
  types: Set<string>;
  sameAs: boolean;
  author: boolean;
  published?: string;
  modified?: string;
}

function walkLd(node: unknown, acc: LdAcc, depth = 0): void {
  if (depth > 8 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) walkLd(n, acc, depth + 1);
    return;
  }
  const o = node as Record<string, unknown>;
  const t = o["@type"];
  if (t) for (const x of Array.isArray(t) ? t : [t]) if (typeof x === "string") acc.types.add(x);
  if (o.sameAs && (!Array.isArray(o.sameAs) || o.sameAs.length)) acc.sameAs = true;
  if (o.author) acc.author = true;
  if (typeof o.datePublished === "string" && !acc.published) acc.published = o.datePublished;
  if (typeof o.dateModified === "string" && !acc.modified) acc.modified = o.dateModified;
  for (const v of Object.values(o)) if (v && typeof v === "object") walkLd(v, acc, depth + 1);
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function buildTerms(parts: { title: string; h1: string[]; h2: string[]; h3: string[]; meta: string; body: string }) {
  const stats = new Map<string, TermStat>();
  const surf = new Map<string, string>();
  const get = (key: string, surface: string) => {
    let s = stats.get(key);
    if (!s) {
      s = { b: 0 };
      stats.set(key, s);
    }
    if (!surf.has(key)) surf.set(key, surface);
    return s;
  };
  for (const p of extractPhrases(parts.title)) get(p.key, p.surface).t = 1;
  for (const h of parts.h1) for (const p of extractPhrases(h)) get(p.key, p.surface).h1 = 1;
  for (const h of parts.h2) {
    const seen = new Set<string>();
    for (const p of extractPhrases(h)) if (!seen.has(p.key)) {
      seen.add(p.key);
      const s = get(p.key, p.surface);
      s.h2 = (s.h2 ?? 0) + 1;
    }
  }
  for (const h of parts.h3) {
    const seen = new Set<string>();
    for (const p of extractPhrases(h)) if (!seen.has(p.key)) {
      seen.add(p.key);
      const s = get(p.key, p.surface);
      s.h3 = (s.h3 ?? 0) + 1;
    }
  }
  for (const p of extractPhrases(parts.meta)) get(p.key, p.surface).m = 1;
  for (const p of extractPhrases(parts.body.slice(0, 40_000))) get(p.key, p.surface).b += 1;

  const ranked = [...stats.entries()]
    .filter(([key, s]) => s.t || s.h1 || s.h2 || s.h3 || s.m || s.b >= 2)
    .map(([key, s]) => [key, s, termWeight(s)] as const)
    .sort((a, b) => b[2] - a[2])
    .slice(0, 90);

  const terms: Record<string, TermStat> = {};
  const surfOut: Record<string, string> = {};
  for (const [key, s] of ranked) {
    terms[key] = s;
    const sf = surf.get(key);
    if (sf && sf !== key) surfOut[key] = sf;
  }
  return { terms, surf: surfOut };
}

export function parsePage(html: string, url: string, status: number): { page: PageData; links: string[] } {
  const $ = cheerio.load(html);
  const scriptCount = $("script").length;
  const hasSpaRoot = $("#__next, #root, #app, #__nuxt").length > 0;

  // Links (whole document, before we strip navigation)
  const host = hostOf(url);
  const links = new Set<string>();
  let internal = 0;
  let external = 0;
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) return;
    try {
      const u = new URL(href, url);
      if (hostOf(u.href) === host) {
        internal++;
        const n = normalizeLink(href, url);
        if (n) links.add(n);
      } else external++;
    } catch {
      /* ignore */
    }
  });

  const images = $("img").length;
  let imagesNoAlt = 0;
  $("img").each((_, im) => {
    if ($(im).attr("alt") === undefined) imagesNoAlt++;
  });

  // Structured data
  const ld: LdAcc = { types: new Set(), sameAs: false, author: false };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walkLd(JSON.parse($(el).contents().text().trim()), ld);
    } catch {
      /* invalid JSON-LD is common; ignore */
    }
  });
  $("[itemtype]").each((_, el) => {
    const t = $(el).attr("itemtype") ?? "";
    const name = t.split("/").pop();
    if (name) ld.types.add(name);
  });

  const title = clean($("title").first().text());
  const metaDescription = clean($('meta[name="description" i]').attr("content") ?? "");
  const canonicalHref = $('link[rel="canonical" i]').attr("href");
  let canonical: string | null = null;
  if (canonicalHref) {
    try {
      canonical = new URL(canonicalHref, url).toString();
    } catch {
      canonical = canonicalHref;
    }
  }
  const robotsMeta = $('meta[name="robots" i]').attr("content") ?? null;
  const lang = $("html").attr("lang") ?? null;
  const viewport = $('meta[name="viewport" i]').length > 0;
  const og = $('meta[property^="og:"]').length >= 2;
  const authorMeta = $('meta[name="author" i]').attr("content") || $('[rel="author"], [itemprop="author"], .author, .byline').length > 0;
  const published =
    ld.published ?? $('meta[property="article:published_time"]').attr("content") ?? $("time[datetime]").first().attr("datetime") ?? null;
  const modified = ld.modified ?? $('meta[property="article:modified_time"]').attr("content") ?? null;

  // Strip noise, then read main content
  $("script, style, noscript, svg, iframe, template, nav, footer, aside, [role='navigation'], [role='contentinfo'], [aria-label*='cookie' i], [id*='cookie' i], [class*='cookie' i]").remove();
  const root = $("main").length ? $("main").first() : $("article").length === 1 ? $("article").first() : $("body");

  const h1 = $("h1").map((_, e) => clean($(e).text())).get().filter(Boolean);
  const h2 = root.find("h2").map((_, e) => clean($(e).text())).get().filter(Boolean);
  const h3 = root.find("h3").map((_, e) => clean($(e).text())).get().filter(Boolean);

  let questionHeadings = 0;
  let answerBlocks = 0;
  root.find("h2, h3, h4").each((_, h) => {
    const text = clean($(h).text());
    if (!text || !isQuestion(text)) return;
    questionHeadings++;
    let n = $(h).next();
    for (let hop = 0; hop < 3 && n.length; hop++) {
      const tag = (n.get(0) as { tagName?: string } | undefined)?.tagName?.toLowerCase() ?? "";
      if (/^h[1-6]$/.test(tag)) break;
      if (tag === "p" || tag === "div") {
        const words = countWords(clean(n.text()));
        if (words >= 25 && words <= 90) answerBlocks++;
        if (words >= 8) break;
      }
      n = n.next();
    }
  });
  root.find("details > summary").each((_, s) => {
    const text = clean($(s).text());
    if (text && isQuestion(text)) {
      questionHeadings++;
      const words = countWords(clean($(s).parent().text().replace(text, "")));
      if (words >= 15 && words <= 120) answerBlocks++;
    }
  });

  let lists = 0;
  root.find("ul, ol").each((_, l) => {
    if ($(l).children("li").length >= 3) lists++;
  });
  const tables = root.find("table").length;

  const bodyText = clean(root.text());
  const wordCount = countWords(bodyText);
  const jsShell = wordCount < 80 && (hasSpaRoot || scriptCount >= 6);

  const { terms, surf } = buildTerms({ title, h1, h2, h3, meta: metaDescription, body: bodyText });

  const path = pathOf(url);
  const page: PageData = {
    url,
    path,
    depth: path === "/" ? 0 : path.split("/").filter(Boolean).length,
    status,
    title,
    metaDescription,
    h1: h1.slice(0, 5),
    h2: h2.slice(0, 25),
    h3: h3.slice(0, 25),
    wordCount,
    canonical,
    lang,
    robotsMeta,
    viewport,
    og,
    schemaTypes: [...ld.types].slice(0, 20),
    hasSameAs: ld.sameAs,
    hasAuthor: Boolean(authorMeta) || ld.author,
    datePublished: published,
    dateModified: modified,
    questionHeadings,
    answerBlocks,
    lists,
    tables,
    images,
    imagesNoAlt,
    internalLinks: internal,
    externalLinks: external,
    jsShell,
    terms,
    surf,
  };
  return { page, links: [...links] };
}
