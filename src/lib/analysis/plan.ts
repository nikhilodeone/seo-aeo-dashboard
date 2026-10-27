import type { Opportunity, Phase, Plan, PlanTask } from "../types";
import { addDays } from "../util";

export const PHASE_ORDER: Phase[] = ["Foundations", "Quick wins", "Content build", "Measure"];

/** Typical time for a change in each phase to show in results. General industry experience, not a promise. */
export const PHASE_TIMING: Record<Phase, string> = {
  Foundations: "Crawl and indexing effects often show in 2 to 6 weeks",
  "Quick wins": "Ranking and click changes often show in 2 to 8 weeks",
  "Content build": "New pages usually need 2 to 4 months to settle",
  Measure: "Recurring check-ins",
};

export function buildPlan(opps: Opportunity[], hoursPerWeek: number, startDate: string, totalWeeks = 12): Plan {
  const hpw = Math.max(2, hoursPerWeek);
  const cap = Array.from({ length: totalWeeks + 1 }, (_, i) => (i === 0 ? 0 : hpw));
  const tasks: PlanTask[] = [];
  const backlog: PlanTask[] = [];

  // Reserve measurement slots first so they always happen.
  for (const w of [4, 8, 12]) {
    if (w > totalWeeks) continue;
    cap[w] = Math.max(0, cap[w] - 1);
    tasks.push({
      id: `measure-${w}`,
      oppId: "measure",
      title: w === 12 ? "Re-run the dashboard, compare rankings and citations, plan the next quarter" : "Re-run the dashboard and review rankings, clicks and new gaps",
      phase: "Measure",
      type: "measure",
      effortHrs: 1,
      startWeek: w,
      endWeek: w,
      score: 0,
    });
  }

  const pick = (phase: Phase, limit: number) => opps.filter((o) => o.phase === phase).sort((a, b) => b.score - a.score).slice(0, limit);
  const queue: { o: Opportunity; minWeek: number }[] = [
    ...pick("Foundations", 12).map((o) => ({ o, minWeek: 1 })),
    ...pick("Quick wins", 16).map((o) => ({ o, minWeek: 1 })),
    ...pick("Content build", 8).map((o) => ({ o, minWeek: 3 })),
  ];

  for (const { o, minWeek } of queue) {
    const task: PlanTask = {
      id: `task-${o.id}`,
      oppId: o.id,
      title: o.title,
      phase: o.phase,
      type: o.type,
      effortHrs: o.effortHrs,
      startWeek: 0,
      endWeek: 0,
      score: o.score,
    };
    const available = cap.slice(minWeek).reduce((s, c) => s + c, 0);
    if (available + 1e-6 < o.effortHrs) {
      backlog.push(task);
      continue;
    }
    let remaining = o.effortHrs;
    let start = 0;
    let end = 0;
    for (let w = minWeek; w <= totalWeeks && remaining > 1e-6; w++) {
      if (cap[w] <= 1e-6) continue;
      if (!start) start = w;
      const use = Math.min(cap[w], remaining);
      cap[w] -= use;
      remaining -= use;
      end = w;
    }
    task.startWeek = start;
    task.endWeek = end;
    tasks.push(task);
  }

  tasks.sort((a, b) => a.startWeek - b.startWeek || PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase) || b.score - a.score);
  return {
    tasks,
    backlog,
    hoursPerWeek: hpw,
    weeks: Array.from({ length: totalWeeks }, (_, i) => ({
      n: i + 1,
      start: addDays(startDate, i * 7),
      hours: Math.round((hpw - cap[i + 1]) * 10) / 10,
    })),
  };
}
