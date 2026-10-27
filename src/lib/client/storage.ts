import type { AiBrief } from "./api";
import type { RawData } from "../types";

const KEY = "seo-aeo:v1";
const MAX_PER_DOMAIN = 4;

export interface Settings {
  hoursPerWeek: number;
  startDate: string | null;
}

export interface Persisted {
  snapshots: Record<string, RawData[]>;
  last: string | null;
  settings: Settings;
  done: Record<string, string[]>;
  aiBriefs: Record<string, AiBrief>;
}

export const defaultSettings: Settings = { hoursPerWeek: 10, startDate: null };

const empty = (): Persisted => ({ snapshots: {}, last: null, settings: defaultSettings, done: {}, aiBriefs: {} });

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw) as Partial<Persisted>;
    return { ...empty(), ...p, settings: { ...defaultSettings, ...(p.settings ?? {}) } };
  } catch {
    return empty();
  }
}

/** Saves, trimming the oldest snapshots if the browser quota is hit. */
export function save(p: Persisted): boolean {
  const attempt = () => {
    localStorage.setItem(KEY, JSON.stringify(p));
  };
  for (let i = 0; i < 12; i++) {
    try {
      attempt();
      return true;
    } catch {
      let oldest: { domain: string; at: string } | null = null;
      for (const [domain, list] of Object.entries(p.snapshots)) {
        if (list.length > 1 && (!oldest || list[0].collectedAt < oldest.at)) oldest = { domain, at: list[0].collectedAt };
      }
      if (!oldest) return false;
      p.snapshots[oldest.domain] = p.snapshots[oldest.domain].slice(1);
    }
  }
  return false;
}

export function pushSnapshot(p: Persisted, raw: RawData): Persisted {
  const domain = raw.own.domain;
  const list = [...(p.snapshots[domain] ?? []), raw].slice(-MAX_PER_DOMAIN);
  return { ...p, snapshots: { ...p.snapshots, [domain]: list }, last: domain };
}
