"use client";

import { useApp } from "@/lib/client/store";
import { AI_RETRIEVAL_BOTS, AI_TRAINING_BOTS } from "@/lib/text";
import type { BotAccess } from "@/lib/types";
import { pathOf } from "@/lib/util";
import { Basis, Empty, Notice, PageHeader, ScoreRing, Section, Status, TableWrap, Tag, Th } from "../ui";

function Cell({ ratio }: { ratio: number }) {
  if (ratio >= 0.75) return <Status tone="good">Yes</Status>;
  if (ratio >= 0.25) return <Status tone="warn" icon="half">Partly</Status>;
  return <Status tone="crit">No</Status>;
}

function Bot({ v }: { v: BotAccess }) {
  if (v === "blocked") return <Status tone="crit">Blocked</Status>;
  if (v === "allowed") return <Status tone="good">Allowed</Status>;
  return <Status tone="good" icon="dot">Open</Status>;
}

export function Aeo() {
  const { report, raw, setView } = useApp();
  if (!report || !raw) return null;
  const sites = [{ domain: `You`, aeo: report.ownAeo, profile: raw.own }, ...report.competitorAeo.map((a, i) => ({ domain: a.domain, aeo: a, profile: raw.competitors[i] }))];
  const unanswered = report.questions.filter((q) => !q.answered);
  const src = { serp: "Google People Also Ask", ai: "AI suggestion", pattern: "Pattern" } as const;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Answer engines"
        lead="Whether ChatGPT, Perplexity, Claude, Gemini and Google's AI answers can read your site, trust it and quote it. This is what the pages and robots.txt show, not a measure of how often you are cited."
      />

      <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-center">
        <ScoreRing value={report.ownAeo.score} label="Your readiness" />
        <div className="space-y-2 text-ink-2">
          <p>
            Weakest areas: {report.ownAeo.checks.filter((c) => c.ratio < 0.5).sort((a, b) => b.weight - a.weight).slice(0, 3).map((c) => c.label.toLowerCase()).join("; ") || "none, you pass the main checks"}.
          </p>
          <p className="text-sm">No provider guarantees citations. These checks cover what they have said about crawling and what consistently makes pages easy to quote.</p>
        </div>
      </div>

      <Section title="Readiness checklist" lead="Your site first, then each competitor we read.">
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="border-b border-line">
              <tr>
                <Th>Check</Th>
                {sites.map((s) => (
                  <Th key={s.domain}>{s.domain}</Th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {report.ownAeo.checks.map((c, i) => (
                <tr key={c.id}>
                  <td className="max-w-[26rem] px-3 py-3 align-top">
                    <p className="font-medium">{c.label}</p>
                    <p className="mt-0.5 text-xs text-ink-2">Your site: {c.detail}</p>
                    {c.ratio < 0.75 && <p className="mt-1 text-xs text-ink-2"><span className="font-medium text-ink">Fix:</span> {c.fix}</p>}
                  </td>
                  {sites.map((s) => (
                    <td key={s.domain} className="px-3 py-3 align-top"><Cell ratio={s.aeo.checks[i].ratio} /></td>
                  ))}
                </tr>
              ))}
              <tr className="bg-accent-soft">
                <td className="px-3 py-2.5 font-semibold">Score</td>
                {sites.map((s) => (
                  <td key={s.domain} className="tnum px-3 py-2.5 font-semibold">{s.aeo.score}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </TableWrap>
      </Section>

      <Section title="AI crawler access" lead="From each site's robots.txt. Blocking search bots stops assistants fetching your pages to answer questions. Blocking training bots only affects model training.">
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="border-b border-line">
              <tr>
                <Th>Bot</Th>
                {sites.map((s) => (
                  <Th key={s.domain}>{s.domain}</Th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr><td colSpan={sites.length + 1} className="bg-plane px-3 py-1.5 text-xs font-medium text-ink-2">Search and answer bots (blocking costs citations)</td></tr>
              {AI_RETRIEVAL_BOTS.map((b) => (
                <tr key={b}>
                  <td className="px-3 py-2">{b}</td>
                  {sites.map((s) => (
                    <td key={s.domain} className="px-3 py-2"><Bot v={s.profile.robots.bots[b] ?? "unspecified"} /></td>
                  ))}
                </tr>
              ))}
              <tr><td colSpan={sites.length + 1} className="bg-plane px-3 py-1.5 text-xs font-medium text-ink-2">Training bots (your call)</td></tr>
              {AI_TRAINING_BOTS.map((b) => (
                <tr key={b}>
                  <td className="px-3 py-2">{b}</td>
                  {sites.map((s) => (
                    <td key={s.domain} className="px-3 py-2"><Bot v={s.profile.robots.bots[b] ?? "unspecified"} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <p className="mt-2 text-xs text-ink-2">"Open" means robots.txt has no rule for that bot, so it can crawl.</p>
      </Section>

      <Section
        title="Questions your audience asks"
        lead={`${unanswered.length} of ${report.questions.length} have no matching heading on your site. A heading phrased as the question, followed by a short direct answer, is the format assistants and answer boxes quote.`}
      >
        {report.questions.length === 0 ? (
          <Empty title="No questions yet">Add a Serper key for real People Also Ask questions, or an Anthropic key for AI suggestions.</Empty>
        ) : (
          <>
            {report.questions.every((q) => q.source === "pattern") && (
              <div className="mb-4">
                <Notice title="These questions are generated from patterns, not search data">Check they match real demand before writing. A Serper key swaps them for Google's People Also Ask.</Notice>
              </div>
            )}
            <TableWrap>
              <table className="w-full text-sm">
                <thead className="border-b border-line">
                  <tr>
                    <Th>Question</Th>
                    <Th>Source</Th>
                    <Th>On your site</Th>
                    <Th>Competitors answering</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {report.questions.map((q) => (
                    <tr key={q.q}>
                      <td className="px-3 py-2.5"><span className="font-medium">{q.q}</span><span className="block text-xs text-ink-3">{q.topic}</span></td>
                      <td className="px-3 py-2.5"><Tag>{src[q.source]}</Tag></td>
                      <td className="px-3 py-2.5">
                        {q.answered ? <Status tone="good">Answered{q.matchedUrl ? ` on ${pathOf(q.matchedUrl)}` : ""}</Status> : <Status tone="crit">Not answered</Status>}
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">{q.answeredBy.length ? q.answeredBy.join(", ") : "none found"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <p className="mt-3 text-sm text-ink-2">
              <Basis c="estimated" /> Matching compares the words of each question with your titles and headings, so a good answer under a differently worded heading may show as unanswered.
            </p>
            <button className="mt-3 text-sm text-accent underline underline-offset-2" onClick={() => setView("opportunities")}>See these as opportunities</button>
          </>
        )}
      </Section>

      <Section title="Test it yourself" lead="No tool can read AI assistants' answers reliably, so check by hand once a month. Ask these in ChatGPT, Perplexity, Gemini and Claude, and note whether your site is cited.">
        <ul className="grid gap-x-8 sm:grid-cols-2">
          {[...report.questions.slice(0, 5).map((q) => q.q), ...report.keywords.filter((k) => k.intent !== "navigational").slice(0, 5).map((k) => `What is the best ${k.label}?`)].slice(0, 10).map((p) => (
            <li key={p} className="border-b border-line py-2 text-sm">{p}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
