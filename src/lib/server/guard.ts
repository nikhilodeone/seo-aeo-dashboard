import { createHash, timingSafeEqual } from "node:crypto";
import dns from "node:dns";
import net from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/* ------------------------------------------------------------------ */
/* Passcode                                                            */
/* ------------------------------------------------------------------ */

export function isAuthorized(req: Request): boolean {
  const pass = process.env.DASHBOARD_PASSCODE;
  if (!pass) return true;
  const got = req.headers.get("x-passcode") ?? "";
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(pass).digest();
  return timingSafeEqual(a, b);
}

/** Returns a 401 response when the deployment is passcode-protected and the header is wrong. */
export function requireAuth(req: Request): Response | null {
  if (isAuthorized(req)) return null;
  return Response.json({ error: "Passcode required.", code: "auth" }, { status: 401 });
}

export function badRequest(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

/* ------------------------------------------------------------------ */
/* SSRF protection                                                     */
/* ------------------------------------------------------------------ */

const allowPrivate = () => process.env.ALLOW_PRIVATE_HOSTS === "true";

export function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    if (x.startsWith("::ffff:")) {
      const tail = x.slice(7);
      if (net.isIP(tail) === 4) return isPrivateIp(tail);
      return true; // hex-form mapped address: refuse rather than parse
    }
    return (
      x.startsWith("fc") ||
      x.startsWith("fd") ||
      x.startsWith("fe8") ||
      x.startsWith("fe9") ||
      x.startsWith("fea") ||
      x.startsWith("feb") ||
      x.startsWith("ff") ||
      x.startsWith("64:ff9b:")
    );
  }
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function guardedLookup(hostname: string, options: any, callback: any) {
  dns.lookup(hostname, { ...(options ?? {}), all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as unknown as dns.LookupAddress[];
    if (!list.length) return callback(new Error("No address found"), "", 0);
    if (!allowPrivate() && list.some((a) => isPrivateIp(a.address))) {
      return callback(new Error("Blocked: address is not public"), "", 0);
    }
    if (options && options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

// The lookup runs at connection time, so DNS rebinding cannot swap in a private address after validation.
const agent = new Agent({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connect: { lookup: guardedLookup as any, timeout: 8000 },
  headersTimeout: 10_000,
  bodyTimeout: 15_000,
});

export class FetchError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

export function assertFetchable(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new FetchError("Not a valid URL", "invalid");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new FetchError("Only http(s) URLs are allowed", "scheme");
  if (u.username || u.password) throw new FetchError("URLs with credentials are not allowed", "credentials");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!allowPrivate()) {
    if (host === "localhost" || /\.(localhost|local|internal|lan|home|corp)$/.test(host)) {
      throw new FetchError("That address is not a public website", "private");
    }
    if (net.isIP(host) && isPrivateIp(host)) throw new FetchError("That address is not a public website", "private");
    if (u.port && !["80", "443", "8080", "8443"].includes(u.port)) throw new FetchError("Unusual port blocked", "port");
  }
  return u;
}

export interface FetchResult {
  status: number;
  url: string;
  contentType: string;
  text: string;
  truncated: boolean;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  accept?: string;
}

export function userAgent(): string {
  return (
    process.env.CRAWLER_USER_AGENT ||
    "Mozilla/5.0 (compatible; SEOGapBot/1.0; +https://github.com/your-username/seo-aeo-dashboard)"
  );
}

export async function safeFetch(url: string, opts: SafeFetchOptions = {}): Promise<FetchResult> {
  const { timeoutMs = 9000, maxBytes = 1_500_000, accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5" } = opts;
  let current = url;
  for (let hop = 0; hop <= 5; hop++) {
    const u = assertFetchable(current);
    let res;
    try {
      res = await undiciFetch(u.toString(), {
        dispatcher: agent,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": userAgent(), accept, "accept-language": "en" },
      });
    } catch (e) {
      const err = e as Error & { cause?: Error };
      const msg = err.cause?.message || err.message || "Network error";
      if (/Blocked: address/.test(msg)) throw new FetchError("That address is not a public website", "private");
      if (err.name === "TimeoutError" || err.name === "AbortError") throw new FetchError("The site took too long to respond", "timeout");
      throw new FetchError(msg, "network");
    }
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.body?.cancel().catch(() => undefined);
      current = new URL(loc, u).toString();
      continue;
    }
    const { text, truncated } = await readCapped(res.body, maxBytes);
    return { status: res.status, url: u.toString(), contentType: res.headers.get("content-type") ?? "", text, truncated };
  }
  throw new FetchError("Too many redirects", "redirects");
}

async function readCapped(body: { getReader(): ReadableStreamDefaultReader<Uint8Array> } | null, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  if (!body) return { text: "", truncated: false };
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let total = 0;
  let text = "";
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (total >= maxBytes) {
        truncated = true;
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
    text += decoder.decode();
  } catch (e) {
    const err = e as Error;
    if (!text) throw new FetchError(err.name === "TimeoutError" ? "The site took too long to respond" : err.message, "read");
    truncated = true;
  }
  return { text, truncated };
}
