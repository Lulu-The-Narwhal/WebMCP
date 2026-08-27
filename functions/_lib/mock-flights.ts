/**
 * Deterministic mock flight data -- same (origin, destination, date)
 * always returns the same results. Ported from this org's
 * demo-flights-mcp/mock_flights.py: same airline pool, same field shape,
 * sorted by price. Uses real SHA-256 (Web Crypto, native everywhere this
 * runs -- Node 20+, browsers, Cloudflare Workers) for the seed instead of
 * Python's hashlib; output bytes differ from the Python version but that
 * was never a requirement -- only internal determinism is.
 */
export interface Flight {
  airline: string;
  flight_number: string;
  departure_time: string;
  duration_hours: number;
  stops: number;
  price_usd: number;
}

export interface FlightsResult {
  origin: string;
  destination: string;
  date: string;
  flights: Flight[];
}

const AIRLINES: Array<[string, string]> = [
  ["DL", "Delta"], ["UA", "United"], ["AA", "American"], ["BA", "British Airways"],
  ["LH", "Lufthansa"], ["AF", "Air France"], ["EK", "Emirates"], ["QR", "Qatar Airways"],
];

async function seededBytes(str: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

export async function generateMockFlights(
  origin: string,
  destination: string,
  date: string
): Promise<FlightsResult> {
  const o = origin.trim().toUpperCase();
  const d = destination.trim().toUpperCase();
  const seed = await seededBytes(`${o}-${d}-${date}`);

  const numFlights = 3 + (seed[0] % 3);
  const flights: Flight[] = [];
  for (let i = 0; i < numFlights; i++) {
    const b = seed.slice(i * 4, i * 4 + 4);
    const bytes = b.length === 4 ? b : seed.slice(0, 4);
    const [code, name] = AIRLINES[bytes[0] % AIRLINES.length];
    const depHour = 5 + (bytes[1] % 18);
    const durationHours = 2 + (bytes[2] % 12);
    const stops = bytes[3] % 3;
    const basePrice = 180 + bytes[0] * 7 + bytes[1] * 3;
    const price = Math.max(89, basePrice + stops * 60 - (bytes[2] % 40));
    const flightNumber = `${code}${100 + ((bytes[1] * 3 + bytes[2]) % 900)}`;
    flights.push({
      airline: name,
      flight_number: flightNumber,
      departure_time: `${String(depHour).padStart(2, "0")}:${String((bytes[2] * 7) % 60).padStart(2, "0")}`,
      duration_hours: durationHours,
      stops,
      price_usd: price,
    });
  }
  flights.sort((a, z) => a.price_usd - z.price_usd);
  return { origin: o, destination: d, date, flights };
}
