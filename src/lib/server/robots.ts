import { AI_BOTS } from "../text";
import type { BotAccess, RobotsInfo } from "../types";

interface Rule {
  allow: boolean;
  path: string;
}
interface Group {
  agents: string[];
  rules: Rule[];
}

export function parseRobots(text: string): { groups: Group[]; sitemaps: string[] } {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      if (cur && value) cur.rules.push({ allow: key === "allow", path: value });
    } else if (key === "sitemap") {
      if (value) sitemaps.push(value);
    } else {
      lastWasAgent = false;
    }
  }
  return { groups, sitemaps };
}

function patternToRegex(p: string): RegExp {
  const escaped = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped.endsWith("\\$") ? `${escaped.slice(0, -2)}$` : escaped}`);
}

function pickGroup(groups: Group[], ua: string): Group | null {
  const u = ua.toLowerCase();
  const exact = groups.filter((g) => g.agents.some((a) => a !== "*" && u.includes(a)));
  if (exact.length) return exact[0];
  return groups.find((g) => g.agents.includes("*")) ?? null;
}

export function isAllowed(groups: Group[], ua: string, path: string): boolean {
  const g = pickGroup(groups, ua);
  if (!g) return true;
  let best: Rule | null = null;
  for (const r of g.rules) {
    if (!patternToRegex(r.path).test(path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

export function analyseRobots(text: string | null): RobotsInfo {
  if (text === null) return { exists: false, sitemaps: [], bots: Object.fromEntries(AI_BOTS.map((b) => [b, "unspecified" as BotAccess])), blocksAll: false };
  const { groups, sitemaps } = parseRobots(text);
  const bots: Record<string, BotAccess> = {};
  for (const bot of AI_BOTS) {
    const named = groups.filter((g) => g.agents.includes(bot.toLowerCase()));
    if (named.length) {
      bots[bot] = isAllowed(named, bot, "/") ? "allowed" : "blocked";
    } else {
      const star = groups.find((g) => g.agents.includes("*"));
      bots[bot] = star && !isAllowed([star], "*", "/") ? "blocked" : "unspecified";
    }
  }
  const star = groups.find((g) => g.agents.includes("*"));
  const blocksAll = !!star && !isAllowed([star], "*", "/");
  return { exists: true, sitemaps, bots, blocksAll };
}

export function crawlAllowed(text: string | null, ua: string, path: string): boolean {
  if (text === null) return true;
  const { groups } = parseRobots(text);
  return isAllowed(groups, ua, path);
}
