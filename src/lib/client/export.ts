import type { Brief, Opportunity, Plan, Report } from "../types";
import type { AiBrief } from "./api";

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n");

export function download(filename: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function opportunitiesCsv(opps: Opportunity[]): string {
  return toCsv([
    ["Score", "Phase", "Type", "Title", "Keyword", "Impact", "Ease", "Effort (hrs)", "Data basis", "Target page", "Why", "Evidence", "Actions"],
    ...opps.map((o) => [o.score, o.phase, o.type, o.title, o.keyword ?? "", o.impact, o.ease, o.effortHrs, o.confidence, o.targetUrl ?? "", o.why, o.evidence.join(" | "), o.actions.join(" | ")]),
  ]);
}

export function planCsv(plan: Plan, done: Set<string>): string {
  return toCsv([
    ["Weeks", "Starts", "Phase", "Task", "Hours", "Done"],
    ...plan.tasks.map((t) => [t.startWeek === t.endWeek ? `Week ${t.startWeek}` : `Weeks ${t.startWeek}-${t.endWeek}`, plan.weeks[t.startWeek - 1]?.start ?? "", t.phase, t.title, t.effortHrs, done.has(t.oppId) ? "yes" : ""]),
  ]);
}

export function planMarkdown(report: Report, done: Set<string>): string {
  const { plan } = report;
  const lines = [`# SEO and AEO plan for ${report.domain}`, "", `${plan.hoursPerWeek} hours a week, 12 weeks from ${plan.weeks[0]?.start}.`, ""];
  for (const phase of ["Foundations", "Quick wins", "Content build", "Measure"] as const) {
    const items = plan.tasks.filter((t) => t.phase === phase);
    if (!items.length) continue;
    lines.push(`## ${phase}`, "");
    for (const t of items) lines.push(`- [${done.has(t.oppId) ? "x" : " "}] ${t.startWeek === t.endWeek ? `Week ${t.startWeek}` : `Weeks ${t.startWeek}-${t.endWeek}`}: ${t.title} (${t.effortHrs}h)`);
    lines.push("");
  }
  if (plan.backlog.length) {
    lines.push("## Backlog", "");
    for (const t of plan.backlog) lines.push(`- ${t.title} (${t.effortHrs}h)`);
  }
  return lines.join("\n");
}

export function briefMarkdown(b: Brief, ai?: AiBrief): string {
  const L: string[] = [`# Content brief: ${b.keyword}`, "", `Search intent: ${b.intent}. ${b.mode === "new-page" ? "Create a new page." : `Improve ${b.targetUrl ?? "the best matching page"}.`}`, ""];
  L.push("## Title options", ...(ai?.titleOptions?.length ? ai.titleOptions : b.titleOptions).map((t) => `- ${t}`), "");
  L.push(`H1: ${ai?.h1 ?? b.h1}`, "", `Meta description: ${ai?.metaDescription ?? b.metaDescription}`, "");
  L.push("## Outline");
  if (ai?.outline?.length) for (const o of ai.outline) L.push(`- ${o.h2}`, ...(o.bullets ?? []).map((x) => `  - ${x}`));
  else for (const o of b.outline) L.push(`- ${o.h2}`);
  L.push("", `Target length: about ${b.wordCountTarget} words`, `Schema: ${b.schema.join(", ")}`, "", `Answer snippet tip: ${b.snippetHint}`, "");
  if (ai?.answerSnippet) L.push("## Draft direct answer", ai.answerSnippet, "");
  if (ai?.faq?.length) L.push("## FAQ", ...ai.faq.flatMap((f) => [`**${f.q}**`, f.a, ""]));
  else if (b.questions.length) L.push("## Questions to answer", ...b.questions.map((q) => `- ${q}`), "");
  if (b.internalLinks.length) L.push("## Link from these pages", ...b.internalLinks.map((l) => `- ${l.title}: ${l.url}`), "");
  if (b.competitorPages.length) L.push("## Competitor pages to beat", ...b.competitorPages.map((p) => `- ${p.domain}: ${p.title} (${p.words} words) ${p.url}`));
  return L.join("\n");
}
