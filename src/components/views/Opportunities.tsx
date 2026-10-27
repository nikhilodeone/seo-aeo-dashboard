"use client";

import { Fragment, useMemo, useState } from "react";
import { useApp } from "@/lib/client/store";
import { download, opportunitiesCsv } from "@/lib/client/export";
import type { Phase } from "@/lib/types";
import { Basis, Button, Empty, Icon, Matrix, PageHeader, Section, Segmented, TableWrap, Tag, Th, TYPE_LABEL, useSort } from "../ui";
import { OppDetail } from "./OppDetail";

export function Opportunities() {
  const { report, done, toggleDone } = useApp();
  const [phase, setPhase] = useState<"all" | Phase>("all");
  const [quickOnly, setQuickOnly] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const all = report?.opportunities ?? [];
  const filtered = useMemo(
    () => all.filter((o) => (phase === "all" || o.phase === phase) && (!quickOnly || o.quickWin) && (!hideDone || !done.has(o.id))),
    [all, phase, quickOnly, hideDone, done],
  );
  const sort = useSort(filtered, "score", {
    score: (o) => o.score,
    impact: (o) => o.impact,
    ease: (o) => o.ease,
    effort: (o) => o.effortHrs,
    title: (o) => o.title.toLowerCase(),
  });
  if (!report) return null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Opportunities"
        lead="Every fix and gap we found, scored. Impact is how much it could move results. Ease is how little work it takes. Score blends the two, weighted slightly toward ease."
        actions={
          <Button onClick={() => download(`${report.domain}-opportunities.csv`, opportunitiesCsv(report.opportunities), "text/csv")}>
            <Icon name="download" size={14} />
            Export CSV
          </Button>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Matrix opps={filtered} selected={open} onSelect={(id) => setOpen(id === open ? null : id)} />
        <div className="space-y-4 text-sm">
          <Segmented
            label="Filter by phase"
            value={phase}
            onChange={setPhase}
            options={[
              { value: "all", label: `All (${all.length})` },
              { value: "Foundations", label: "Foundations" },
              { value: "Quick wins", label: "Quick wins" },
              { value: "Content build", label: "Content" },
            ]}
          />
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={quickOnly} onChange={(e) => setQuickOnly(e.target.checked)} />
              Quick wins only (impact 40+, ease 60+)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
              Hide finished
            </label>
          </div>
          <dl className="grid grid-cols-1 gap-2 text-ink-2 sm:grid-cols-3">
            <div><dt className="font-medium text-ink">Foundations</dt><dd>Fixes that make everything else work: titles, crawlability, schema, AI access.</dd></div>
            <div><dt className="font-medium text-ink">Quick wins</dt><dd>Edits to pages you already have, plus questions to answer.</dd></div>
            <div><dt className="font-medium text-ink">Content build</dt><dd>New pages for topics competitors cover and you do not.</dd></div>
          </dl>
        </div>
      </div>

      <Section>
        {filtered.length === 0 ? (
          <Empty title="Nothing matches these filters">Clear a filter to see more opportunities.</Empty>
        ) : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead className="border-b border-line">
                <tr>
                  <Th className="w-10"><span className="sr-only">Finished</span></Th>
                  <Th k="title" sort={sort}>Opportunity</Th>
                  <Th k="impact" sort={sort} align="right">Impact</Th>
                  <Th k="ease" sort={sort} align="right">Ease</Th>
                  <Th k="effort" sort={sort} align="right">Hours</Th>
                  <Th k="score" sort={sort} align="right">Score</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sort.sorted.map((o) => {
                  const isOpen = open === o.id;
                  return (
                    <Fragment key={o.id}>
                      <tr className={isOpen ? "bg-accent-soft" : ""}>
                        <td className="px-3 py-2.5 align-top">
                          <input type="checkbox" aria-label={`Mark finished: ${o.title}`} className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={done.has(o.id)} onChange={() => toggleDone(o.id)} />
                        </td>
                        <td className="px-3 py-2.5">
                          <button onClick={() => setOpen(isOpen ? null : o.id)} aria-expanded={isOpen} className={`text-left font-medium leading-snug hover:text-accent ${done.has(o.id) ? "text-ink-3 line-through" : ""}`}>
                            {o.title}
                          </button>
                          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <Tag>{TYPE_LABEL[o.type]}</Tag>
                            <Basis c={o.confidence} />
                            {o.quickWin && <span className="text-xs font-medium text-accent">Quick win</span>}
                          </span>
                        </td>
                        <td className="tnum px-3 py-2.5 text-right align-top">{o.impact}</td>
                        <td className="tnum px-3 py-2.5 text-right align-top">{o.ease}</td>
                        <td className="tnum px-3 py-2.5 text-right align-top">{o.effortHrs}</td>
                        <td className="tnum px-3 py-2.5 text-right align-top font-semibold">{o.score}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-accent-soft">
                          <td />
                          <td colSpan={5} className="px-3 pb-5 pt-1">
                            <OppDetail o={o} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>
    </div>
  );
}
