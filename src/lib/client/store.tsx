"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildReport } from "../analysis/report";
import type { Capabilities, GscRow, RawData, Report, RunInput } from "../types";
import { hostOf } from "../util";
import * as api from "./api";
import { initialSteps, runPipeline, type Step } from "./pipeline";
import { defaultSettings, load, pushSnapshot, save, type Persisted, type Settings } from "./storage";

export type View = "overview" | "keywords" | "competitors" | "opportunities" | "aeo" | "content" | "plan" | "pages" | "data";

interface Ctx {
  caps: Capabilities | null;
  ready: boolean;
  raw: RawData | null;
  report: Report | null;
  prevRaw: RawData | null;
  steps: Step[];
  running: boolean;
  error: string | null;
  needPasscode: boolean;
  settings: Settings;
  done: Set<string>;
  domains: string[];
  snapshots: Record<string, RawData[]>;
  aiBriefs: Persisted["aiBriefs"];
  view: View;
  selectedBrief: string | null;
  setView: (v: View, briefId?: string) => void;
  run: (input: RunInput) => Promise<void>;
  submitPasscode: (p: string) => Promise<boolean>;
  openDomain: (d: string) => void;
  newAnalysis: () => void;
  setGsc: (rows: GscRow[], months: number) => void;
  clearGsc: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  toggleDone: (id: string) => void;
  deleteDomain: (d: string) => void;
  saveAiBrief: (id: string, b: api.AiBrief) => void;
  importRaw: (text: string) => string | null;
  clearError: () => void;
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [ready, setReady] = useState(false);
  const [store, setStore] = useState<Persisted>({ snapshots: {}, last: null, settings: defaultSettings, done: {}, aiBriefs: {} });
  const [rawState, setRaw] = useState<{ raw: RawData | null; prev: RawData | null }>({ raw: null, prev: null });
  const [steps, setSteps] = useState<Step[]>(initialSteps());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needPasscode, setNeedPasscode] = useState(false);
  const [view, setViewState] = useState<View>("overview");
  const [selectedBrief, setSelectedBrief] = useState<string | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  const commit = useCallback((next: Persisted) => {
    storeRef.current = next;
    setStore(next);
    save(next);
  }, []);

  const fetchCaps = useCallback(async () => {
    const c = await api.getConfig();
    setCaps(c);
    setNeedPasscode(c.passcodeRequired && !c.authorized);
    return c;
  }, []);

  useEffect(() => {
    const p = load();
    setStore(p);
    storeRef.current = p;
    const list = p.last ? p.snapshots[p.last] : undefined;
    if (list?.length) setRaw({ raw: list[list.length - 1], prev: list.length > 1 ? list[list.length - 2] : null });
    fetchCaps()
      .catch((e: Error) => setError(e.message))
      .finally(() => setReady(true));
  }, [fetchCaps]);

  const raw = rawState.raw;
  const report = useMemo(() => {
    if (!raw) return null;
    try {
      return buildReport(raw, { hoursPerWeek: store.settings.hoursPerWeek, startDate: store.settings.startDate ?? undefined }, rawState.prev);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [raw, rawState.prev, store.settings.hoursPerWeek, store.settings.startDate]);

  const run = useCallback(
    async (input: RunInput) => {
      if (!caps) return;
      setError(null);
      setRunning(true);
      setSteps(initialSteps());
      const host = hostOf(input.url);
      const existing = storeRef.current.snapshots[host];
      const last = existing?.[existing.length - 1] ?? null;
      try {
        const next = await runPipeline(
          input,
          caps,
          { onStep: (id, status, detail) => setSteps((s) => s.map((x) => (x.id === id ? { ...x, status, detail: detail ?? x.detail } : x))) },
          last,
        );
        setSteps((s) => s.map((x) => (x.id === "build" ? { ...x, status: "done", detail: "Dashboard ready" } : x)));
        commit(pushSnapshot(storeRef.current, next));
        setRaw({ raw: next, prev: last });
        setViewState("overview");
      } catch (e) {
        if (e instanceof api.ApiError && e.code === "auth") {
          setNeedPasscode(true);
          setError("Enter the passcode to continue.");
        } else {
          setError((e as Error).message);
        }
        setSteps((s) => s.map((x) => (x.status === "running" ? { ...x, status: "error" } : x)));
      } finally {
        setRunning(false);
      }
    },
    [caps, commit],
  );

  const value: Ctx = {
    caps,
    ready,
    raw,
    report,
    prevRaw: rawState.prev,
    steps,
    running,
    error,
    needPasscode,
    settings: store.settings,
    done: new Set(store.done[raw?.own.domain ?? ""] ?? []),
    domains: Object.keys(store.snapshots),
    snapshots: store.snapshots,
    aiBriefs: store.aiBriefs,
    view,
    selectedBrief,
    setView: (v, briefId) => {
      setViewState(v);
      if (briefId) setSelectedBrief(briefId);
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    },
    run,
    submitPasscode: async (p) => {
      api.setPasscode(p);
      const c = await fetchCaps().catch(() => null);
      if (c && (!c.passcodeRequired || c.authorized)) {
        setError(null);
        return true;
      }
      return false;
    },
    openDomain: (d) => {
      const list = storeRef.current.snapshots[d];
      if (!list?.length) return;
      commit({ ...storeRef.current, last: d });
      setRaw({ raw: list[list.length - 1], prev: list.length > 1 ? list[list.length - 2] : null });
      setViewState("overview");
    },
    newAnalysis: () => {
      setRaw({ raw: null, prev: null });
      setError(null);
    },
    setGsc: (rows, months) => {
      if (!raw) return;
      const next: RawData = { ...raw, gsc: rows, gscMonths: months };
      const list = [...(storeRef.current.snapshots[raw.own.domain] ?? [])];
      list[list.length - 1] = next;
      commit({ ...storeRef.current, snapshots: { ...storeRef.current.snapshots, [raw.own.domain]: list } });
      setRaw((r) => ({ ...r, raw: next }));
    },
    clearGsc: () => {
      if (!raw) return;
      const next: RawData = { ...raw, gsc: [] };
      const list = [...(storeRef.current.snapshots[raw.own.domain] ?? [])];
      list[list.length - 1] = next;
      commit({ ...storeRef.current, snapshots: { ...storeRef.current.snapshots, [raw.own.domain]: list } });
      setRaw((r) => ({ ...r, raw: next }));
    },
    updateSettings: (patch) => commit({ ...storeRef.current, settings: { ...storeRef.current.settings, ...patch } }),
    toggleDone: (id) => {
      if (!raw) return;
      const d = raw.own.domain;
      const cur = new Set(storeRef.current.done[d] ?? []);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      commit({ ...storeRef.current, done: { ...storeRef.current.done, [d]: [...cur] } });
    },
    deleteDomain: (d) => {
      const snaps = { ...storeRef.current.snapshots };
      delete snaps[d];
      const done = { ...storeRef.current.done };
      delete done[d];
      const last = storeRef.current.last === d ? null : storeRef.current.last;
      commit({ ...storeRef.current, snapshots: snaps, done, last });
      if (raw?.own.domain === d) setRaw({ raw: null, prev: null });
    },
    saveAiBrief: (id, b) => commit({ ...storeRef.current, aiBriefs: { ...storeRef.current.aiBriefs, [id]: b } }),
    importRaw: (text) => {
      try {
        const parsed = JSON.parse(text) as RawData;
        if (parsed?.version !== 1 || !parsed.own?.pages || !parsed.own.domain) return "That file is not a dashboard export.";
        commit(pushSnapshot(storeRef.current, parsed));
        setRaw({ raw: parsed, prev: null });
        setViewState("overview");
        return null;
      } catch {
        return "That file could not be read as JSON.";
      }
    },
    clearError: () => setError(null),
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
