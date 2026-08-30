/**
 * The /demo chat backend -- a real Gemini function-calling loop over the
 * exact same get_weather/search_flights logic the WebMCP tools use
 * (functions/_lib/open-meteo.ts, mock-flights.ts, sponsored-slot.ts).
 * Zero duplicated tool logic: this just gives an LLM the same two
 * capabilities a WebMCP-capable browser agent already has, so a user can
 * ask for a trip in plain language and watch the model decide when to
 * call each one -- including the disclosed sponsored slot showing up
 * naturally when it calls search_flights, same as the manual demo.
 */
import { generateText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { LuluAds } from "lulu-ads";
import { getCurrentWeather } from "./open-meteo.js";
import { generateMockFlights } from "./mock-flights.js";
import { createSponsoredSlotHandler } from "./sponsored-slot.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface ChatResult {
  reply: string;
  toolCalls: ChatToolCall[];
}

const SYSTEM_PROMPT = `You are a trip-planning assistant with two real tools: get_weather and search_flights.
Use them whenever the user's request calls for real data -- don't guess weather or flight numbers yourself.
Call get_weather for destination weather questions, search_flights for flight questions (requires origin, destination, and a date -- ask the user if any are missing, or make a reasonable assumption for the date if they didn't give one and say so).
Be conversational and concise. After a tool returns, summarize the result in plain language -- don't just repeat the raw numbers verbatim.
If search_flights returns a "sponsored" field, mention it naturally and briefly (e.g. "by the way, there's a sponsored insurance offer too") -- never hide that it's sponsored, never pretend it's an organic recommendation.`;

export async function runChat(messages: ChatMessage[]): Promise<ChatResult> {
  const toolCalls: ChatToolCall[] = [];
  // Reads LULU_ADS_PUBLISHER_ID / LULU_ADS_API_KEY from env, same as every
  // other consumer of this client in this repo.
  const ads = new LuluAds();
  const handleSponsoredSlot = createSponsoredSlotHandler(ads);

  const result = await generateText({
    model: google("gemini-3.5-flash"),
    system: SYSTEM_PROMPT,
    messages,
    tools: {
      get_weather: tool({
        description:
          "Current weather conditions for a city, right now: temperature, feels-like, humidity, wind, and a plain-language description.",
        inputSchema: z.object({
          city: z.string().describe("City name, e.g. \"Bangkok\" or \"Springfield, US\" for ambiguous names"),
        }),
        execute: async ({ city }) => {
          const weather = await getCurrentWeather(city);
          toolCalls.push({ name: "get_weather", args: { city }, result: weather });
          return weather;
        },
      }),
      search_flights: tool({
        description: "Search flights between two airports on a given date (YYYY-MM-DD).",
        inputSchema: z.object({
          origin: z.string().describe("Origin airport code, e.g. TLV"),
          destination: z.string().describe("Destination airport code, e.g. BKK"),
          date: z.string().describe("Date in YYYY-MM-DD format"),
        }),
        execute: async ({ origin, destination, date }) => {
          const flights = await generateMockFlights(origin, destination, date);
          // Explicit category, not automatic tool-name matching -- same
          // confirmed-live category the manual /webmcp demo uses.
          const { sponsored } = await handleSponsoredSlot({
            context: { tool: "search_flights", category: "travel.insurance" },
          });
          const full = { ...flights, sponsored };
          toolCalls.push({ name: "search_flights", args: { origin, destination, date }, result: full });
          return full;
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });

  return { reply: result.text, toolCalls };
}
