"use client";

import { Fragment, useState } from "react";
import { useApp } from "@/lib/client/store";
import { Empty, Icon, PageHeader, Status, TableWrap, Tag, Th, useSort } from "../ui";

export function Pages() {
  const { report, raw } = useApp();
  const [site, setSite] = useState("own");
  const [open, setOpen] = useState<string | null>(null);

  const audit = !report || !raw ? null : site === "own" ? report.ownSeo : (report.competitorSeo.find((a) => a.domain === site) ?? report.ownSeo);
  const rows = audit?.pages ?? [];
  const sort = useSort(rows, "score", {
    path: (p) => p.path,
    words: (p) => p.wordCount,
    score: (p) => p.score,
    issues: (p) => p.issues.length,
  }, "asc");
  if (!report || !raw || !audit) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Pages" lead="Every page we read, with the problems found. Worst pages first." />
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <span className="font-medium">Site</span>
          <select value={site} onChange={(e) => { setSite(e.target.value); setOpen(null); }} className="rounded-md border border-line bg-surface px-3 py-1.5">
            <option value="own">{report.domain} (yours)</option>
            {report.competitorSeo.map((c) => <option key={c.domain} value={c.domain}>{c.domain}</option>)}
          </select>
        </label>
        <p className="text-ink-2">
          {audit.counts.critical} critical, {audit.counts.warning} warnings, {audit.counts.info} notes
        </p>
      </div>

      {audit.siteIssues.length > 0 && (
        <ul className="space-y-1 text-sm">
          {audit.siteIssues.map((i) => (
            <li key={i.id}><Status tone={i.severity === "critical" ? "crit" : i.severity === "warning" ? "warn" : "neutral"}>{i.message}</Status></li>
          ))}
        </ul>
      )}

      {rows.length === 0 ? (
        <Empty title="No pages were read" />
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="border-b border-line">
              <tr>
                <Th k="path" sort={sort}>Page</Th>
                <Th k="words" sort={sort} align="right">Words</Th>
                <Th k="score" sort={sort} align="right">Health</Th>
                <Th k="issues" sort={sort} align="right">Issues</Th>
                <Th>Answer-engine signals</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sort.sorted.map((p) => {
                const isOpen = open === p.url;
                return (
                  <Fragment key={p.url}>
                    <tr className={isOpen ? "bg-accent-soft" : ""}>
                      <td className="max-w-[22rem] px-3 py-2.5">
                        <button onClick={() => setOpen(isOpen ? null : p.url)} aria-expanded={isOpen} className="flex items-start gap-1.5 text-left font-medium hover:text-accent">
                          <Icon name="chevron" size={14} className={`mt-1 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                          <span className="min-w-0">
                            <span className="block truncate">{p.path}</span>
                            <span className="block truncate text-xs font-normal text-ink-2">{p.title || "No title"}</span>
                          </span>
                        </button>
                      </td>
                      <td className="tnum px-3 py-2.5 text-right">{p.wordCount}</td>
                      <td className="tnum px-3 py-2.5 text-right font-semibold">{p.score}</td>
                      <td className="tnum px-3 py-2.5 text-right">{p.issues.length}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex flex-wrap gap-1">
                          <Tag title="Headings phrased as questions">{p.aeo.questionHeadings} Q headings</Tag>
                          <Tag title="Short direct answers under those headings">{p.aeo.answerBlocks} answers</Tag>
                          {p.aeo.schema.slice(0, 2).map((s) => <Tag key={s}>{s}</Tag>)}
                        </span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-accent-soft">
                        <td colSpan={5} className="px-10 pb-4 pt-1 text-sm">
                          {p.issues.length === 0 ? <Status tone="good">No issues found</Status> : (
                            <ul className="space-y-1">
                              {p.issues.map((i) => (
                                <li key={i.id + i.message}><Status tone={i.severity === "critical" ? "crit" : i.severity === "warning" ? "warn" : "neutral"}>{i.message}</Status></li>
                              ))}
                            </ul>
                          )}
                          {p.topTerms.length > 0 && <p className="mt-3 text-ink-2">Main phrases: {p.topTerms.join(", ")}</p>}
                          <a href={p.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-accent underline underline-offset-2">Open page <Icon name="link" size={12} /></a>
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
    </div>
  );
}
