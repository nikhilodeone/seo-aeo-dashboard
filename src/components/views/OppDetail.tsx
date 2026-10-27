"use client";

import { useApp } from "@/lib/client/store";
import type { Opportunity } from "@/lib/types";
import { pathOf } from "@/lib/util";
import { Basis, Button, Icon, Tag, TYPE_LABEL } from "../ui";

export function OppDetail({ o }: { o: Opportunity }) {
  const { report, setView } = useApp();
  const brief = report?.briefs.find((b) => b.keyword === o.keyword && (o.type === "content-gap" || o.type === "onpage" || o.type === "striking"));
  return (
    <div className="grid gap-6 text-sm md:grid-cols-[1.1fr_1fr]">
      <div>
        <p className="text-ink-2">{o.why}</p>
        <h4 className="mt-4 font-medium">What we found</h4>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">
          {o.evidence.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
          <Basis c={o.confidence} />
          <span>{o.basis}</span>
        </p>
      </div>
      <div>
        <h4 className="font-medium">What to do</h4>
        <ol className="mt-1 list-decimal space-y-1.5 pl-5">
          {o.actions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {o.targetUrl && (
            <a href={o.targetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent underline underline-offset-2">
              {pathOf(o.targetUrl)}
              <Icon name="link" size={12} />
            </a>
          )}
          {o.extraClicks ? <Tag title="Estimated from your impressions and a generic click-through curve">about +{o.extraClicks} clicks a month</Tag> : null}
          <Tag>{TYPE_LABEL[o.type]}</Tag>
          <Tag>{o.effortHrs}h of work</Tag>
          {brief && (
            <Button size="sm" onClick={() => setView("content", brief.id)}>
              Open content brief
              <Icon name="arrow" size={14} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
