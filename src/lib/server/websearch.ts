import * as cheerio from "cheerio";
import { hostOf } from "../util";

/**
 * Keyless, best-effort web search used ONLY to suggest competitors when no Serper key is set.
 * It reads DuckDuckGo's plain-HTML results page. It can be rate-limited or blocked from cloud IPs,
 * so callers must treat failure as normal. Set KEYLESS_SEARCH=false to switch it off.
 * Results are NOT Google positions and are never used as rankings.
 */
export const keylessEnabled = () => process.env.KEYLESS_SEARCH !== "false";

export interface WebHit {
  position: number;
  url: string;
  domain: string;
  title: string;
}

/** Pull real destination URLs out of a DuckDuckGo HTML results page. Exported for tests. */
export function parseDuckHtml(html: string): WebHit[] {
  const $ = cheerio.load(html);
  const hits: WebHit[] = [];
  $("a.result__a").each((_, el) => {
    if (hits.length >= 20) return;
    let href = $(el).attr("href") ?? "";
    if (href.startsWith("//")) href = `https:${href}`;
    try {
      const u = new URL(href, "https://duckduckgo.com");
      const target = u.searchParams.get("uddg");
      const dest = target ? decodeURIComponent(target) : u.href;
      if (!/^https?:\/\//i.test(dest)) return;
      const host = new URL(dest).hostname;
      if (/(^|\.)duckduckgo\.com$/i.test(host)) return; // ads and internal links
      hits.push({ position: hits.length + 1, url: dest, domain: hostOf(dest), title: $(el).text().trim() });
    } catch {
      /* skip malformed result */
    }
  });
  return hits;
}

export async function webSearch(q: string, region: string): Promise<WebHit[]> {
  const kl = /^[a-z]{2}$/i.test(region) ? `${region.toLowerCase()}-en` : "wt-wt";
  let res: Response;
  try {
    res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=${kl}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "text/html",
      "Accept-Language": "en",
    },
    signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error("The free search could not be reached from this server, so it was blocked or offline.");
  }
  const html = await res.text();
  const hits = parseDuckHtml(html);
  if (!hits.length) {
    if (res.status === 202 || res.status === 403 || res.status === 429 || /anomaly|captcha|unusual traffic/i.test(html)) {
      throw new Error("The free search was blocked from this server. Add SERPER_API_KEY or enter competitors yourself.");
    }
    if (!res.ok) throw new Error(`Free search failed (HTTP ${res.status})`);
  }
  return hits;
}
