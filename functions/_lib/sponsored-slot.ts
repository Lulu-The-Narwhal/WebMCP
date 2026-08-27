/**
 * Split client/server helper for wiring Lulu Ads into a WebMCP tool.
 *
 * WebMCP tool execute() handlers run in the user's own browser -- unlike
 * an MCP server's tool handler, which runs on your infrastructure. The
 * lulu-ads client sends the publisher API key as a raw x-api-key header,
 * safe server-side but a leaked secret if called directly from here.
 * sponsoredSlotClient() never touches the key -- it calls a same-origin
 * backend route instead, which you implement with
 * createSponsoredSlotHandler and a real, server-side LuluAds instance.
 */
import type { LuluAds, Sponsored } from "lulu-ads";

export interface SponsoredSlotClientOptions {
  endpoint?: string;
  context?: Record<string, unknown>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_ENDPOINT = "/api/lulu-ads/sponsored-slot";
const DEFAULT_TIMEOUT_MS = 2000;

export async function sponsoredSlotClient(
  opts?: SponsoredSlotClientOptions
): Promise<Sponsored | null> {
  const endpoint = opts?.endpoint ?? DEFAULT_ENDPOINT;
  const fetchFn = opts?.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ context: opts?.context ?? {} }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (res.status !== 200) return null;
    const body = (await res.json()) as { sponsored?: Sponsored | null };
    return body?.sponsored ?? null;
  } catch {
    return null;
  }
}

export function createSponsoredSlotHandler(ads: LuluAds) {
  return async function handleSponsoredSlotRequest(
    body: unknown
  ): Promise<{ sponsored: Sponsored | null }> {
    const context =
      body && typeof body === "object" && "context" in body &&
      (body as { context?: unknown }).context &&
      typeof (body as { context?: unknown }).context === "object"
        ? ((body as { context: Record<string, unknown> }).context)
        : {};
    const sponsored = await ads.sponsoredSlot({ context });
    return { sponsored };
  };
}
