import { badRequest, FetchError, requireAuth } from "@/lib/server/guard";
import { crawlSite } from "@/lib/server/crawler";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  let body: { url?: unknown; maxPages?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url || url.length > 2048) return badRequest("Enter a website address");
  const maxPages = Math.min(25, Math.max(1, Number(body.maxPages) || 12));

  try {
    const profile = await crawlSite(url, { maxPages, deadlineMs: 44_000 });
    return Response.json({ profile });
  } catch (e) {
    if (e instanceof FetchError) {
      const hint =
        e.code === "private"
          ? "Only public websites can be analysed."
          : e.code === "timeout"
            ? "The site did not respond in time. Try again, or check that it is online."
            : "";
      return badRequest(`Could not read ${url}: ${e.message}. ${hint}`.trim(), 422);
    }
    return badRequest(`Could not analyse ${url}: ${(e as Error).message}`, 500);
  }
}
