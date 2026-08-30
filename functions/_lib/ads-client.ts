/**
 * One shared LuluAds instance for the whole process, used by both
 * server.ts's own /api/lulu-ads/sponsored-slot route and chat.ts's
 * runChat(). The SDK tracks "is this connection still warm"
 * (isCold()/lastSuccessAt) on the instance itself -- splitting this into
 * two separate `new LuluAds()` calls (one per consumer) would throw that
 * tracking away for whichever one a given request didn't happen to hit,
 * and neither would ever benefit from the other's warmUp() call.
 *
 * Reads LULU_ADS_PUBLISHER_ID / LULU_ADS_API_KEY from env, same as every
 * other consumer of this client in this repo. Deliberately does NOT call
 * warmUp() here -- this module is imported by chat.ts, which unit tests
 * import directly (see test/chat.test.ts), and warmUp() makes real
 * unconditional network calls (a GET to /health and a POST to
 * /telemetry/init) with no credential gate. Only server.ts -- the actual
 * running server, never imported by tests -- calls warmUp(), once, at
 * startup.
 */
import { LuluAds } from "lulu-ads";

export const ads = new LuluAds();
