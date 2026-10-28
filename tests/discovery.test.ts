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

import { contextQueries, matchBrandDomain, parseContext } from "../src/lib/analysis/discovery";

describe("owner description", () => {
  const text = "Indian designer womenswear label for parties and weddings. Rivals like Aza, Ogaan and Pernia's Pop-Up. Also compete with perniaspopupshop.com and https://www.kalkifashion.com/women";

  it("pulls out typed domains and capitalised rival names", () => {
    const c = parseContext(text);
    expect(c.domains).toEqual(["perniaspopupshop.com", "kalkifashion.com"]);
    expect(c.rivalNames).toEqual(expect.arrayContaining(["Aza", "Ogaan", "Pernia's Pop-Up"]));
  });

  it("does not mistake ordinary 'like' phrases or abbreviations for rivals", () => {
    const c = parseContext("We run a boutique like a small studio, e.g. for gifts. Founded by i.e. nobody.");
    expect(c.rivalNames).toEqual([]);
    expect(c.domains).toEqual([]);
  });

  it("builds search queries from the description without the rival clause", () => {
    const qs = contextQueries(parseContext(text).topicText, "in");
    expect(qs.length).toBeGreaterThan(0);
    expect(qs[0]).toContain("designer");
    expect(qs[0]).toContain("india");
    expect(qs.join(" ")).not.toMatch(/aza|ogaan/);
  });

  it("returns no queries for a description with nothing to search", () => {
    expect(contextQueries("We sell stuff", "us")).toEqual([]);
  });

  it("matches a brand name to its own site, not a listicle", () => {
    expect(matchBrandDomain("Pernia's Pop-Up", ["vogue.in", "perniaspopupshop.com"])).toBe("perniaspopupshop.com");
    expect(matchBrandDomain("Ogaan", ["ogaan.com", "ensembleindia.com"])).toBe("ogaan.com");
    expect(matchBrandDomain("Aza", ["vogue.in", "azafashions.com"])).toBe("azafashions.com");
    expect(matchBrandDomain("Aza", ["vogue.in", "ensembleindia.com"])).toBeNull();
  });
});
