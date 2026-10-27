/**
 * End-to-end smoke test against the real Next.js server.
 * Run with:  npm run build && E2E=1 npm test
 */
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SiteProfile } from "@/lib/types";
import { compRoutes, ownRoutes, serve } from "./fixtures";

const run = process.env.E2E === "1";
const PORT = 3999;
const base = `http://127.0.0.1:${PORT}`;

let server: ChildProcess;
let own: Awaited<ReturnType<typeof serve>>;
let comp: Awaited<ReturnType<typeof serve>>;

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${base}/api/config`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start");
}

describe.skipIf(!run)("next server", () => {
  beforeAll(async () => {
    own = await serve("127.0.0.1", ownRoutes);
    comp = await serve("127.0.0.2", compRoutes);
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
      env: { ...process.env, ALLOW_PRIVATE_HOSTS: "true", DASHBOARD_PASSCODE: "s3cret" },
      stdio: "ignore",
    });
    await waitUp();
  }, 60_000);

  afterAll(async () => {
    server?.kill();
    await own?.close();
    await comp?.close();
  });

  const post = (path: string, body: unknown, pass?: string) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(pass ? { "x-passcode": pass } : {}) }, body: JSON.stringify(body) });

  it("reports capabilities without secrets", async () => {
    const c = await (await fetch(`${base}/api/config`)).json();
    expect(c).toMatchObject({ passcodeRequired: true, authorized: false, serp: false, ai: false });
    const ok = await (await fetch(`${base}/api/config`, { headers: { "x-passcode": "s3cret" } })).json();
    expect(ok.authorized).toBe(true);
  });

  it("rejects calls without the passcode", async () => {
    expect((await post("/api/crawl", { url: own.origin })).status).toBe(401);
    expect((await post("/api/crawl", { url: own.origin }, "wrong")).status).toBe(401);
  });

  it("crawls a site through the API", async () => {
    const r = await post("/api/crawl", { url: own.origin, maxPages: 8 }, "s3cret");
    expect(r.status).toBe(200);
    const { profile } = (await r.json()) as { profile: SiteProfile };
    expect(profile.pages.length).toBeGreaterThanOrEqual(4);
    expect(profile.robots.bots["GPTBot"]).toBe("blocked");
  });

  it("reports clear errors", async () => {
    const bad = await post("/api/crawl", { url: "not a url" }, "s3cret");
    expect(bad.status).toBe(422);
    expect((await bad.json()).error).toMatch(/Could not read/);
    const noKey = await post("/api/serp", { queries: ["x"] }, "s3cret");
    expect(noKey.status).toBe(501);
    const noAi = await post("/api/ai", { task: "brief" }, "s3cret");
    expect(noAi.status).toBe(501);
  });

  it("serves the app shell", async () => {
    const html = await (await fetch(base)).text();
    expect(html).toContain("SEO and AEO Gap Dashboard");
  });
});
