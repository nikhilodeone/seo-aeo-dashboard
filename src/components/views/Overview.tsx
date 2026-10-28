"use client";

import { useState } from "react";
import { useApp } from "@/lib/client/store";
import { Connections } from "../Setup";
import { Basis, Button, CompareBars, Icon, Matrix, PageHeader, PHASE_COLOR, ScoreRing, Section, Tag } from "../ui";
import { OppDetail } from "./OppDetail";

export function Overview() {
  const { report, raw, setView, run, running } = useApp();
  const [sel, setSel] = useState<string | null>(null);
  if (!report || !raw) return null;

  const opps = report.opportunities;
  const quick = opps.filter((o) => o.quickWin);
  const missing = report.gaps.filter((g) => g.status === "missing").length;
  const unanswered = report.questions.filter((q) => !q.answered).length;
  const top10 = report.keywords.filter((k) => k.position !== null && k.position <= 10).length;
  const ranked = report.keywords.filter((k) => k.rankSource !== null).length;
  const selected = opps.find((o) => o.id === sel) ?? null;
  const firstWins = (quick.length >= 4 ? quick : opps).slice(0, 6);

  const seoRows = [{ label: report.domain, value: report.ownSeo.score, own: true }, ...report.competitorSeo.map((c) => ({ label: c.domain, value: c.score }))];
  const aeoRows = [{ label: report.domain, value: report.ownAeo.score, own: true }, ...report.competitorAeo.map((c) => ({ label: c.domain, value: c.score }))];

  const stats: { n: string; label: string; to: () => void; hint?: string }[] = [
    { n: String(quick.length), label: quick.length === 1 ? "quick win" : "quick wins", to: () => setView("opportunities") },
    { n: report.hasCompetitors ? String(missing) : "–", label: "topics competitors cover that you do not", to: () => setView("keywords"), hint: report.hasCompetitors ? undefined : "Add competitors to see gaps" },
    { n: String(unanswered), label: "audience questions you have not answered", to: () => setView("aeo") },
    { n: ranked ? `${top10}` : "–", label: ranked ? `of ${ranked} tracked keywords in the top 10` : "keywords tracked for rank", to: () => setView("keywords"), hint: ranked ? undefined : "Add Serper or Search Console data" },
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        title={`What to do first on ${report.domain}`}
        lead={`Based on ${raw.own.pages.length} pages read${report.hasCompetitors ? ` and ${report.competitors.length} competitor${report.competitors.length === 1 ? "" : "s"}` : ""}. ${report.hasCompetitors ? "" : "Add competitors on the Competitors tab to unlock keyword gaps."}`}
        actions={
          <Button
            disabled={running}
            onClick={() => void run({ ...raw.input, competitors: raw.competitors.map((c) => c.domain), autoDiscover: raw.competitors.length === 0 })}
          >
            <Icon name="refresh" size={14} />
            Re-run analysis
          </Button>
        }
      />

      <section className="grid gap-8 md:grid-cols-2 xl:grid-cols-[auto_auto_1fr] xl:items-center">
        <ScoreRing value={report.ownSeo.score} label="Site health" />
        <ScoreRing value={report.ownAeo.score} label="Answer-engine readiness" />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:col-span-2 xl:col-span-1">
          {stats.map((s) => (
            <button key={s.label} onClick={s.to} className="group text-left" title={s.hint}>
              <dt className="sr-only">{s.label}</dt>
              <dd>
                <span className="tnum block text-3xl font-semibold leading-none">{s.n}</span>
                <span className="mt-1 block text-sm text-ink-2 group-hover:text-ink">{s.label}</span>
              </dd>
            </button>
          ))}
        </dl>
      </section>

      <Section
        title="Start here"
        lead="Ranked by impact and ease. The top-right of the chart is where small edits earn the most."
        aside={
          <Button variant="ghost" size="sm" onClick={() => setView("opportunities")}>
            All {opps.length} opportunities
            <Icon name="arrow" size={14} />
          </Button>
        }
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ol className="divide-y divide-line border-y border-line">
            {firstWins.map((o) => (
              <li key={o.id}>
                <button onClick={() => setSel(o.id === sel ? null : o.id)} aria-pressed={o.id === sel} className="flex w-full items-start gap-3 py-3 text-left hover:bg-accent-soft">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PHASE_COLOR[o.phase] }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">{o.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-2">
                      <span>{o.phase}</span>
                      <span className="tnum">Impact {o.impact}</span>
                      <span className="tnum">Ease {o.ease}</span>
                      <span className="tnum">{o.effortHrs}h</span>
                      <Basis c={o.confidence} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <Matrix opps={opps} selected={sel} onSelect={(id) => setSel(id === sel ? null : id)} />
        </div>
        {selected && (
          <div className="mt-6 rounded-md border border-line bg-surface p-5">
            <p className="mb-3 text-lg font-semibold leading-snug">{selected.title}</p>
            <OppDetail o={selected} />
          </div>
        )}
      </Section>

      <Section title="You against your competitors" lead={report.hasCompetitors ? undefined : "No competitors were read, so there is nothing to compare yet."}>
        {report.hasCompetitors ? (
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <h3 className="mb-3 font-medium">Answer-engine readiness</h3>
              <CompareBars rows={aeoRows} />
            </div>
            <div>
              <h3 className="mb-3 font-medium">Site health</h3>
              <CompareBars rows={seoRows} />
            </div>
          </div>
        ) : (
          <Button onClick={() => setView("competitors")}>Add competitors</Button>
        )}
      </Section>

      <Section
        title="Your 12 weeks"
        lead={`${report.plan.tasks.length} tasks at ${report.plan.hoursPerWeek} hours a week.`}
        aside={
          <Button variant="ghost" size="sm" onClick={() => setView("plan")}>
            Open the plan
            <Icon name="arrow" size={14} />
          </Button>
        }
      >
        <div className="grid grid-cols-12 gap-1.5" role="img" aria-label="Hours scheduled per week across 12 weeks">
          {report.plan.weeks.map((w) => (
            <div key={w.n} className="text-center">
              <div className="flex h-20 items-end rounded-sm bg-line">
                <div className="w-full rounded-sm bg-accent" style={{ height: `${Math.min(100, (w.hours / report.plan.hoursPerWeek) * 100)}%` }} />
              </div>
              <p className="tnum mt-1 text-xs text-ink-2">W{w.n}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="What this dashboard knows">
        <div className="grid gap-8 md:grid-cols-2">
          <Connections />
          <div className="text-sm text-ink-2">
            <p className="mb-2 font-medium text-ink">How to read the data labels</p>
            <ul className="space-y-2">
              <li className="flex gap-2"><Basis c="measured" /> Real positions or clicks from Google or Search Console.</li>
              <li className="flex gap-2"><Basis c="crawled" /> Seen directly on pages we read.</li>
              <li className="flex gap-2"><Basis c="estimated" /> Rules of thumb. Check demand before big bets.</li>
            </ul>
            <p className="mt-3">
              Without Search Console or a keyword-volume tool, <Tag>impact</Tag> scores reflect how strongly competitors and your own site lean on a topic, not search volume.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
