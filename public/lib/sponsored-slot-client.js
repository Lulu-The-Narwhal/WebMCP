// Browser copy of functions/_lib/sponsored-slot.ts's sponsoredSlotClient --
// duplicated on purpose, not imported, because public/ is served as static
// files with no bundler. Keep in sync by eye; covered by
// test/sponsored-slot.test.ts on the TS side.
const DEFAULT_ENDPOINT = "/api/lulu-ads/sponsored-slot";
const DEFAULT_TIMEOUT_MS = 2000;

export async function sponsoredSlotClient(opts = {}) {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const fetchFn = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ context: opts.context ?? {} }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (res.status !== 200) return null;
    const body = await res.json();
    return body?.sponsored ?? null;
  } catch {
    return null;
  }
}
