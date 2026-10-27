"use client";

import { useApp, type View } from "@/lib/client/store";
import { Notice } from "./ui";

export const NAV: { id: View; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "opportunities", label: "Opportunities" },
  { id: "keywords", label: "Keywords" },
  { id: "aeo", label: "Answer engines" },
  { id: "content", label: "Content briefs" },
  { id: "plan", label: "12-week plan" },
  { id: "competitors", label: "Competitors" },
  { id: "pages", label: "Pages" },
  { id: "data", label: "Data and settings" },
];

export function ErrorNotice() {
  const { error, clearError } = useApp();
  if (!error) return null;
  return (
    <div className="mb-6">
      <Notice tone="crit" title="Analysis stopped">
        <p>{error}</p>
        <button onClick={clearError} className="mt-2 text-accent underline underline-offset-2">
          Dismiss
        </button>
      </Notice>
    </div>
  );
}
