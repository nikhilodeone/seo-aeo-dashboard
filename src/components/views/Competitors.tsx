"use client";

import { useState } from "react";
import { useApp } from "@/lib/client/store";
import { hostOf, normalizeUrlInput } from "@/lib/util";
import { Button, Empty, Icon, Notice, PageHeader, Section, Status, TableWrap, Tag, Th } from "../ui";

export function Competitors() {
  const { report, raw, run, running, caps } = useApp();
  const [list, setList] = useState<string[]>(() => raw?.competitors.map((c) => c.domain) ?? []);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (!report || !raw) return null;

  const add = (value: string) => {
    const n = normalizeUrlInput(value);
    if (!n) {
      setErr("Enter a website address, like competitor.com");
      return;
    }
    const d = hostOf(n);
    if (d === raw.own.domain) {
      setErr("That is your own site");
      return;
    }
    if (list.length >= 5) {
      setErr("Up to 5 competitors");
      return;
    }
    if (!list.includes(d)) setList([...list, d]);
    setDraft("");
    setErr(null);
  };

  const current = raw.competitors.map((c) => c.domain);
  const changed = list.length !== current.length || list.some((d) => !current.includes(d));
  const rows = [
    { domain: `${report.domain}`, own: true, pages: raw.own.pages.length, seo: report.ownSeo.score, aeo: report.ownAeo.score, words: null as number | null, shared: null as number | null, topics: report.topTerms.slice(0, 5), blocked: [] as string[], schema: [...new Set(raw.own.pages.flatMap((p) => p.schemaTypes))].slice(0, 6) },
    ...report.competitors.map((c) => ({ domain: c.domain, own: false, pages: c.pages, seo: c.seoScore, aeo: c.aeoScore, words: c.medianWords, shared: c.sharedKeywords as number | null, topics: c.topTerms.slice(0, 5), blocked: c.retrievalBotsBlocked as string[], schema: c.schemaTypes.slice(0, 6) })),
  ];

  return (
    <div className="space-y-8">
      <PageHeader title="Competitors" lead="Who you are being measured against. Gaps and briefs come from the pages we read on these sites." />

      {raw.competitorSource === "ai" && (
        <Notice tone="neutral" title="These competitors were suggested by AI">
          AI works from general knowledge, so check each one is a real rival for the same searches. Remove any that are not and re-run.
        </Notice>
      )}
      {raw.competitorSource === "web" && (
        <Notice tone="neutral" title="Found from a free web search">
          These sites turned up for your site's main topics. This search is not Google and is not a ranking, so check each one is a real rival and swap any that are not.
        </Notice>
      )}
      {raw.competitorSource === "serp" && <Notice title="Found from Google results">These sites showed up most often for your keywords. Swap in any that are not true rivals and re-run.</Notice>}

      {report.competitors.length === 0 ? (
        <Empty title="No competitor sites were read">
          {raw.discoverNote ? <>{raw.discoverNote} </> : null}Type up to five competitor websites below (for example <span className="font-medium">elare.in</span>), then choose Re-run. Pick sites that rank for the searches you want. A free Serper key in Vercel finds them automatically.
        </Empty>
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="border-b border-line">
              <tr>
                <Th>Site</Th>
                <Th align="right">Pages read</Th>
                <Th align="right">Site health</Th>
                <Th align="right">Answer-engine</Th>
                <Th>Search-bot access</Th>
                <Th>Top topics</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.domain} className={r.own ? "bg-accent-soft" : ""}>
                  <td className="px-3 py-2.5 font-medium">{r.own ? "You: " : ""}{r.domain}{r.shared !== null && <span className="block text-xs font-normal text-ink-3">{r.shared} shared keywords</span>}</td>
                  <td className="tnum px-3 py-2.5 text-right">{r.pages}</td>
                  <td className="tnum px-3 py-2.5 text-right font-semibold">{r.seo}</td>
                  <td className="tnum px-3 py-2.5 text-right font-semibold">{r.aeo}</td>
                  <td className="px-3 py-2.5">{r.own ? (report.ownAeo.checks.find((c) => c.id === "ai-crawlers")!.ratio === 1 ? <Status tone="good">Open</Status> : <Status tone="crit">Blocked</Status>) : r.blocked.length ? <Status tone="crit">Blocks {r.blocked.length}</Status> : <Status tone="good">Open</Status>}</td>
                  <td className="px-3 py-2.5"><span className="flex flex-wrap gap-1">{r.topics.map((t) => <Tag key={t}>{t}</Tag>)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {raw.competitorErrors.length > 0 && (
        <Notice tone="neutral" title="Some sites were left out or could not be read">
          <ul className="list-disc pl-5">
            {raw.competitorErrors.map((e) => (
              <li key={e.domain}>
                <span className="font-medium">{e.domain}</span>: {e.error}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <Section title="Change competitors" lead="Edit the list, then re-run to read the new sites. Your Search Console data is kept.">
        <div className="space-y-4">
          <ul className="flex flex-wrap gap-2">
            {list.map((d) => (
              <li key={d} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface py-1 pl-3 pr-1.5 text-sm">
                {d}
                <button onClick={() => setList(list.filter((x) => x !== d))} aria-label={`Remove ${d}`} className="rounded p-1 text-ink-2 hover:bg-accent-soft hover:text-ink">
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="text-sm text-ink-2">No competitors yet.</li>}
          </ul>
          <form
            className="flex max-w-lg gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add(draft);
            }}
          >
            <label className="sr-only" htmlFor="comp">Competitor website</label>
            <input id="comp" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="competitor.com" autoCapitalize="none" spellCheck={false} className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2" />
            <Button type="submit">Add</Button>
          </form>
          {err && <p className="text-sm text-crit" role="alert">{err}</p>}
          <Button
            variant="primary"
            disabled={running || !changed}
            onClick={() => void run({ ...raw.input, competitors: list, autoDiscover: list.length === 0 })}
          >
            <Icon name="refresh" size={14} />
            Re-run with these competitors
          </Button>
        </div>
      </Section>

      {raw.suggested.length > 0 && (
        <Section title="Suggestions" lead={raw.suggested.some((s) => s.source === "serp") ? "Sites that appeared most often in Google results for your keywords." : raw.suggested.some((s) => s.source === "web") ? "Sites that appeared most often in a web search for your topics. Verify before adding." : "Suggested by AI. Verify before adding."}>
          <ul className="divide-y divide-line border-y border-line">
            {raw.suggested
              .filter((s) => !list.includes(s.domain))
              .map((s) => (
                <li key={s.domain} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{s.domain}</p>
                    <p className="text-ink-2">{s.source === "serp" || s.source === "web" ? `In results for ${s.appearances} of your topics, average position ${s.avgPosition}` : s.reason}</p>
                  </div>
                  <Button size="sm" onClick={() => add(s.domain)} disabled={list.length >= 5}>
                    <Icon name="plus" size={14} />
                    Add
                  </Button>
                </li>
              ))}
          </ul>
        </Section>
      )}
      {!caps?.serp && !caps?.ai && list.length === 0 && <p className="text-sm text-ink-2">Automatic competitor discovery needs a Serper or Anthropic key. See the Data and settings tab.</p>}
    </div>
  );
}
