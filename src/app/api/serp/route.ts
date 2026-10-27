import { badRequest, requireAuth } from "@/lib/server/guard";
import { serpConfigured, serperSearch } from "@/lib/server/serper";
import type { SerpResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!serpConfigured()) return badRequest("SERPER_API_KEY is not set on the server.", 501);

  let body: { queries?: unknown; gl?: unknown; hl?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }
  const queries = Array.isArray(body.queries)
    ? [...new Set(body.queries.filter((q): q is string => typeof q === "string").map((q) => q.trim()).filter((q) => q && q.length <= 120))].slice(0, 10)
    : [];
  if (!queries.length) return badRequest("No queries supplied");
  const gl = typeof body.gl === "string" && /^[a-z]{2}$/i.test(body.gl) ? body.gl.toLowerCase() : "us";
  const hl = typeof body.hl === "string" && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(body.hl) ? body.hl : "en";

  const results: SerpResult[] = [];
  const errors: string[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(4, queries.length) }, async () => {
    while (i < queries.length) {
      const q = queries[i++];
      try {
        results.push(await serperSearch(q, { gl, hl }));
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
  });
  await Promise.all(workers);

  if (!results.length && errors.length) return badRequest(errors[0], 502);
  return Response.json({ results, errors: [...new Set(errors)] });
}
