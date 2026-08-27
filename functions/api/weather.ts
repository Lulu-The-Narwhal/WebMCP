import { getCurrentWeather } from "../_lib/open-meteo.js";

export const onRequestGet: PagesFunction = async ({ request }) => {
  const city = new URL(request.url).searchParams.get("city") ?? "";
  const result = await getCurrentWeather(city);
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json" },
  });
};
