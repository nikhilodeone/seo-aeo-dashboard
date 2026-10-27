"use client";

import { PHASE_ORDER, PHASE_TIMING } from "@/lib/analysis/plan";
import { download, planCsv, planMarkdown } from "@/lib/client/export";
import { useApp } from "@/lib/client/store";
import type { Phase } from "@/lib/types";
import { nextMonday } from "@/lib/util";
import { Button, cx, Empty, Icon, Notice, PageHeader, PHASE_COLOR, Section } from "../ui";

export function Plan() {
  const { report, settings, updateSettings, done, toggleDone } = useApp();
  if (!report) return null;
  const { plan } = report;
  const colTemplate = "minmax(15rem,1.6fr) repeat(12, minmax(1.75rem, 1fr))";
  const total = plan.tasks.reduce((s, t) => s + t.effortHrs, 0);
  const finished = plan.tasks.filter((t) => done.has(t.oppId)).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="12-week plan"
        lead="The highest-scoring work, scheduled around the hours you have. Foundations come first, new pages start from week 3, and the dashboard is re-run in weeks 4, 8 and 12."
        actions={
          <>
            <Button onClick={() => download(`${report.domain}-plan.csv`, planCsv(plan, done), "text/csv")}>
              <Icon name="download" size={14} />
              CSV
            </Button>
            <Button onClick={() => download(`${report.domain}-plan.md`, planMarkdown(report, done), "text/markdown")}>
              <Icon name="download" size={14} />
              Markdown
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-6 text-sm">
        <label className="block">
          <span className="mb-1 block font-medium">Hours a week</span>
          <input type="number" min={2} max={60} value={settings.hoursPerWeek} onChange={(e) => updateSettings({ hoursPerWeek: Math.min(60, Math.max(2, Number(e.target.value) || 10)) })} className="tnum w-24 rounded-md border border-line bg-surface px-3 py-2" />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Start date</span>
          <input type="date" value={settings.startDate ?? plan.weeks[0]?.start ?? nextMonday()} onChange={(e) => updateSettings({ startDate: e.target.value || null })} className="rounded-md border border-line bg-surface px-3 py-2" />
        </label>
        <p className="pb-2 text-ink-2">
          <span className="tnum font-medium text-ink">{plan.tasks.length}</span> tasks, <span className="tnum font-medium text-ink">{Math.round(total)}</span> hours, <span className="tnum font-medium text-ink">{finished}</span> finished
        </p>
      </div>

      {plan.tasks.length === 0 ? (
        <Empty title="Nothing to schedule">Run an analysis with competitors or Search Console data to generate tasks.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <div className="min-w-[56rem]">
            <div className="grid items-end border-b border-line text-xs text-ink-2" style={{ gridTemplateColumns: colTemplate }}>
              <div className="px-3 py-2">Task</div>
              {plan.weeks.map((w) => (
                <div key={w.n} className="border-l border-line px-1 py-2 text-center" title={`Week ${w.n}, from ${w.start}. ${w.hours} of ${plan.hoursPerWeek} hours used`}>
                  <span className="tnum block font-medium text-ink">W{w.n}</span>
                  <span className="tnum block text-[0.65rem]">{w.start.slice(5)}</span>
                </div>
              ))}
            </div>
            {PHASE_ORDER.map((phase) => {
              const items = plan.tasks.filter((t) => t.phase === phase);
              if (!items.length) return null;
              return (
                <div key={phase}>
                  <div className="flex items-center gap-2 border-b border-line bg-plane px-3 py-1.5 text-xs">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PHASE_COLOR[phase] }} />
                    <span className="font-semibold text-ink">{phase}</span>
                    <span className="text-ink-2">{PHASE_TIMING[phase as Phase]}</span>
                  </div>
                  {items.map((t) => (
                    <div key={t.id} className="grid items-center border-b border-line last:border-0" style={{ gridTemplateColumns: colTemplate }}>
                      <label className="flex items-start gap-2 px-3 py-2 text-sm">
                        <input type="checkbox" disabled={t.oppId === "measure"} aria-label={`Mark finished: ${t.title}`} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" checked={done.has(t.oppId)} onChange={() => toggleDone(t.oppId)} />
                        <span className={cx("min-w-0 leading-snug", done.has(t.oppId) && "text-ink-3 line-through")} title={t.title}>
                          <span className="line-clamp-2">{t.title}</span>
                          <span className="tnum text-xs text-ink-3">{t.effortHrs}h</span>
                        </span>
                      </label>
                      <div className="relative col-span-12 h-full" style={{ gridColumn: "2 / span 12", display: "grid", gridTemplateColumns: "subgrid" }}>
                        <div
                          className="my-2.5 rounded-sm"
                          style={{ gridColumn: `${t.startWeek} / ${t.endWeek + 1}`, background: PHASE_COLOR[phase], opacity: done.has(t.oppId) ? 0.35 : 1, minHeight: 14 }}
                          role="img"
                          aria-label={`${t.title}: week ${t.startWeek}${t.endWeek > t.startWeek ? ` to ${t.endWeek}` : ""}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {plan.backlog.length > 0 && (
        <Section title="Backlog" lead={`These did not fit into 12 weeks at ${plan.hoursPerWeek} hours a week. Raise the hours or pick them up next quarter.`}>
          <ul className="divide-y divide-line border-y border-line text-sm">
            {plan.backlog.map((t) => (
              <li key={t.id} className="flex justify-between gap-4 py-2">
                <span>{t.title}</span>
                <span className="tnum shrink-0 text-ink-2">{t.effortHrs}h</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="How to measure it">
        <div className="grid gap-8 md:grid-cols-2">
          <ul className="list-disc space-y-1.5 pl-5 text-ink-2">
            <li>In Search Console, compare clicks, impressions and average position for the pages you changed, over matching periods before and after.</li>
            <li>Re-run this dashboard in weeks 4, 8 and 12 and watch the position arrows and the two scores.</li>
            <li>Once a month, ask the test questions on the Answer engines tab in ChatGPT, Perplexity, Gemini and Claude and note whether you are cited.</li>
          </ul>
          <Notice title="About timing">
            The timings above are typical for small and mid-sized sites, not promises. Rankings depend on competition, site authority and how often Google recrawls you.
          </Notice>
        </div>
      </Section>
    </div>
  );
}
