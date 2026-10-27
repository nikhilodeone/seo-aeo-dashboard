"use client";

import { useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Confidence, Opportunity, OppType, Phase } from "@/lib/types";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

/* ---------- Icons ---------- */
type IconName = "check" | "x" | "half" | "up" | "down" | "link" | "chevron" | "arrow" | "alert" | "info" | "copy" | "download" | "refresh" | "plus" | "dot";
const PATHS: Record<IconName, ReactNode> = {
  check: <path d="M4 10.5 8 14.5 16 5.5" />,
  x: <path d="M5 5l10 10M15 5 5 15" />,
  half: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 3.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" stroke="none" />
    </>
  ),
  up: <path d="M10 16V5m0 0-4 4m4-4 4 4" />,
  down: <path d="M10 4v11m0 0-4-4m4 4 4-4" />,
  link: <path d="M8 5H5.5A1.5 1.5 0 0 0 4 6.5v8A1.5 1.5 0 0 0 5.5 16h8a1.5 1.5 0 0 0 1.5-1.5V12M11 4h5v5M16 4l-7 7" />,
  chevron: <path d="m7 5 5 5-5 5" />,
  arrow: <path d="M4 10h12m0 0-4-4m4 4-4 4" />,
  alert: <path d="M10 6v5m0 3.2v.1M10 2.5 18 16.5H2z" />,
  info: <path d="M10 9v5m0-8v.1M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z" />,
  copy: <path d="M7 7V4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5v7a1.5 1.5 0 0 1-1.5 1.5H13M4.5 7h7A1.5 1.5 0 0 1 13 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 15.5v-7A1.5 1.5 0 0 1 4.5 7z" />,
  download: <path d="M10 3v10m0 0-4-4m4 4 4-4M4 16h12" />,
  refresh: <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3v4h-4" />,
  plus: <path d="M10 4v12M4 10h12" />,
  dot: <circle cx="10" cy="10" r="4" fill="currentColor" stroke="none" />,
};

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {PATHS[name]}
    </svg>
  );
}

/* ---------- Buttons ---------- */
export function Button({ variant = "secondary", size = "md", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "px-2.5 py-1 text-sm",
        size === "md" && "px-3.5 py-2 text-sm",
        size === "lg" && "px-6 py-3.5 text-base",
        variant === "primary" && "bg-accent text-white hover:brightness-110",
        variant === "secondary" && "border border-line bg-surface text-ink hover:border-ink-3",
        variant === "ghost" && "text-ink-2 hover:bg-accent-soft hover:text-ink",
        className,
      )}
    />
  );
}

/* ---------- Data-basis chip ---------- */
const BASIS: Record<Confidence, { label: string; icon: IconName; tip: string }> = {
  measured: { label: "Measured", icon: "dot", tip: "From Search Console data or live Google results" },
  crawled: { label: "Crawled", icon: "half", tip: "Seen directly on the pages we read" },
  estimated: { label: "Estimated", icon: "info", tip: "A rule of thumb or suggestion. Verify before investing heavily" },
};
export function Basis({ c }: { c: Confidence }) {
  const b = BASIS[c];
  return (
    <span title={b.tip} className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-ink-2">
      <Icon name={b.icon} size={12} />
      {b.label}
    </span>
  );
}

export type Tone = "good" | "warn" | "serious" | "crit" | "neutral" | "accent";
const TONE: Record<Tone, { cls: string; icon: IconName }> = {
  good: { cls: "text-good-ink", icon: "check" },
  warn: { cls: "text-ink", icon: "alert" },
  serious: { cls: "text-ink", icon: "alert" },
  crit: { cls: "text-crit", icon: "x" },
  neutral: { cls: "text-ink-2", icon: "dot" },
  accent: { cls: "text-accent", icon: "dot" },
};
const TONE_COLOR: Record<Tone, string> = { good: "var(--good)", warn: "var(--warn)", serious: "var(--serious)", crit: "var(--crit)", neutral: "var(--ink-3)", accent: "var(--accent)" };

/** Status label: always icon + text, never colour alone. */
export function Status({ tone, children, icon }: { tone: Tone; children: ReactNode; icon?: IconName }) {
  const t = TONE[tone];
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium", t.cls)}>
      <span style={{ color: TONE_COLOR[tone] }}>
        <Icon name={icon ?? t.icon} size={14} />
      </span>
      {children}
    </span>
  );
}

export function Tag({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-block rounded border border-line px-1.5 py-px text-xs text-ink-2">
      {children}
    </span>
  );
}

/* ---------- Layout ---------- */
export function Section({ title, aside, children, className, id, lead }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; id?: string; lead?: ReactNode }) {
  return (
    <section id={id} className={cx("border-t border-line pt-6", className)}>
      {(title || aside) && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            {title && <h2 className="text-xl font-semibold tracking-tight">{title}</h2>}
            {lead && <p className="mt-1 max-w-[62ch] text-ink-2">{lead}</p>}
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, lead, actions }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{title}</h1>
        {lead && <p className="mt-1.5 max-w-[66ch] text-ink-2">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line px-5 py-8">
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 max-w-[60ch] text-ink-2">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "neutral", title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-md border border-line bg-surface px-4 py-3" role={tone === "crit" ? "alert" : undefined}>
      <span className="mt-0.5 shrink-0" style={{ color: TONE_COLOR[tone] }}>
        <Icon name={tone === "crit" ? "alert" : "info"} size={18} />
      </span>
      <div className="text-sm">
        {title && <p className="font-medium">{title}</p>}
        <div className="text-ink-2">{children}</div>
      </div>
    </div>
  );
}

export function Disclosure({ summary, children, open }: { summary: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-md border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
        <Icon name="chevron" size={14} className="transition-transform group-open:rotate-90" />
        {summary}
      </summary>
      <div className="border-t border-line px-4 py-4 text-ink-2">{children}</div>
    </details>
  );
}

/* ---------- Charts ---------- */
export function ScoreRing({ value, label, size = 132 }: { value: number; label: string; size?: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const band = value >= 70 ? "Strong" : value >= 40 ? "Fair" : "Weak";
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 132 132" role="img" aria-label={`${label}: ${value} out of 100, ${band}`}>
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--accent)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 66 66)" />
        <text x="66" y="68" textAnchor="middle" className="fill-ink" style={{ fontSize: 34, fontWeight: 600 }}>
          {value}
        </text>
        <text x="66" y="88" textAnchor="middle" className="fill-ink-2" style={{ fontSize: 12 }}>
          out of 100
        </text>
      </svg>
      <div>
        <p className="font-semibold">{label}</p>
        <p className="text-sm text-ink-2">{band}</p>
      </div>
    </div>
  );
}

export function Meter({ value, max = 100, className, ariaLabel }: { value: number; max?: number; className?: string; ariaLabel?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cx("h-2 w-full overflow-hidden rounded-sm bg-line", className)} role="img" aria-label={ariaLabel ?? `${Math.round(value)} of ${max}`}>
      <div className="h-full rounded-sm bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Own site highlighted, competitors in neutral. Direct value labels, no legend needed. */
export function CompareBars({ rows }: { rows: { label: string; value: number; own?: boolean }[] }) {
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-sm">
          <span className={cx("truncate", r.own && "font-semibold")} title={r.label}>
            {r.own ? "You" : r.label}
          </span>
          <div className="h-3 overflow-hidden rounded-sm bg-line" role="img" aria-label={`${r.label}: ${r.value} out of 100`}>
            <div className="h-full rounded-sm" style={{ width: `${r.value}%`, background: r.own ? "var(--accent)" : "var(--ink-3)" }} />
          </div>
          <span className="tnum text-right font-medium">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export const PHASE_COLOR: Record<Phase, string> = {
  Foundations: "var(--c1)",
  "Quick wins": "var(--c2)",
  "Content build": "var(--c3)",
  Measure: "var(--ink-3)",
};

function jitter(id: string, n: number) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000 - 0.5) * n;
}

export function Matrix({ opps, selected, onSelect }: { opps: Opportunity[]; selected: string | null; onSelect: (id: string) => void }) {
  const W = 560;
  const H = 360;
  const L = 44;
  const B = 38;
  const T = 10;
  const R = 10;
  const pw = W - L - R;
  const ph = H - T - B;
  const x = (ease: number) => L + (ease / 100) * pw;
  const y = (impact: number) => T + (1 - impact / 100) * ph;
  const qx = x(60);
  const qy = y(40);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="group" aria-label="Opportunity matrix: impact against ease">
        <rect x={qx} y={T} width={L + pw - qx} height={qy - T} fill="var(--accent-soft)" />
        {[0, 20, 40, 60, 80, 100].map((t) => (
          <g key={t}>
            <line x1={L} x2={L + pw} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <line x1={x(t)} x2={x(t)} y1={T} y2={T + ph} stroke="var(--line)" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="fill-ink-3" style={{ fontSize: 11 }}>
              {t}
            </text>
            <text x={x(t)} y={T + ph + 16} textAnchor="middle" className="fill-ink-3" style={{ fontSize: 11 }}>
              {t}
            </text>
          </g>
        ))}
        <text x={L + pw - 8} y={T + 18} textAnchor="end" className="fill-ink" style={{ fontSize: 13, fontWeight: 600 }}>
          Quick wins
        </text>
        <text x={L + pw / 2} y={H - 4} textAnchor="middle" className="fill-ink-2" style={{ fontSize: 12 }}>
          Ease (harder to easier)
        </text>
        <text transform={`translate(12 ${T + ph / 2}) rotate(-90)`} textAnchor="middle" className="fill-ink-2" style={{ fontSize: 12 }}>
          Impact (lower to higher)
        </text>
        {opps.map((o) => {
          const sel = o.id === selected;
          const cx0 = x(o.ease) + jitter(o.id, 8);
          const cy0 = y(o.impact) + jitter(`${o.id}y`, 8);
          return (
            <circle
              key={o.id}
              cx={cx0}
              cy={cy0}
              r={sel ? 8 : 5.5}
              fill={PHASE_COLOR[o.phase]}
              stroke={sel ? "var(--ink)" : "var(--surface)"}
              strokeWidth={sel ? 2.5 : 2}
              tabIndex={0}
              role="button"
              aria-label={`${o.title}. Impact ${o.impact}, ease ${o.ease}`}
              className="cursor-pointer"
              onClick={() => onSelect(o.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(o.id))}
            >
              <title>{o.title}</title>
            </circle>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
        {(["Foundations", "Quick wins", "Content build"] as Phase[]).map((p) => (
          <li key={p} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PHASE_COLOR[p] }} />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Sorting ---------- */
export function useSort<T>(rows: T[], initialKey: string, getters: Record<string, (r: T) => number | string | null>, initialDir: "asc" | "desc" = "desc") {
  const [key, setKey] = useState(initialKey);
  const [dir, setDir] = useState<"asc" | "desc">(initialDir);
  const sorted = useMemo(() => {
    const g = getters[key];
    if (!g) return rows;
    return [...rows].sort((a, b) => {
      const va = g(a);
      const vb = g(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return dir === "asc" ? c : -c;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, key, dir]);
  const toggle = (k: string, defaultDir: "asc" | "desc" = "desc") => {
    if (k === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setKey(k);
      setDir(defaultDir);
    }
  };
  return { sorted, key, dir, toggle };
}

export function Th({ children, k, sort, align = "left", className }: { children: ReactNode; k?: string; sort?: { key: string; dir: "asc" | "desc"; toggle: (k: string, d?: "asc" | "desc") => void }; align?: "left" | "right"; className?: string }) {
  const active = sort && k === sort.key;
  return (
    <th scope="col" aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined} className={cx("px-3 py-2 text-xs font-medium text-ink-2", align === "right" ? "text-right" : "text-left", className)}>
      {k && sort ? (
        <button type="button" onClick={() => sort.toggle(k)} className={cx("inline-flex items-center gap-1 hover:text-ink", active && "text-ink")}>
          {children}
          {active && <Icon name={sort.dir === "asc" ? "up" : "down"} size={11} />}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-md border border-line bg-surface">{children}</div>;
}

export const TYPE_LABEL: Record<OppType, string> = {
  striking: "Striking distance",
  ctr: "Click-through",
  onpage: "On-page",
  "content-gap": "New content",
  "aeo-question": "Answer a question",
  snippet: "Featured answer",
  technical: "Technical fix",
  "aeo-infra": "AEO foundation",
};

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-md border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("rounded px-3 py-1.5 text-sm font-medium transition-colors", value === o.value ? "bg-accent text-white" : "text-ink-2 hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1800);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      <Icon name={ok ? "check" : "copy"} size={14} />
      {ok ? "Copied" : label}
    </Button>
  );
}
