import { isAuthorized } from "@/lib/server/guard";
import { aiConfigured } from "@/lib/server/anthropic";
import { serpConfigured } from "@/lib/server/serper";
import { keylessEnabled } from "@/lib/server/websearch";
import type { Capabilities } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tells the UI what is switched on. Never returns secrets. */
export async function GET(req: Request) {
  const body: Capabilities = {
    serp: serpConfigured(),
    discover: keylessEnabled(),
    ai: aiConfigured(),
    passcodeRequired: Boolean(process.env.DASHBOARD_PASSCODE),
    authorized: isAuthorized(req),
  };
  return Response.json(body);
}
