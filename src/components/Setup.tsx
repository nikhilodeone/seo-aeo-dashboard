"use client";

import { useState } from "react";
import { useApp } from "@/lib/client/store";
import type { RunInput } from "@/lib/types";
import { hostOf, inferCountry, normalizeUrlInput } from "@/lib/util";
import { ErrorNotice } from "./shared";
import { Button, Icon, Status } from "./ui";

export const COUNTRIES: [string, string][] = [
  ["auto", "Detect from the site"], ["us", "United States"], ["gb", "United Kingdom"], ["in", "India"], ["au", "Australia"], ["ca", "Canada"],
  ["de", "Germany"], ["fr", "France"], ["sg", "Singapore"], ["ae", "United Arab Emirates"], ["nz", "New Zealand"], ["za", "South Africa"],
  ["ie", "Ireland"], ["nl", "Netherlands"], ["es", "Spain"], ["it", "Italy"], ["br", "Brazil"], ["jp", "Japan"], ["mx", "Mexico"],
];
export const LANGS: [string, string][] = [["en", "English"], ["hi", "Hindi"], ["de", "German"], ["fr", "French"], ["es", "Spanish"], ["pt", "Portuguese"], ["it", "Italian"], ["nl", "Dutch"], ["ja", "Japanese"]];

export interface Options {
  country: string;
  language: string;
  serpBudget: number;
  maxPages: number;
}
export const defaultOptions: Options = { country: "auto", language: "en", serpBudget: 30, maxPages: 15 };

export function RunOptions({ value, onChange, serp }: { value: Options; onChange: (o: Options) => void; serp: boolean }) {
  const set = <K extends keyof Options>(k: K, v: Options[K]) => onChange({ ...value, [k]: v });
  const field = "w-full rounded-md border border-line bg-surface px-3 py-2";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Search country</span>
        <select className={field} value={value.country} onChange={(e) => set("country", e.target.value)}>
          {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Search language</span>
        <select className={field} value={value.language} onChange={(e) => set("language", e.target.value)}>
          {LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
        {value.language !== "en" && <span className="mt-1 block text-xs text-ink-2">Keyword extraction is tuned for English. Other languages work but with noisier results.</span>}
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Pages to read on your site</span>
        <input type="number" min={3} max={25} className={field} value={value.maxPages} onChange={(e) => set("maxPages", Math.min(25, Math.max(3, Number(e.target.value) || 15)))} />
        <span className="mt-1 block text-xs text-ink-2">More pages gives a fuller picture but takes longer. Up to 25.</span>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Google ranking checks</span>
        <input type="number" min={0} max={100} disabled={!serp} className={`${field} disabled:opacity-50`} value={serp ? value.serpBudget : 0} onChange={(e) => set("serpBudget", Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
        <span className="mt-1 block text-xs text-ink-2">{serp ? "Each check uses one search from your Serper plan." : "Turns on when SERPER_API_KEY is set."}</span>
      </label>
    </div>
  );
}

export function optionsToInput(url: string, competitors: string[], o: Options): RunInput {
  const norm = normalizeUrlInput(url) ?? url;
  return {
    // Keep what the person typed: the server tries https first and falls back to http only when no scheme was given.
    url: url.trim(),
    competitors,
    country: o.country === "auto" ? inferCountry(hostOf(norm)) : o.country,
    language: o.language,
    serpBudget: o.serpBudget,
    maxPages: o.maxPages,
    autoDiscover: competitors.length === 0,
  };
}

export function Connections() {
  const { caps } = useApp();
  if (!caps) return null;
  return (
    <ul className="space-y-3 text-sm">
      <li className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">Site and competitor reader</p>
          <p className="text-ink-2">Titles, headings, schema, robots.txt, sitemap, AI crawler rules</p>
        </div>
        <Status tone="good">On</Status>
      </li>
      <li className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">Google rankings and questions</p>
          <p className="text-ink-2">{caps.serp ? "Live positions, People Also Ask, automatic competitors" : "Set SERPER_API_KEY to add live positions, People Also Ask and automatic competitors"}</p>
        </div>
        {caps.serp ? <Status tone="good">On</Status> : <Status tone="neutral">Off</Status>}
      </li>
      <li className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">AI suggestions and briefs</p>
          <p className="text-ink-2">{caps.ai ? "Competitor ideas, question ideas, written briefs" : "Set ANTHROPIC_API_KEY to add competitor ideas, question ideas and written briefs"}</p>
        </div>
        {caps.ai ? <Status tone="good">On</Status> : <Status tone="neutral">Off</Status>}
      </li>
      <li className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">Search Console export</p>
          <p className="text-ink-2">Upload after your first run for real clicks, impressions and positions</p>
        </div>
        <Status tone="neutral">Optional</Status>
      </li>
    </ul>
  );
}

export function Setup() {
  const { run, caps, domains, openDomain, snapshots } = useApp();
  const [url, setUrl] = useState("");
  const [comps, setComps] = useState("");
  const [opts, setOpts] = useState<Options>(defaultOptions);
  const [err, setErr] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const norm = normalizeUrlInput(url);
    if (!norm) {
      setErr("Enter a full website address, like example.com");
      return;
    }
    const list = comps.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean);
    const bad = list.find((c) => !normalizeUrlInput(c));
    if (bad) {
      setErr(`"${bad}" is not a valid competitor address`);
      return;
    }
    setErr(null);
    void run(optionsToInput(url, list, opts));
  };

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl gap-x-16 gap-y-12 px-6 py-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:py-20">
      <div>
        <p className="mb-6 flex items-center gap-2 text-sm font-medium text-ink-2">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--rail)" /><path d="M7 22 13 15l4 4 8-10" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><circle cx="25" cy="9" r="2.5" fill="#fff" /></svg>
          SEO and AEO gap dashboard
        </p>
        <h1 className="max-w-[16ch] text-[2.75rem] font-semibold leading-[1.05] tracking-tight sm:text-5xl">Find what to fix first, in Google and in AI answers</h1>
        <p className="mt-5 max-w-[52ch] text-lg text-ink-2">Paste your website. We read your pages, work out who you compete with, and turn the gaps into a ranked list and a 12-week plan.</p>

        <form onSubmit={submit} className="mt-9 max-w-xl">
          <ErrorNotice />
          <label htmlFor="site" className="mb-1.5 block text-sm font-medium">Your website</label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="site"
              inputMode="url"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="yourcompany.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-invalid={!!err}
              aria-describedby={err ? "site-err" : undefined}
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-4 py-3.5 text-lg placeholder:text-ink-3"
            />
            <Button type="submit" variant="primary" size="lg" disabled={!caps}>
              Analyse site
            </Button>
          </div>
          {err && <p id="site-err" className="mt-2 text-sm text-crit" role="alert">{err}</p>}

          <details className="mt-6 group">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
              <Icon name="chevron" size={14} className="transition-transform group-open:rotate-90" />
              Competitors and options
            </summary>
            <div className="mt-4 space-y-5">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Competitor websites (optional)</span>
                <textarea rows={3} value={comps} onChange={(e) => setComps(e.target.value)} placeholder={"competitor-one.com\ncompetitor-two.com"} className="w-full rounded-md border border-line bg-surface px-3 py-2 placeholder:text-ink-3" />
                <span className="mt-1 block text-xs text-ink-2">
                  Up to 5, separated by spaces, commas or new lines. Leave empty to find them automatically{caps?.serp || caps?.ai ? "" : " (needs a Serper or Anthropic key)"}.
                </span>
              </label>
              <RunOptions value={opts} onChange={setOpts} serp={!!caps?.serp} />
            </div>
          </details>
        </form>

        {domains.length > 0 && (
          <div className="mt-12 max-w-xl border-t border-line pt-5">
            <h2 className="text-sm font-medium text-ink-2">Previous analyses</h2>
            <ul className="mt-2 divide-y divide-line">
              {domains.map((d) => {
                const last = snapshots[d][snapshots[d].length - 1];
                return (
                  <li key={d}>
                    <button onClick={() => openDomain(d)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:text-accent">
                      <span className="font-medium">{d}</span>
                      <span className="text-sm text-ink-2">{new Date(last.collectedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <aside className="lg:pt-24">
        <h2 className="text-lg font-semibold">What you will get</h2>
        <ul className="mt-4 space-y-3 text-ink-2">
          <li><span className="font-medium text-ink">Keyword gaps.</span> Topics your competitors headline that you do not.</li>
          <li><span className="font-medium text-ink">Quick wins.</span> Edits ranked by impact and effort, from page titles to questions you have not answered.</li>
          <li><span className="font-medium text-ink">Answer-engine score.</span> Whether ChatGPT, Perplexity, Claude and Google can read and quote your pages.</li>
          <li><span className="font-medium text-ink">Content briefs.</span> Titles, outlines and questions built from what already ranks.</li>
          <li><span className="font-medium text-ink">A 12-week plan</span> sized to the hours you have.</li>
        </ul>
        <div className="mt-10 border-t border-line pt-5">
          <h2 className="mb-3 text-lg font-semibold">What is connected</h2>
          <Connections />
        </div>
      </aside>
    </main>
  );
}
