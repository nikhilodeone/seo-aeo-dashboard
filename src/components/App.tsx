"use client";

import { useState } from "react";
import { AppProvider, useApp, type View } from "@/lib/client/store";
import { Dashboard } from "./Dashboard";
import { Setup } from "./Setup";
import { Button, Icon } from "./ui";

export function App() {
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  );
}

function Router() {
  const { ready, raw, running, needPasscode, caps } = useApp();
  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center text-ink-2">
        <p className="pulse-dot">Loading…</p>
      </main>
    );
  }
  if (needPasscode && caps?.passcodeRequired) return <PasscodeGate />;
  if (running) return <Progress />;
  if (!raw) return <Setup />;
  return <Dashboard />;
}

function PasscodeGate() {
  const { submitPasscode } = useApp();
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Enter the passcode</h1>
      <p className="mt-2 text-ink-2">This deployment is protected so only people you trust can spend its search and AI credits.</p>
      <form
        className="mt-6 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setBad(!(await submitPasscode(value)));
          setBusy(false);
        }}
      >
        <label className="block text-sm font-medium" htmlFor="pass">
          Passcode
        </label>
        <input id="pass" type="password" autoFocus autoComplete="current-password" value={value} onChange={(e) => setValue(e.target.value)} className="w-full rounded-md border border-line bg-surface px-3.5 py-2.5" />
        {bad && <p className="text-sm text-crit" role="alert">That passcode is not right. Check it and try again.</p>}
        <Button variant="primary" disabled={!value || busy} type="submit">
          Unlock
        </Button>
      </form>
    </main>
  );
}

function Progress() {
  const { steps, raw } = useApp();
  const host = raw?.own.domain;
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <h1 className="text-[1.75rem] font-semibold tracking-tight">Building your dashboard{host ? ` for ${host}` : ""}</h1>
      <p className="mt-2 text-ink-2">This usually takes 20 to 60 seconds. You can leave this tab open.</p>
      <ol className="mt-8 divide-y divide-line border-y border-line" aria-live="polite">
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-3 py-3.5">
            <span className="mt-0.5 w-5 shrink-0" aria-hidden="true">
              {s.status === "done" && (
                <span style={{ color: "var(--good)" }}>
                  <Icon name="check" size={18} />
                </span>
              )}
              {s.status === "running" && <span className="pulse-dot block h-2.5 w-2.5 translate-y-1.5 rounded-full bg-accent" />}
              {s.status === "pending" && <span className="block h-2.5 w-2.5 translate-y-1.5 rounded-full border border-ink-3" />}
              {s.status === "skipped" && <span className="text-ink-3"><Icon name="dot" size={18} /></span>}
              {s.status === "error" && <span style={{ color: "var(--crit)" }}><Icon name="x" size={18} /></span>}
            </span>
            <div>
              <p className={s.status === "pending" ? "text-ink-3" : "font-medium"}>
                {s.label}
                <span className="sr-only"> ({s.status})</span>
              </p>
              {s.detail && <p className="text-sm text-ink-2">{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
