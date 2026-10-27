import { stem, tokenize } from "../text";
import type { GscRow, RankSource, RawData, SerpResult } from "../types";

export interface RankInfo {
  position: number | null;
  source: RankSource | null;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  queries: number;
}

export const stemKey = (q: string) => tokenize(q).map(stem).join(" ");

export function ownPositionIn(result: SerpResult | undefined, ownDomain: string): number | null {
  if (!result) return null;
  const hit = result.organic.find((o) => o.domain === ownDomain || o.domain.endsWith(`.${ownDomain}`));
  return hit ? hit.position : null;
}

/** CTR by position, a generic organic curve. Used only for relative sizing, never presented as measured. */
export function ctrAt(pos: number): number {
  const table = [0, 0.285, 0.157, 0.11, 0.08, 0.062, 0.049, 0.04, 0.033, 0.028, 0.024];
  if (pos <= 1) return table[1];
  if (pos <= 10) {
    const lo = Math.floor(pos);
    const f = pos - lo;
    return table[lo] * (1 - f) + (table[Math.min(10, lo + 1)] ?? table[10]) * f;
  }
  return Math.max(0.004, 0.015 - (pos - 11) * 0.001);
}

export function makeRankLookup(raw: Pick<RawData, "gsc" | "serp" | "own">): (key: string) => RankInfo {
  const gsc = raw.gsc.map((r: GscRow) => ({ r, k: ` ${stemKey(r.query)} ` }));
  const serp = new Map<string, SerpResult>();
  for (const res of Object.values(raw.serp)) serp.set(stemKey(res.query), res);
  const own = raw.own.domain;

  return (key: string): RankInfo => {
    const needle = ` ${key} `;
    let impressions = 0;
    let clicks = 0;
    let weighted = 0;
    let queries = 0;
    for (const { r, k } of gsc) {
      if (!k.includes(needle)) continue;
      impressions += r.impressions;
      clicks += r.clicks;
      weighted += r.position * Math.max(1, r.impressions);
      queries++;
    }
    if (queries) {
      const denom = gsc.reduce((s, { r, k }) => (k.includes(needle) ? s + Math.max(1, r.impressions) : s), 0);
      return {
        position: Math.round((weighted / denom) * 10) / 10,
        source: "gsc",
        clicks,
        impressions,
        ctr: impressions ? clicks / impressions : null,
        queries,
      };
    }
    const res = serp.get(key);
    if (res) return { position: ownPositionIn(res, own), source: "serp", clicks: null, impressions: null, ctr: null, queries: 1 };
    return { position: null, source: null, clicks: null, impressions: null, ctr: null, queries: 0 };
  };
}
