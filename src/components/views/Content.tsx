"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/client/api";
import { briefMarkdown } from "@/lib/client/export";
import { useApp } from "@/lib/client/store";
import type { Brief } from "@/lib/types";
import { pathOf } from "@/lib/util";
import { Button, CopyButton, cx, Empty, Icon, Notice, PageHeader, Section, Tag } from "../ui";

export function Content() {
  const { report, raw, selectedBrief, setView, caps, aiBriefs, saveAiBrief } = useApp();
  const [id, setId] = useState<string | null>(selectedBrief);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (selectedBrief) setId(selectedBrief);
  }, [selectedBrief]);
  if (!report || !raw) return null;

  const briefs = report.briefs;
  const brief: Brief | undefined = briefs.find((b) => b.id === id) ?? briefs[0];
  const ai = brief ? aiBriefs[brief.id] : undefined;

  const generate = async (b: Brief) => {
    setBusy(true);
    setErr(null);
    try {
      const competitorHeadings = b.competitorPages
        .flatMap((p) => raw.competitors.find((c) => c.domain === p.domain)?.pages.find((x) => x.url === p.url)?.h2 ?? [])
        .slice(0, 20);
      const r = await api.aiBrief({
        keyword: b.keyword,
        intent: b.intent,
        mode: b.mode,
        targetUrl: b.targetUrl,
        domain: raw.own.domain,
        siteTopics: report.topTerms,
        competitorHeadings,
        questions: b.questions,
        outline: b.outline.map((o) => o.h2),
      });
      saveAiBrief(b.id, r.brief);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Content briefs" lead="A starting brief for each page worth writing or fixing, built from the headings and questions that already rank." />
      {briefs.length === 0 ? (
        <Empty title="No briefs yet" action={<Button onClick={() => setView("competitors")}>Add competitors</Button>}>
          Briefs are created for new-content and on-page opportunities. Add competitors or Search Console data to generate them.
        </Empty>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <nav aria-label="Briefs">
            <ul className="divide-y divide-line border-y border-line">
              {briefs.map((b) => (
                <li key={b.id}>
                  <button onClick={() => setId(b.id)} aria-current={brief?.id === b.id} className={cx("block w-full px-2 py-3 text-left hover:bg-accent-soft", brief?.id === b.id && "bg-accent-soft")}>
                    <span className="block font-medium leading-snug">{b.keyword}</span>
                    <span className="mt-1 flex gap-2 text-xs text-ink-2">
                      <span>{b.mode === "new-page" ? "New page" : "Improve page"}</span>
                      <span>{b.intent === "general" ? "mixed intent" : b.intent}</span>
                      {aiBriefs[b.id] && <span className="text-accent">AI draft</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {brief && (
            <article className="min-w-0 space-y-8">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">{brief.keyword}</h2>
                  <p className="mt-1 text-ink-2">
                    {brief.mode === "new-page" ? "Create a new page." : <>Improve <a className="text-accent underline underline-offset-2" href={brief.targetUrl ?? "#"} target="_blank" rel="noopener noreferrer">{brief.targetUrl ? pathOf(brief.targetUrl) : "the best matching page"}</a>.</>} Aim for about {brief.wordCountTarget} words.
                  </p>
                </div>
                <div className="flex gap-2">
                  <CopyButton text={briefMarkdown(brief, ai)} label="Copy as Markdown" />
                  {caps?.ai && (
                    <Button size="sm" variant="primary" disabled={busy} onClick={() => void generate(brief)}>
                      <Icon name="refresh" size={14} />
                      {busy ? "Writing…" : ai ? "Rewrite with AI" : "Draft with AI"}
                    </Button>
                  )}
                </div>
              </header>
              {err && <Notice tone="crit" title="AI draft failed">{err}</Notice>}
              {!caps?.ai && <p className="text-sm text-ink-2">Set ANTHROPIC_API_KEY to let AI write titles, a direct answer and FAQs from this brief.</p>}

              {ai && (
                <Section title="AI draft" lead="Check every fact before publishing. Placeholders in [brackets] need your real data.">
                  <div className="space-y-5 rounded-md border border-line bg-surface p-5 text-sm">
                    {ai.titleOptions && (
                      <div>
                        <h4 className="font-medium">Title options</h4>
                        <ul className="mt-1 list-disc pl-5">{ai.titleOptions.map((t) => <li key={t}>{t}</li>)}</ul>
                      </div>
                    )}
                    {ai.metaDescription && <p><span className="font-medium">Meta description: </span>{ai.metaDescription}</p>}
                    {ai.answerSnippet && (
                      <div>
                        <h4 className="font-medium">Direct answer for the top of the page</h4>
                        <p className="mt-1 border-l-2 border-accent pl-3">{ai.answerSnippet}</p>
                      </div>
                    )}
                    {ai.outline && (
                      <div>
                        <h4 className="font-medium">Outline</h4>
                        <ol className="mt-1 space-y-2 pl-5">
                          {ai.outline.map((o) => (
                            <li key={o.h2} className="list-decimal">
                              <span className="font-medium">{o.h2}</span>
                              {o.bullets && <ul className="list-disc pl-5 text-ink-2">{o.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {ai.faq && (
                      <div>
                        <h4 className="font-medium">FAQ</h4>
                        <dl className="mt-1 space-y-3">{ai.faq.map((f) => <div key={f.q}><dt className="font-medium">{f.q}</dt><dd className="text-ink-2">{f.a}</dd></div>)}</dl>
                      </div>
                    )}
                    {ai.notes && <p className="text-ink-2">{ai.notes}</p>}
                  </div>
                </Section>
              )}

              <Section title="Title and description">
                <ul className="space-y-1.5">
                  {brief.titleOptions.map((t) => (
                    <li key={t} className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
                      <span className="font-medium">{t}</span>
                      <span className="tnum text-xs text-ink-3">{t.length} characters</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm"><span className="font-medium">H1: </span>{brief.h1}</p>
                <p className="mt-1 text-sm"><span className="font-medium">Meta description: </span>{brief.metaDescription} <span className="tnum text-xs text-ink-3">({brief.metaDescription.length})</span></p>
                <p className="mt-2 text-xs text-ink-2">Starter wording from a template. Edit it so it sounds like you, or use the AI draft.</p>
              </Section>

              <Section title="Outline" lead="Sections competitors' pages on this topic share, plus questions people ask.">
                <ol className="space-y-1.5">
                  {brief.outline.map((o) => (
                    <li key={o.h2} className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
                      <span>{o.h2}</span>
                      <Tag>{o.source === "competitor" ? "Competitors use it" : o.source === "question" ? "Audience question" : "Template"}</Tag>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-sm text-ink-2"><span className="font-medium text-ink">Make the answer quotable: </span>{brief.snippetHint}</p>
              </Section>

              <div className="grid gap-8 md:grid-cols-2">
                <Section title="Add schema">
                  <ul className="list-disc space-y-1 pl-5">{brief.schema.map((s) => <li key={s}>{s}</li>)}</ul>
                </Section>
                <Section title="Link to it from">
                  {brief.internalLinks.length ? (
                    <ul className="space-y-1.5 text-sm">{brief.internalLinks.map((l) => <li key={l.url}><a className="text-accent underline underline-offset-2" href={l.url} target="_blank" rel="noopener noreferrer">{l.title}</a></li>)}</ul>
                  ) : (
                    <p className="text-sm text-ink-2">No related pages found. Link from your home page or a hub page.</p>
                  )}
                </Section>
              </div>

              {brief.competitorPages.length > 0 && (
                <Section title="Pages to beat">
                  <ul className="divide-y divide-line border-y border-line text-sm">
                    {brief.competitorPages.map((p) => (
                      <li key={p.url} className="flex items-baseline justify-between gap-4 py-2">
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">{p.title || p.url}</a>
                        <span className="shrink-0 text-xs text-ink-2">{p.domain}, <span className="tnum">{p.words}</span> words</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </article>
          )}
        </div>
      )}
    </div>
  );
}
