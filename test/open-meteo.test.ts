import { expect, test } from "vitest";
import { getCurrentWeather } from "../functions/_lib/open-meteo.js";

test("returns real-shaped weather data on a successful lookup", async () => {
  const fetchImpl = (async (url: string) => {
    if (url.includes("geocoding-api")) {
      return new Response(
        JSON.stringify({ results: [{ name: "Tokyo", country: "Japan", latitude: 35.68, longitude: 139.69 }] }),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({
        current: { temperature_2m: 22.5, apparent_temperature: 21.9, relative_humidity_2m: 60, wind_speed_10m: 12, weather_code: 1 },
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  const result = await getCurrentWeather("Tokyo", fetchImpl);

  expect(result.location?.name).toBe("Tokyo");
  expect(result.temperature_c).toBe(22.5);
  expect(result.conditions).toBe("mainly clear");
  expect(result.attribution).toContain("Open-Meteo");
});

test("returns an error object (never throws) when the city can't be found", async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({ results: [] }), { status: 200 })) as typeof fetch;

  const result = await getCurrentWeather("Nowhereville12345", fetchImpl);

  expect(result.error).toContain("Couldn't find");
});

test("returns an error object (never throws) on a network failure", async () => {
  const fetchImpl = (async () => { throw new Error("down"); }) as typeof fetch;

  const result = await getCurrentWeather("Tokyo", fetchImpl);

  expect(result.error).toContain("didn't respond");
});
