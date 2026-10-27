import type { SerpResult } from "../types";
import { hostOf } from "../util";

export function serpConfigured(): boolean {
  return Boolean(process.env.SERPER_API_KEY);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function serperSearch(q: string, opts: { gl: string; hl: string }): Promise<SerpResult> {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error("SERPER_API_KEY is not set");
  const num = Math.min(100, Math.max(10, Number(process.env.SERPER_NUM) || 20));
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q, gl: opts.gl, hl: opts.hl, num }),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Serper rejected the API key");
  if (res.status === 429) throw new Error("Serper rate limit or credits exhausted");
  if (!res.ok) throw new Error(`Serper error ${res.status}`);
  const d: any = await res.json();

  const organic = (Array.isArray(d.organic) ? d.organic : [])
    .filter((o: any) => typeof o?.link === "string")
    .map((o: any, i: number) => ({
      position: typeof o.position === "number" ? o.position : i + 1,
      url: o.link as string,
      domain: hostOf(o.link),
      title: String(o.title ?? ""),
      snippet: String(o.snippet ?? ""),
    }));

  const paa = (Array.isArray(d.peopleAlsoAsk) ? d.peopleAlsoAsk : [])
    .filter((p: any) => typeof p?.question === "string")
    .map((p: any) => ({
      question: String(p.question),
      snippet: p.snippet ? String(p.snippet) : undefined,
      domain: typeof p.link === "string" ? hostOf(p.link) : undefined,
    }));

  const related = (Array.isArray(d.relatedSearches) ? d.relatedSearches : [])
    .map((r: any) => (typeof r?.query === "string" ? r.query : null))
    .filter(Boolean) as string[];

  let answerBox: SerpResult["answerBox"];
  if (d.answerBox && typeof d.answerBox === "object") {
    answerBox = {
      domain: typeof d.answerBox.link === "string" ? hostOf(d.answerBox.link) : undefined,
      title: d.answerBox.title ? String(d.answerBox.title) : undefined,
      snippet: d.answerBox.snippet || d.answerBox.answer ? String(d.answerBox.snippet ?? d.answerBox.answer) : undefined,
    };
  }
  return { query: q, organic, paa, related, answerBox };
}
