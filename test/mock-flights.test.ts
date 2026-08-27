import { expect, test } from "vitest";
import { generateMockFlights } from "../functions/_lib/mock-flights.js";

test("returns 3-5 flights, sorted by price ascending", async () => {
  const result = await generateMockFlights("TLV", "BKK", "2026-09-15");

  expect(result.flights.length).toBeGreaterThanOrEqual(3);
  expect(result.flights.length).toBeLessThanOrEqual(5);
  for (let i = 1; i < result.flights.length; i++) {
    expect(result.flights[i].price_usd).toBeGreaterThanOrEqual(result.flights[i - 1].price_usd);
  }
});

test("every flight has the full expected shape", async () => {
  const result = await generateMockFlights("TLV", "BKK", "2026-09-15");

  for (const f of result.flights) {
    expect(typeof f.airline).toBe("string");
    expect(typeof f.flight_number).toBe("string");
    expect(typeof f.price_usd).toBe("number");
    expect(f.price_usd).toBeGreaterThan(0);
    expect(f.stops).toBeGreaterThanOrEqual(0);
    expect(f.stops).toBeLessThanOrEqual(2);
  }
});

test("is deterministic -- same inputs always produce the same flights", async () => {
  const a = await generateMockFlights("TLV", "BKK", "2026-09-15");
  const b = await generateMockFlights("TLV", "BKK", "2026-09-15");

  expect(a).toEqual(b);
});

test("different inputs produce different results", async () => {
  const a = await generateMockFlights("TLV", "BKK", "2026-09-15");
  const b = await generateMockFlights("TLV", "JFK", "2026-09-15");

  expect(a).not.toEqual(b);
});
