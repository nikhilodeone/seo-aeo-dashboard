import type { GscRow } from "../types";

/** Minimal RFC-4180 style CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const num = (s: string | undefined) => {
  if (s === undefined) return NaN;
  const t = s.replace(/[\s,%]/g, "");
  return t === "" ? NaN : Number(t);
};

/**
 * Reads a Google Search Console "Queries" export (Performance report > Export > CSV).
 * Columns can be in any order and the header names can be localised in English variants.
 */
export function parseGscCsv(text: string): { rows: GscRow[]; error?: string } {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const table = parseCsv(text, delimiter);
  if (table.length < 2) return { rows: [], error: "The file has no data rows." };
  const header = table[0].map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const idx = (pred: (h: string) => boolean) => header.findIndex(pred);
  const iQ = idx((h) => h.includes("quer") || h.includes("keyword"));
  const iClicks = idx((h) => h === "clicks");
  const iImpr = idx((h) => h.startsWith("impression"));
  const iCtr = idx((h) => h === "ctr");
  const iPos = idx((h) => h.startsWith("position"));
  if (iQ < 0 || iPos < 0 || (iImpr < 0 && iClicks < 0)) {
    return { rows: [], error: "Could not find the columns. Export the Queries table from Search Console (Query, Clicks, Impressions, CTR, Position)." };
  }
  const rows: GscRow[] = [];
  for (const r of table.slice(1)) {
    const query = (r[iQ] ?? "").trim().toLowerCase();
    const position = num(r[iPos]);
    const impressions = iImpr >= 0 ? num(r[iImpr]) : NaN;
    const clicks = iClicks >= 0 ? num(r[iClicks]) : 0;
    if (!query || Number.isNaN(position)) continue;
    let ctr = iCtr >= 0 ? num(r[iCtr]) : NaN;
    if (Number.isNaN(ctr)) ctr = impressions > 0 ? clicks / impressions : 0;
    else if ((r[iCtr] ?? "").includes("%") || ctr > 1) ctr /= 100;
    rows.push({ query, clicks: Number.isNaN(clicks) ? 0 : clicks, impressions: Number.isNaN(impressions) ? 0 : impressions, ctr, position });
  }
  if (!rows.length) return { rows: [], error: "No usable rows found in the file." };
  rows.sort((a, b) => b.impressions - a.impressions);
  return { rows: rows.slice(0, 5000) };
}
