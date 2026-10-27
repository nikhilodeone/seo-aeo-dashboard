export const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));

export function hostOf(input: string): string {
  const raw = input.trim();
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return raw.replace(/^www\./i, "").toLowerCase();
  }
}

/** Accepts "example.com", "www.example.com/path", "https://example.com". Returns a clean https URL or null. */
export function normalizeUrlInput(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

export function sameHost(a: string, b: string): boolean {
  return hostOf(a) === hostOf(b);
}

const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "edu", "ac", "or", "ne", "nic"]);

/** "shop.acmetools.co.uk" -> "acmetools" */
export function domainLabel(host: string): string {
  const parts = host.replace(/^www\./, "").split(".").filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  if (parts.length >= 3 && last.length === 2 && SECOND_LEVEL.has(prev)) return parts[parts.length - 3];
  return prev;
}

const TLD_COUNTRY: Record<string, string> = {
  in: "in", uk: "gb", au: "au", ca: "ca", de: "de", fr: "fr", sg: "sg", ae: "ae", nz: "nz", za: "za",
  ie: "ie", nl: "nl", es: "es", it: "it", br: "br", jp: "jp", mx: "mx", se: "se", ch: "ch", pk: "pk",
  bd: "bd", lk: "lk", my: "my", id: "id", ph: "ph", sa: "sa", ng: "ng", ke: "ke",
};

export function inferCountry(host: string, lang?: string | null): string {
  const tld = host.split(".").pop() ?? "";
  if (TLD_COUNTRY[tld]) return TLD_COUNTRY[tld];
  const region = lang?.split(/[-_]/)[1]?.toLowerCase();
  if (region && region.length === 2) return region;
  return "us";
}

export function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

/** Small stable hash for ids. */
export function hashId(prefix: string, s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${prefix}-${(h >>> 0).toString(36)}`;
}

const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "with"]);
export function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function trimTo(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${cut.slice(0, sp > max * 0.6 ? sp : cut.length).trim()}…`;
}

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}k`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function fmtPos(p: number | null | undefined): string {
  if (p === null || p === undefined) return "–";
  return p < 10 ? p.toFixed(1) : String(Math.round(p));
}

export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url;
  }
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nextMonday(from = new Date()): string {
  const d = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
  const add = ((8 - d.getUTCDay()) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}
