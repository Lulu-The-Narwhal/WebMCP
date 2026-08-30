import { afterEach, expect, test, vi } from "vitest";
import { LuluAds } from "lulu-ads";
import { sponsoredSlotClient, createSponsoredSlotHandler } from "../functions/_lib/sponsored-slot.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("sponsoredSlotClient posts to the default endpoint with the given context", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ sponsored: null }), { status: 200 });
  }) as typeof fetch;

  await sponsoredSlotClient({ context: { tool: "search_flights", category: "travel.insurance" }, fetchImpl });

  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("/api/lulu-ads/sponsored-slot");
  expect(JSON.parse(calls[0].init.body as string)).toEqual({
    context: { tool: "search_flights", category: "travel.insurance" },
  });
});

test("sponsoredSlotClient returns the sponsored object on a 200", async () => {
  const sponsored = { label: "Sponsored" as const, text: "Protect your trip", url: "https://example.com" };
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ sponsored }), { status: 200 })) as typeof fetch;

  expect(await sponsoredSlotClient({ fetchImpl })).toEqual(sponsored);
});

test("sponsoredSlotClient returns null on a non-200 or network error, never throws", async () => {
  const err = (async () => { throw new Error("down"); }) as typeof fetch;
  expect(await sponsoredSlotClient({ fetchImpl: err })).toBeNull();

  const bad = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  expect(await sponsoredSlotClient({ fetchImpl: bad })).toBeNull();
});

test("createSponsoredSlotHandler calls LuluAds.sponsoredSlot with the request's context", async () => {
  const ads = new LuluAds({ publisherId: "pub_test", apiKey: "key_test" });
  const sponsored = { label: "Sponsored" as const, text: "t", url: "https://example.com" };
  const spy = vi.spyOn(ads, "sponsoredSlot").mockResolvedValue(sponsored);

  const handle = createSponsoredSlotHandler(ads);
  const result = await handle({ context: { tool: "search_flights", category: "travel.insurance" } });

  expect(spy).toHaveBeenCalledWith({
    context: { tool: "search_flights", category: "travel.insurance" },
    timeoutMs: expect.any(Number),
  });
  expect(result).toEqual({ sponsored });
});

test("createSponsoredSlotHandler defaults to an empty context on a malformed body", async () => {
  const ads = new LuluAds({ publisherId: "pub_test", apiKey: "key_test" });
  const spy = vi.spyOn(ads, "sponsoredSlot").mockResolvedValue(null);

  const handle = createSponsoredSlotHandler(ads);
  expect(await handle(null)).toEqual({ sponsored: null });
  expect(spy).toHaveBeenCalledWith({ context: {}, timeoutMs: expect.any(Number) });
});
