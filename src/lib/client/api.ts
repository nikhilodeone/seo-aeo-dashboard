import type { Capabilities, SerpResult, SiteProfile } from "../types";

const KEY = "seo-aeo:passcode";
let passcode = "";

export function getPasscode(): string {
  if (passcode) return passcode;
  try {
    passcode = sessionStorage.getItem(KEY) ?? "";
  } catch {
    /* storage unavailable */
  }
  return passcode;
}

export function setPasscode(p: string) {
  passcode = p;
  try {
    sessionStorage.setItem(KEY, p);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function call<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", "x-passcode": getPasscode() },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string } & T;
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.code);
  return data;
}

export const getConfig = () => call<Capabilities>("/api/config");
export const crawlSite = (url: string, maxPages: number, signal?: AbortSignal) => call<{ profile: SiteProfile }>("/api/crawl", { url, maxPages }, signal);
export const searchSerp = (queries: string[], gl: string, hl: string) => call<{ results: SerpResult[]; errors: string[] }>("/api/serp", { queries, gl, hl });

export interface DiscoverReply {
  competitors: { domain: string; reason: string }[];
  questions: { q: string; topic: string }[];
}
export const aiDiscover = (p: { domain: string; title: string; topTerms: string[]; country: string }) => call<DiscoverReply>("/api/ai", { task: "discover", ...p });
export const aiQuestions = (topics: string[], country: string) => call<{ questions: { q: string; topic: string }[] }>("/api/ai", { task: "questions", topics, country });

export interface AiBrief {
  titleOptions?: string[];
  metaDescription?: string;
  h1?: string;
  outline?: { h2: string; bullets?: string[] }[];
  answerSnippet?: string;
  faq?: { q: string; a: string }[];
  notes?: string;
}
export const aiBrief = (p: Record<string, unknown>) => call<{ brief: AiBrief }>("/api/ai", { task: "brief", ...p });
