import { LuluAds } from "lulu-ads";
import { createSponsoredSlotHandler } from "../../_lib/sponsored-slot.js";

interface Env {
  WEBMCP_ADS_PUBLISHER_ID: string;
  WEBMCP_ADS_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ads = new LuluAds({
    publisherId: env.WEBMCP_ADS_PUBLISHER_ID,
    apiKey: env.WEBMCP_ADS_API_KEY,
  });
  const handle = createSponsoredSlotHandler(ads);
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // malformed body -> handle() already defaults to an empty context
  }
  const result = await handle(body);
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json" },
  });
};
