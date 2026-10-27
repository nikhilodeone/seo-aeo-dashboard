"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/client/store";
import type { GapRow, KeywordRow } from "@/lib/types";
import { fmtNum, fmtPos, pathOf } from "@/lib/util";
import { Empty, Icon, Meter, PageHeader, Segmented, Status, TableWrap, Tag, Th, useSort, cx } from "../ui";

type Tab = "yours" | "gaps" | "ideas";

function Where({ k }: { k: KeywordRow }) {
  const items: [string, boolean, string][] = [["T", k.inTitle, "title tag"], ["H1", k.inH1, "H1 heading"], ["H2", k.inH2, "H2 heading"], ["M", k.inMeta, "meta description"]];
  return (
    <span className="flex gap-1">
      {items.map(([l, on, name]) => (
        <span
          key={l}
          title={on ? `In a ${name}` : `Not in any ${name}`}
          className={cx("inline-block min-w-[1.6rem] rounded border px-1 text-center text-xs", on ? "border-accent bg-accent-soft font-medium text-accent" : "border-dashed border-line text-ink-3")}
        >
          {l}
          <span className="sr-only">{on ? ` yes` : ` no`}</span>
        </span>
      ))}
    </span>
  );
}

function Position({ k }: { k: KeywordRow }) {
  if (k.rankSource === null) return <span className="text-ink-3">–</span>;
  const label = k.position === null ? ">20" : fmtPos(k.position);
  let delta: React.ReactNode = null;
  if (k.position !== null && k.prevPosition !== null && Math.abs(k.prevPosition - k.position) >= 0.5) {
    const up = k.prevPosition > k.position;
    delta = (
      <span className={cx("ml-1.5 inline-flex items-center text-xs", up ? "text-good-ink" : "text-crit")}>
        <Icon name={up ? "up" : "down"} size={11} />
        {Math.abs(k.prevPosition - k.position).toFixed(1)}
        <span className="sr-only">{up ? " better than last run" : " worse than last run"}</span>
      </span>
    );
  }
  return (
    <span title={k.rankSource === "gsc" ? "Average position in Search Console" : "Position in Google results when checked"}>
      <span className="tnum font-medium">{label}</span>
      {delta}
      <span className="block text-xs text-ink-3">{k.rankSource === "gsc" ? "Search Console" : "Google check"}</span>
    </span>
  );
}

export function Keywords() {
  const { report, raw, setView } = useApp();
  const [tab, setTab] = useState<Tab>("yours");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "gap" | "striking">("all");
  const [gapFilter, setGapFilter] = useState<"all" | "missing" | "weak" | "covered" | "strength">("all");

  const kws = useMemo(() => {
    if (!report) return [];
    return report.keywords.filter((k) => {
      if (q && !k.label.includes(q.toLowerCase())) return false;
      if (filter === "gap") return !k.inTitle && !k.inH1;
      if (filter === "striking") return k.position !== null && k.position >= 4 && k.position <= 20;
      return true;
    });
  }, [report, q, filter]);
  const kSort = useSort(kws, "norm", {
    label: (k) => k.label,
    norm: (k) => k.norm,
    pages: (k) => k.pages,
    position: (k) => k.position,
    impressions: (k) => k.impressions,
    clicks: (k) => k.clicks,
  });

  const gaps = useMemo(() => (report ? report.gaps.filter((g) => (gapFilter === "all" ? g.status !== "covered" && g.status !== "strength" : g.status === gapFilter) && (!q || g.label.includes(q.toLowerCase()))) : []), [report, gapFilter, q]);
  const gSort = useSort(gaps, "priority", {
    label: (g: GapRow) => g.label,
    priority: (g: GapRow) => g.priority,
    coverage: (g: GapRow) => g.compCoverage,
    status: (g: GapRow) => g.status,
  });
  if (!report || !raw) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Keywords"
        lead="The phrases your pages are built around, how they stack up against competitors, and the ones you are missing."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Keyword views"
          value={tab}
          onChange={setTab}
          options={[
            { value: "yours", label: `Your keywords (${report.keywords.length})` },
            { value: "gaps", label: `Gaps vs competitors (${report.gaps.filter((g) => g.status === "missing" || g.status === "weak").length})` },
            { value: "ideas", label: `Ideas (${report.ideas.length})` },
          ]}
        />
        {tab !== "ideas" && (
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Search keywords</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search keywords" className="w-56 rounded-md border border-line bg-surface px-3 py-1.5" />
          </label>
        )}
      </div>

      {tab === "yours" && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Segmented
              label="Filter your keywords"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "gap", label: "Not in a title or H1" },
                { value: "striking", label: "Positions 4 to 20" },
              ]}
            />
            {!report.hasGsc && !report.hasSerp && (
              <span className="text-ink-2">
                No rank data yet. <button className="text-accent underline underline-offset-2" onClick={() => setView("data")}>Upload a Search Console export</button> or add a Serper key.
              </span>
            )}
          </div>
          {kSort.sorted.length === 0 ? (
            <Empty title="No keywords match">Try clearing the search or filter.</Empty>
          ) : (
            <TableWrap>
              <table className="w-full text-sm">
                <thead className="border-b border-line">
                  <tr>
                    <Th k="label" sort={kSort}>Keyword</Th>
                    <Th k="norm" sort={kSort}>Strength on your site</Th>
                    <Th>Appears in</Th>
                    <Th k="pages" sort={kSort} align="right">Pages</Th>
                    <Th k="position" sort={kSort} align="right">Position</Th>
                    {report.hasGsc && <Th k="impressions" sort={kSort} align="right">Impressions</Th>}
                    {report.hasGsc && <Th k="clicks" sort={kSort} align="right">Clicks</Th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {kSort.sorted.map((k) => (
                    <tr key={k.key}>
                      <td className="px-3 py-2.5">
                        <span className="font-medium">{k.label}</span>
                        <span className="ml-2 align-middle"><Tag>{k.intent === "general" ? "mixed" : k.intent}</Tag></span>
                        {k.bestPage && <span className="block text-xs text-ink-3">{pathOf(k.bestPage)}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Meter value={k.norm} className="w-24" />
                          <span className="tnum w-7 text-right">{k.norm}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><Where k={k} /></td>
                      <td className="tnum px-3 py-2.5 text-right">{k.pages}</td>
                      <td className="px-3 py-2.5 text-right"><Position k={k} /></td>
                      {report.hasGsc && <td className="tnum px-3 py-2.5 text-right">{fmtNum(k.impressions)}</td>}
                      {report.hasGsc && <td className="tnum px-3 py-2.5 text-right">{fmtNum(k.clicks)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
          {report.differentiators.length > 0 && (
            <div className="pt-2 text-sm">
              <h2 className="mb-2 font-semibold">Where you stand apart</h2>
              <p className="mb-2 text-ink-2">Topics you lean on that none of the competitors we read headline. Protect and deepen these.</p>
              <ul className="flex flex-wrap gap-2">
                {report.differentiators.map((k) => (
                  <li key={k.key}><Tag>{k.label}</Tag></li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {tab === "gaps" && (
        <>
          {!report.hasCompetitors ? (
            <Empty title="No competitors to compare against" action={<button className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white" onClick={() => setView("competitors")}>Add competitors</button>}>
              Gaps are topics competitors lean on that you do not. Add two or three competitor sites and we will compare them page by page.
            </Empty>
          ) : (
            <>
              <Segmented
                label="Filter gaps"
                value={gapFilter}
                onChange={setGapFilter}
                options={[
                  { value: "all", label: "Needs work" },
                  { value: "missing", label: "Missing" },
                  { value: "weak", label: "Weak" },
                  { value: "covered", label: "Covered" },
                  { value: "strength", label: "Your strengths" },
                ]}
              />
              {report.competitors.length < 3 && <p className="text-sm text-ink-2">Only {report.competitors.length} competitor{report.competitors.length === 1 ? "" : "s"} read, so treat "covered by most competitors" with caution. Three or more gives a firmer signal.</p>}
              {gSort.sorted.length === 0 ? (
                <Empty title="Nothing in this group">Try another filter.</Empty>
              ) : (
                <TableWrap>
                  <table className="w-full text-sm">
                    <thead className="border-b border-line">
                      <tr>
                        <Th k="label" sort={gSort}>Keyword</Th>
                        <Th k="status" sort={gSort}>Status</Th>
                        <Th k="coverage" sort={gSort}>Competitors using it</Th>
                        <Th>Strength: you vs them</Th>
                        <Th k="priority" sort={gSort} align="right">Priority</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {gSort.sorted.slice(0, 80).map((g) => (
                        <tr key={g.key}>
                          <td className="px-3 py-2.5">
                            <span className="font-medium">{g.label}</span>
                            <span className="ml-2 align-middle"><Tag>{g.intent === "general" ? "mixed" : g.intent}</Tag></span>
                            {g.ownPage && <span className="block text-xs text-ink-3">{pathOf(g.ownPage)}</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            {g.status === "missing" && <Status tone="crit">Missing</Status>}
                            {g.status === "weak" && <Status tone="warn" icon="half">Weak</Status>}
                            {g.status === "covered" && <Status tone="good">Covered</Status>}
                            {g.status === "strength" && <Status tone="accent" icon="check">Strength</Status>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="tnum">{g.compCoverage} of {g.compTotal}</span>
                            <span className="mt-0.5 flex flex-wrap gap-1">
                              {g.competitors.map((c) => (
                                <span key={c.domain} title={c.prominent ? "In a title or heading" : "In body text"} className={cx("rounded border px-1 text-xs", c.prominent ? "border-ink-3 text-ink" : "border-dashed border-line text-ink-3")}>
                                  {c.domain}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="grid grid-cols-[2.5rem_6rem_1.5rem] items-center gap-x-2 gap-y-1 text-xs text-ink-2">
                              <span>You</span><Meter value={g.ownNorm} /><span className="tnum">{g.ownNorm}</span>
                              <span>Them</span><div className="h-2 overflow-hidden rounded-sm bg-line"><div className="h-full rounded-sm bg-ink-3" style={{ width: `${g.compStrength}%` }} /></div><span className="tnum">{g.compStrength}</span>
                            </div>
                          </td>
                          <td className="tnum px-3 py-2.5 text-right font-semibold">{g.priority}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
              <p className="text-xs text-ink-2">Strength is how prominently a phrase appears (titles and headings count most), scaled 0 to 100 within each site. It is not search volume.</p>
            </>
          )}
        </>
      )}

      {tab === "ideas" &&
        (report.ideas.length === 0 ? (
          <Empty title="No search ideas yet">Related searches come from live Google results. Add a Serper key and run the analysis again.</Empty>
        ) : (
          <>
            <p className="max-w-[62ch] text-ink-2">Related searches Google shows for your top keywords that your pages do not target yet. Each is a candidate for a section, an FAQ or a new page.</p>
            <ul className="grid gap-x-8 sm:grid-cols-2">
              {report.ideas.map((i) => (
                <li key={i.query} className="flex items-baseline justify-between gap-3 border-b border-line py-2">
                  <span className="font-medium">{i.query}</span>
                  <span className="truncate text-xs text-ink-3">from "{i.from}"</span>
                </li>
              ))}
            </ul>
          </>
        ))}
    </div>
  );
}
