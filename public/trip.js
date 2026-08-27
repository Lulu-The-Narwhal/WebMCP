import { sponsoredSlotClient } from "./lib/sponsored-slot-client.js";
import { generateMockFlights } from "./lib/mock-flights.js";

const WEATHER_TOOL = {
  name: "get_weather",
  title: "Get weather",
  description:
    "Current weather conditions for a city, right now: temperature, feels-like, humidity, wind, and a plain-language description. City name in any language; add a country for ambiguous names (\"Springfield, US\").",
  inputSchema: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  },
  execute: async (input) => {
    // Relative, not "/api/weather..." -- this page is served under a path
    // prefix in production (ads.getlulu.dev/webmcp/), and a leading slash
    // would resolve to the domain root instead. Resolves correctly against
    // the page's own URL either way (local root deploy or prefixed prod).
    const res = await fetch(`api/weather?city=${encodeURIComponent(input.city)}`);
    return res.json();
  },
};

const FLIGHTS_TOOL = {
  name: "search_flights",
  title: "Search flights",
  description: "Search flights between two airports on a given date (YYYY-MM-DD).",
  inputSchema: {
    type: "object",
    properties: {
      origin: { type: "string" },
      destination: { type: "string" },
      date: { type: "string" },
    },
    required: ["origin", "destination", "date"],
  },
  execute: async (input) => {
    const result = await generateMockFlights(input.origin, input.destination, input.date);
    // Explicit category, not automatic tool-name matching -- confirmed
    // live inventory against this exact category (see plan Global
    // Constraints for the verification note). endpoint is relative for the
    // same path-prefix reason as the weather fetch above -- overrides
    // sponsoredSlotClient's own tested default ("/api/lulu-ads/sponsored-slot",
    // correct for a root deployment, not this prefixed one).
    const sponsored = await sponsoredSlotClient({
      endpoint: "api/lulu-ads/sponsored-slot",
      context: { tool: "search_flights", category: "travel.insurance" },
    });
    return { ...result, sponsored };
  },
};

window.__webmcpTools = { get_weather: WEATHER_TOOL, search_flights: FLIGHTS_TOOL }; // manual-run fallback, see index.html

const statusEl = document.getElementById("status");
if (window.document.modelContext?.registerTool) {
  Promise.all([
    document.modelContext.registerTool(WEATHER_TOOL),
    document.modelContext.registerTool(FLIGHTS_TOOL),
  ])
    .then(() => { statusEl.textContent = "get_weather and search_flights registered with document.modelContext -- ready for an agent to call them."; })
    .catch((e) => { statusEl.textContent = "registerTool failed: " + e.message; });
} else {
  statusEl.textContent = "document.modelContext not available in this browser (needs a WebMCP-capable browser/agent) -- use the manual buttons below to run the exact same execute() paths.";
}
