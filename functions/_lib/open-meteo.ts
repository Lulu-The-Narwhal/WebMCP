/**
 * Thin Open-Meteo client (https://open-meteo.com) -- free, no API key.
 * Ported from this org's weather-mcp/open_meteo.py -- same field names,
 * same WMO code table, same fail-open contract (a lookup failure comes
 * back as {error, attribution}, this never throws).
 */
export interface WeatherResult {
  location?: { name?: string; country?: string; admin1?: string };
  temperature_c?: number | null;
  feels_like_c?: number | null;
  humidity_pct?: number | null;
  wind_kmh?: number | null;
  conditions?: string;
  weather_code?: number | null;
  attribution: string;
  error?: string;
}

const ATTRIBUTION = "Weather data by Open-Meteo (open-meteo.com)";
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const WMO: Record<number, string> = {
  0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
  45: "fog", 48: "depositing rime fog",
  51: "light drizzle", 53: "drizzle", 55: "dense drizzle",
  56: "freezing drizzle", 57: "dense freezing drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain",
  66: "freezing rain", 67: "heavy freezing rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
  80: "light rain showers", 81: "rain showers", 82: "violent rain showers",
  85: "light snow showers", 86: "heavy snow showers",
  95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with heavy hail",
};

function describe(code: number | null | undefined): string {
  if (code == null) return "unknown";
  return WMO[code] ?? `weather code ${code}`;
}

async function geocode(city: string, fetchImpl: typeof fetch) {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("name", city.trim());
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const res = await fetchImpl(url.toString());
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const body = (await res.json()) as { results?: Array<Record<string, unknown>> };
  const top = body.results?.[0];
  if (!top) return null;
  return {
    name: top.name as string | undefined,
    country: top.country as string | undefined,
    admin1: top.admin1 as string | undefined,
    latitude: top.latitude as number,
    longitude: top.longitude as number,
  };
}

export async function getCurrentWeather(
  city: string,
  fetchImpl: typeof fetch = fetch
): Promise<WeatherResult> {
  try {
    const place = await geocode(city, fetchImpl);
    if (!place) {
      return {
        error: `Couldn't find a place called "${city.trim()}" -- try the nearest larger city, or add a country.`,
        attribution: ATTRIBUTION,
      };
    }
    const url = new URL(FORECAST_URL);
    url.searchParams.set("latitude", String(place.latitude));
    url.searchParams.set("longitude", String(place.longitude));
    url.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m");
    url.searchParams.set("timezone", "auto");
    const res = await fetchImpl(url.toString());
    if (!res.ok) throw new Error(`forecast ${res.status}`);
    const body = (await res.json()) as { current?: Record<string, unknown> };
    const current = body.current ?? {};
    return {
      location: { name: place.name, country: place.country, admin1: place.admin1 },
      temperature_c: (current.temperature_2m as number) ?? null,
      feels_like_c: (current.apparent_temperature as number) ?? null,
      humidity_pct: (current.relative_humidity_2m as number) ?? null,
      wind_kmh: (current.wind_speed_10m as number) ?? null,
      conditions: describe(current.weather_code as number | undefined),
      weather_code: (current.weather_code as number) ?? null,
      attribution: ATTRIBUTION,
    };
  } catch {
    return { error: "The weather service didn't respond in time -- try again in a moment.", attribution: ATTRIBUTION };
  }
}
