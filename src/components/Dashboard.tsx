"use client";

import { useApp } from "@/lib/client/store";
import { Aeo } from "./views/Aeo";
import { Competitors } from "./views/Competitors";
import { Content } from "./views/Content";
import { DataView } from "./views/Data";
import { Keywords } from "./views/Keywords";
import { Opportunities } from "./views/Opportunities";
import { Overview } from "./views/Overview";
import { Pages } from "./views/Pages";
import { Plan } from "./views/Plan";
import { NAV } from "./shared";
import { Button, cx, Icon, Notice } from "./ui";

export function Dashboard() {
  const { view, setView, report, raw, newAnalysis } = useApp();
  if (!raw) return null;
  if (!report) {
    return (
      <main className="mx-auto max-w-xl px-6 py-20">
        <Notice tone="crit" title="This analysis could not be displayed">
          The saved data may be from an older version. Run the analysis again.
        </Notice>
        <Button className="mt-4" variant="primary" onClick={newAnalysis}>
          Start a new analysis
        </Button>
      </main>
    );
  }
  const quick = report.opportunities.filter((o) => o.quickWin).length;
  const date = new Date(raw.collectedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="bg-rail text-white lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 lg:block lg:py-6">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold" title={raw.own.domain}>{raw.own.domain}</p>
            <p className="text-xs text-white/70">Analysed {date}</p>
          </div>
          <Button size="sm" variant="ghost" className="!text-white/80 hover:!bg-white/10 hover:!text-white lg:mt-3 lg:-ml-2" onClick={newAnalysis}>
            <Icon name="plus" size={14} />
            New site
          </Button>
        </div>
        <nav aria-label="Dashboard sections" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-6">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              aria-current={view === n.id ? "page" : undefined}
              className={cx(
                "flex shrink-0 items-center justify-between gap-3 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors lg:border-l-[3px] lg:rounded-l-none",
                view === n.id ? "bg-white/10 font-medium text-white lg:border-accent" : "text-white/75 hover:bg-white/5 hover:text-white lg:border-transparent",
              )}
            >
              {n.label}
              {n.id === "opportunities" && quick > 0 && <span className="tnum rounded bg-white/15 px-1.5 text-xs">{quick}</span>}
            </button>
          ))}
        </nav>
      </aside>
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-10">
        {view === "overview" && <Overview />}
        {view === "opportunities" && <Opportunities />}
        {view === "keywords" && <Keywords />}
        {view === "aeo" && <Aeo />}
        {view === "content" && <Content />}
        {view === "plan" && <Plan />}
        {view === "competitors" && <Competitors />}
        {view === "pages" && <Pages />}
        {view === "data" && <DataView />}
      </main>
    </div>
  );
}
