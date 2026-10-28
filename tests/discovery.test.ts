import { describe, expect, it } from "vitest";
import { discoveryQueries, headTerms } from "../src/lib/analysis/discovery";
import type { SiteTerm } from "../src/lib/types";

function term(key: string, pages: number, inTitle: number, inH1: number, inH2: number): SiteTerm {
  return { key, label: key, ngram: key.split(" ").length, score: pages, norm: 0, pages, inTitle, inH1, inH2, inMeta: 0, body: 0, bestPage: null, prominentUrls: [] };
}

// Shaped like a real fashion store crawl: product furniture, sizes and product names mixed with the real category words.
const map = new Map<string, SiteTerm>(
  [
    term("trovélle", 15, 15, 1, 1),
    term("dress", 9, 2, 2, 1),
    term("blazer", 4, 3, 3, 0),
    term("co-ord set", 6, 1, 1, 0),
    term("designer", 4, 0, 1, 2),
    term("size", 12, 0, 0, 0),
    term("xxl", 10, 0, 0, 0),
    term("add", 10, 0, 0, 0),
    term("black", 7, 1, 1, 0),
    term("frida", 2, 2, 2, 0),
    term("frida blazer", 2, 2, 2, 0),
    term("ask a question", 4, 0, 0, 4),
    term("denim", 4, 0, 1, 0),
  ].map((t) => [t.key, t]),
);

describe("competitor discovery queries", () => {
  it("picks what the shop sells, not page furniture, sizes, colours or the brand", () => {
    const keys = headTerms(map, ["trovelle", "trovélle"]).map((t) => t.key);
    expect(keys).toContain("dress");
    expect(keys).toContain("designer");
    for (const bad of ["size", "xxl", "add", "black", "trovélle", "ask a question"]) expect(keys).not.toContain(bad);
  });

  it("does not repeat a phrase and its own words", () => {
    const keys = headTerms(map, ["trovelle"]).map((t) => t.key);
    expect(keys.includes("frida") && keys.includes("frida blazer")).toBe(false);
  });

  it("adds the country so results are local rivals, and stays within the cap", () => {
    const qs = discoveryQueries(map, ["trovelle"], "in", 6);
    expect(qs.length).toBeGreaterThan(2);
    expect(qs.length).toBeLessThanOrEqual(6);
    expect(qs.every((q) => q.includes("india"))).toBe(true);
    expect(qs.some((q) => q.startsWith("dress"))).toBe(true);
  });

  it("returns nothing when the site has no usable topics", () => {
    expect(discoveryQueries(new Map(), [], "us")).toEqual([]);
  });
});
