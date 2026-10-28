"use client";

import { useRef, useState } from "react";
import { parseGscCsv } from "@/lib/analysis/gsc";
import { download } from "@/lib/client/export";
import { useApp } from "@/lib/client/store";
import { Connections, defaultOptions, optionsToInput, RunOptions, type Options } from "../Setup";
import { Button, Disclosure, Icon, Notice, PageHeader, Section, Status } from "../ui";

export function DataView() {
  const { raw, report, setGsc, clearGsc, run, running, caps, snapshots, domains, deleteDomain, openDomain, importRaw } = useApp();
  const [months, setMonths] = useState(raw?.gscMonths ?? 3);
  const [gscMsg, setGscMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [impMsg, setImpMsg] = useState<string | null>(null);
  const [opts, setOpts] = useState<Options>(() => (raw ? { country: raw.input.country, language: raw.input.language, serpBudget: raw.input.serpBudget, maxPages: raw.input.maxPages } : defaultOptions));
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  if (!raw || !report) return null;

  const onGsc = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 8_000_000) {
      setGscMsg({ ok: false, text: "That file is over 8 MB. Export the Queries table only." });
      return;
    }
    const { rows, error } = parseGscCsv(await f.text());
    if (error) setGscMsg({ ok: false, text: error });
    else {
      setGsc(rows, months);
      setGscMsg({ ok: true, text: `Loaded ${rows.length} queries. Opportunities and keyword positions now use your real data.` });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-10">
      <PageHeader title="Data and settings" lead="What feeds this dashboard, how to add real search data, and where your analyses are kept." />

      <Section title="Connections">
        <div className="max-w-2xl">
          <Connections />
        </div>
        {(!caps?.serp || !caps?.ai) && (
          <div className="mt-5 max-w-2xl">
            <Disclosure summary="How to switch on the other connections">
              <ol className="list-decimal space-y-2 pl-5">
                <li>In Vercel, open your project, then Settings, then Environment Variables.</li>
                <li>Add <code className="rounded bg-plane px-1">SERPER_API_KEY</code> for Google rankings and People Also Ask, and <code className="rounded bg-plane px-1">ANTHROPIC_API_KEY</code> for AI briefs. Add <code className="rounded bg-plane px-1">DASHBOARD_PASSCODE</code> so only you can use them.</li>
                <li>Redeploy. Locally, put the same lines in a <code className="rounded bg-plane px-1">.env.local</code> file.</li>
              </ol>
            </Disclosure>
          </div>
        )}
      </Section>

      <Section title="Google Search Console" lead="The most valuable thing you can add. It replaces estimates with your real impressions, clicks and positions, and unlocks striking-distance and low-click-rate fixes.">
        <div className="max-w-2xl space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-ink-2">
            <li>In Search Console, open Performance and set the date range (3 months works well).</li>
            <li>Under Queries, choose Export, then Download CSV. Use the file called Queries.csv.</li>
            <li>Upload it here. It stays in your browser.</li>
          </ol>
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <label className="block">
              <span className="mb-1 block font-medium">Months covered</span>
              <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="rounded-md border border-line bg-surface px-3 py-2">
                {[1, 3, 6, 12, 16].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <input ref={fileRef} id="gsc" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onGsc(e.target.files?.[0])} />
            <Button onClick={() => fileRef.current?.click()}>
              <Icon name="download" size={14} className="rotate-180" />
              {raw.gsc.length ? "Replace file" : "Upload Queries.csv"}
            </Button>
            {raw.gsc.length > 0 && (
              <>
                <Status tone="good">{raw.gsc.length} queries loaded</Status>
                <Button size="sm" variant="ghost" onClick={() => { clearGsc(); setGscMsg(null); }}>Remove</Button>
              </>
            )}
          </div>
          {gscMsg && <p className={gscMsg.ok ? "text-sm text-good-ink" : "text-sm text-crit"} role="status">{gscMsg.text}</p>}
        </div>
      </Section>

      <Section title="Run again" lead="Reads your site and competitors afresh. Your Search Console data and plan progress are kept, and position arrows compare with the previous run.">
        <div className="max-w-2xl space-y-5">
          <RunOptions value={opts} onChange={setOpts} serp={!!caps?.serp} />
          <Button
            variant="primary"
            disabled={running}
            onClick={() => {
              const input = optionsToInput(raw.input.url, raw.competitors.map((c) => c.domain), opts, raw.input.context ?? "");
              void run({ ...input, autoDiscover: raw.competitors.length === 0 });
            }}
          >
            <Icon name="refresh" size={14} />
            Re-run analysis
          </Button>
        </div>
      </Section>

      <Section title="Saved analyses" lead="Stored in this browser only. The last 4 runs per site are kept so you can see progress.">
        <ul className="divide-y divide-line border-y border-line text-sm">
          {domains.map((d) => (
            <li key={d} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div>
                <p className="font-medium">{d}{d === raw.own.domain && <span className="ml-2 text-xs text-accent">open</span>}</p>
                <p className="text-ink-2">{snapshots[d].length} run{snapshots[d].length === 1 ? "" : "s"}, latest {new Date(snapshots[d][snapshots[d].length - 1].collectedAt).toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                {d !== raw.own.domain && <Button size="sm" onClick={() => openDomain(d)}>Open</Button>}
                <Button size="sm" onClick={() => download(`${d}-analysis.json`, JSON.stringify(snapshots[d][snapshots[d].length - 1], null, 1), "application/json")}>Export</Button>
                <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete all saved runs for ${d}?`)) deleteDomain(d); }}>Delete</Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center gap-3 text-sm">
          <input ref={importRef} type="file" accept="application/json,.json" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImpMsg(importRaw(await f.text())); if (importRef.current) importRef.current.value = ""; }} />
          <Button size="sm" onClick={() => importRef.current?.click()}>Import an export</Button>
          {impMsg && <span className="text-crit" role="alert">{impMsg}</span>}
        </div>
      </Section>

      <Section title="How the scores work">
        <div className="max-w-3xl space-y-3">
          <Disclosure summary="Impact, ease and score">
            <ul className="list-disc space-y-1.5 pl-5">
              <li><b>Impact</b> (0 to 100). With Search Console data: estimated extra monthly clicks from moving up, using a generic click-through curve, shown on a log scale. Without it: how many competitors lean on the topic and how strongly, which is a proxy for relevance, not search volume.</li>
              <li><b>Ease</b> (0 to 100). Higher for edits to existing pages and for keywords already ranking 4 to 10. Lower for new pages and for keywords outside the top 20.</li>
              <li><b>Score</b> = 55% impact + 45% ease. A <b>quick win</b> has impact of at least 40 and ease of at least 60.</li>
            </ul>
          </Disclosure>
          <Disclosure summary="Keyword strength and gaps">
            <p>Each phrase gets points where it appears on a page: title 5, H1 5, each H2 2.5 (up to 2), each H3 1 (up to 2), meta description 2, and 0.4 per body mention (up to 6). Points are summed across pages and scaled 0 to 100 within each site. A gap is a phrase competitors headline that your site lacks (missing) or only mentions in body text (weak). Brand names and near-duplicate phrases are removed. Single words only count if they headline pages.</p>
          </Disclosure>
          <Disclosure summary="Answer-engine readiness">
            <p>A weighted checklist: AI search crawlers allowed (15), content in server HTML (12), question headings (12), direct answers (12), structured data coverage (10), entity schema (8), content-type schema (8), author and dates (8), content depth (7), quotable lists and tables (6), llms.txt (2). It describes how easy your pages are to read and quote. It does not measure actual citations.</p>
          </Disclosure>
          <Disclosure summary="Site health">
            <p>Each page starts at 100 and loses 25 per critical issue, 10 per warning and 3 per note. The site score is the average, minus a small penalty for site-wide problems such as a missing sitemap.</p>
          </Disclosure>
          <Notice title="What this tool cannot see">
            Search volume and keyword difficulty need a paid keyword database, so they are not shown. JavaScript-rendered content is read as crawlers without JavaScript would see it. Only a sample of pages is read per site.
          </Notice>
        </div>
      </Section>
    </div>
  );
}
