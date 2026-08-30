import { afterEach, expect, test, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

test("runChat calls the real get_weather logic when the model requests the get_weather tool", async () => {
  let call = 0;
  vi.doMock("@ai-sdk/google", () => ({
    google: () =>
      new MockLanguageModelV3({
        doGenerate: async () => {
          call++;
          if (call === 1) {
            return {
              content: [
                { type: "tool-call", toolCallId: "call_1", toolName: "get_weather", input: JSON.stringify({ city: "Tokyo" }) },
              ],
              finishReason: "tool-calls",
              usage: USAGE,
            };
          }
          return { content: [{ type: "text", text: "It's warm in Tokyo right now." }], finishReason: "stop", usage: USAGE };
        },
      }),
  }));
  vi.doMock("../functions/_lib/open-meteo.js", () => ({
    getCurrentWeather: vi.fn(async (city: string) => ({
      location: { name: city },
      temperature_c: 25,
      attribution: "Weather data by Open-Meteo (open-meteo.com)",
    })),
  }));

  const { runChat } = await import("../functions/_lib/chat.js");
  const result = await runChat([{ role: "user", content: "what's the weather in Tokyo?" }]);

  expect(result.reply).toBe("It's warm in Tokyo right now.");
  expect(result.toolCalls).toHaveLength(1);
  expect(result.toolCalls[0].name).toBe("get_weather");
  expect(result.toolCalls[0].args).toEqual({ city: "Tokyo" });
  expect(result.toolCalls[0].result).toMatchObject({ temperature_c: 25 });
});

test("runChat calls the real search_flights logic + sponsored slot when the model requests search_flights", async () => {
  let call = 0;
  vi.doMock("@ai-sdk/google", () => ({
    google: () =>
      new MockLanguageModelV3({
        doGenerate: async () => {
          call++;
          if (call === 1) {
            return {
              content: [
                {
                  type: "tool-call",
                  toolCallId: "call_1",
                  toolName: "search_flights",
                  input: JSON.stringify({ origin: "TLV", destination: "BKK", date: "2026-09-15" }),
                },
              ],
              finishReason: "tool-calls",
              usage: USAGE,
            };
          }
          return {
            content: [{ type: "text", text: "Found a few flights, and there's a sponsored insurance offer too." }],
            finishReason: "stop",
            usage: USAGE,
          };
        },
      }),
  }));
  vi.doMock("../functions/_lib/mock-flights.js", () => ({
    generateMockFlights: vi.fn(async (origin: string, destination: string, date: string) => ({
      origin,
      destination,
      date,
      flights: [{ airline: "Delta", flight_number: "DL1", departure_time: "08:00", duration_hours: 10, stops: 0, price_usd: 500 }],
    })),
  }));
  vi.doMock("../functions/_lib/sponsored-slot.js", () => ({
    createSponsoredSlotHandler: () => async () => ({
      sponsored: { label: "Sponsored", text: "Protect your trip", url: "https://example.com" },
    }),
  }));
  vi.doMock("lulu-ads", () => ({ LuluAds: vi.fn() }));

  const { runChat } = await import("../functions/_lib/chat.js");
  const result = await runChat([{ role: "user", content: "find me a flight TLV to BKK on 2026-09-15" }]);

  expect(result.reply).toContain("sponsored");
  expect(result.toolCalls).toHaveLength(1);
  expect(result.toolCalls[0].name).toBe("search_flights");
  expect(result.toolCalls[0].result).toMatchObject({
    flights: [expect.objectContaining({ airline: "Delta" })],
    sponsored: { label: "Sponsored", text: "Protect your trip", url: "https://example.com" },
  });
});

test("runChat returns a plain text reply with no tool calls when the model doesn't need a tool", async () => {
  vi.doMock("@ai-sdk/google", () => ({
    google: () =>
      new MockLanguageModelV3({
        doGenerate: async () => ({
          content: [{ type: "text", text: "Hi! Ask me about weather or flights." }],
          finishReason: "stop",
          usage: USAGE,
        }),
      }),
  }));

  const { runChat } = await import("../functions/_lib/chat.js");
  const result = await runChat([{ role: "user", content: "hello" }]);

  expect(result.reply).toBe("Hi! Ask me about weather or flights.");
  expect(result.toolCalls).toEqual([]);
});
