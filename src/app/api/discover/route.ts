import { badRequest, requireAuth } from "@/lib/server/guard";
import { keylessEnabled, webSearch, type WebHit } from "@/lib/server/websearch";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Keyless competitor discovery: which sites show up for your topics. Not used for rankings. */
export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!keylessEnabled()) return badRequest("Free competitor search is switched off (KEYLESS_SEARCH=false).", 501);

  let body: { queries?: unknown; gl?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }
  const queries = Array.isArray(body.queries)
    ? [...new Set(body.queries.filter((q): q is string => typeof q === "string").map((q) => q.trim()).filter((q) => q && q.length <= 120))].slice(0, 6)
    : [];
  if (!queries.length) return badRequest("No queries supplied");
  const gl = typeof body.gl === "string" ? body.gl : "us";

  const results: { query: string; hits: WebHit[] }[] = [];
  const errors: string[] = [];
  for (const q of queries) {
    try {
      results.push({ query: q, hits: await webSearch(q, gl) });
    } catch (e) {
      errors.push((e as Error).message);
      if (/blocked/i.test((e as Error).message)) break; // no point hammering a block
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!results.length && errors.length) return badRequest(errors[0], 502);
  return Response.json({ results, errors: [...new Set(errors)] });
}
