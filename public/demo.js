// Chat frontend for /demo -- posts to /api/chat (a real Gemini
// function-calling loop over the same get_weather/search_flights logic the
// WebMCP tools on the manual demo use) and renders the reply plus any tool
// calls it made along the way. All content here can come from a live LLM
// response and a live third-party advertiser payload, so nothing untrusted
// ever goes through innerHTML -- same safe-DOM pattern as trip.js/index.html.

const thread = document.getElementById("thread");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const suggestions = document.getElementById("suggestions");

const messages = [];

// Running trip state -- once both a destination's weather and a flight
// search exist in the conversation, renderTripSummary() closes the loop
// with a single recommendation card instead of leaving two disconnected
// tool cards for the user to reconcile themselves.
let weatherState = null;
let flightsState = null;
let tripSummaryRendered = false;

function scrollToBottom() {
  thread.scrollTop = thread.scrollHeight;
}

function addBubble(role, text) {
  if (role === "assistant") {
    const label = document.createElement("div");
    label.className = "msg-label";
    label.textContent = "🌷 Tulip Trips";
    thread.appendChild(label);
  }
  const row = document.createElement("div");
  row.className = `msg ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  row.appendChild(bubble);
  thread.appendChild(row);
  scrollToBottom();
  return row;
}

function addTyping() {
  const row = document.createElement("div");
  row.className = "msg assistant";
  row.id = "typing-indicator";
  const bubble = document.createElement("div");
  bubble.className = "bubble typing";
  bubble.append(
    Object.assign(document.createElement("span"), {}),
    Object.assign(document.createElement("span"), {}),
    Object.assign(document.createElement("span"), {}),
  );
  row.appendChild(bubble);
  thread.appendChild(row);
  scrollToBottom();
}

function removeTyping() {
  const el = document.getElementById("typing-indicator");
  if (el) el.remove();
}

function safeUrl(raw) {
  try {
    const parsed = new URL(raw, window.location.href);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch { /* malformed -- treat as absent */ }
  return null;
}

function safeImgUrl(raw) {
  try {
    const parsed = new URL(raw, window.location.href);
    if (parsed.protocol === "https:" || parsed.protocol === "data:") return parsed.href;
  } catch { /* malformed -- treat as absent */ }
  return null;
}

function renderWeatherCard(result) {
  const card = document.createElement("div");
  card.className = "tool-card";
  const body = document.createElement("div");
  body.className = "tool-body";

  body.appendChild(mcpEyebrow("get_weather"));

  if (result.error) {
    const p = document.createElement("p");
    p.style.color = "var(--muted-fg)";
    p.style.fontSize = "13px";
    p.style.margin = "0";
    p.textContent = result.error;
    body.appendChild(p);
  } else {
    const stat = document.createElement("div");
    stat.className = "stat";
    stat.textContent = `${result.temperature_c}°C`;
    body.appendChild(stat);

    const rows = [
      ["Feels like", `${result.feels_like_c}°C`],
      ["Conditions", result.conditions],
    ];
    for (const [label, value] of rows) {
      const row = document.createElement("div");
      row.className = "lw-row";
      const left = document.createElement("span");
      left.textContent = label;
      const right = document.createElement("span");
      right.textContent = String(value);
      row.append(left, right);
      body.appendChild(row);
    }

    if (result.attribution) {
      const attr = document.createElement("p");
      attr.className = "lw-attr";
      attr.textContent = result.attribution;
      body.appendChild(attr);
    }
  }

  card.appendChild(body);

  if (result.sponsored) {
    card.appendChild(renderSponsoredWidget(result.sponsored));
  }

  return card;
}

// Ported 1:1 from ads-web/components/cruip/sponsored-brand.tsx's
// SponsoredWidgetCard -- the actual live MCP Apps widget rendered inside
// every real Lulu Ads sponsored slot (verified live in Claude), not a
// bespoke "ad strip" invented for this demo. Full gradient card, plain
// small-caps "Sponsored" eyebrow, brand tile (logo or monogram fallback),
// "Powered by Lulu Ads" footer.
function renderSponsoredWidget(sponsored) {
  const card = document.createElement("div");
  card.className = "sponsored-widget";

  const eyebrow = document.createElement("div");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Sponsored";
  card.appendChild(eyebrow);

  const row = document.createElement("div");
  row.className = "row";

  const tile = document.createElement("span");
  tile.className = "tile";
  const logoUrl = sponsored.logoUrl ? safeImgUrl(sponsored.logoUrl) : null;
  if (logoUrl) {
    const img = document.createElement("img");
    img.src = logoUrl;
    img.alt = "";
    tile.appendChild(img);
  } else {
    tile.textContent = (sponsored.text?.trim()?.charAt(0) || "L").toUpperCase();
  }
  row.appendChild(tile);

  const text = document.createElement("span");
  text.className = "text";
  text.textContent = `${sponsored.text} `;
  const link = safeUrl(sponsored.url);
  if (link) {
    const a = document.createElement("a");
    a.href = link;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Learn more →";
    text.appendChild(a);
  }
  row.appendChild(text);
  card.appendChild(row);

  const footer = document.createElement("div");
  footer.className = "footer";
  footer.append("Powered by ", Object.assign(document.createElement("b"), { textContent: "Lulu Ads" }));
  card.appendChild(footer);

  return card;
}

// Small pill identifying the card's contents as a real MCP tool call
// result, matching the rounded-full/uppercase/extrabold badge language
// used across ads-web (components/mcps/server-card.tsx's BadgeChips,
// RegistryPills) -- not a bespoke label.
function mcpEyebrow(toolName) {
  const row = document.createElement("div");
  row.className = "tool-eyebrow-row";

  const eyebrow = document.createElement("span");
  eyebrow.className = "tool-eyebrow";
  eyebrow.textContent = toolName;
  row.appendChild(eyebrow);

  const badge = document.createElement("span");
  badge.className = "mcp-badge";
  const dot = document.createElement("span");
  dot.className = "dot";
  badge.append(dot, "MCP tool");
  row.appendChild(badge);

  return row;
}

function renderFlightsCard(result) {
  const card = document.createElement("div");
  card.className = "tool-card";
  const body = document.createElement("div");
  body.className = "tool-body";

  body.appendChild(mcpEyebrow("search_flights"));

  for (const f of result.flights ?? []) {
    const row = document.createElement("div");
    row.className = "lw-row";
    const left = document.createElement("span");
    left.textContent = `${f.airline} ${f.flight_number}`;
    const right = document.createElement("span");
    right.textContent = `$${f.price_usd}`;
    row.append(left, right);
    body.appendChild(row);
  }

  card.appendChild(body);

  if (result.sponsored) {
    card.appendChild(renderSponsoredWidget(result.sponsored));
  }

  return card;
}

// Closing card: once the conversation has both a destination's weather and
// a flight search, tie them into one recommendation -- cheapest flight by
// default, called out as the "pick" -- instead of leaving two disconnected
// cards. City name and flight destination airport aren't reconciled (a
// typed city and an IATA code aren't reliably the same string), so both
// are shown as their own facts rather than claiming a false match.
function renderTripSummary() {
  if (!weatherState || !flightsState) return;
  const flights = flightsState.result.flights ?? [];
  if (!flights.length) return;
  const pick = [...flights].sort((a, b) => a.price_usd - b.price_usd)[0];

  const card = document.createElement("div");
  card.className = "trip-summary";

  const head = document.createElement("div");
  head.className = "head";
  const flag = document.createElement("span");
  flag.className = "flag";
  flag.textContent = "🧳";
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = "Trip summary";
  head.append(flag, title);
  card.appendChild(head);

  const body = document.createElement("div");
  body.className = "body";

  const weatherFact = document.createElement("div");
  weatherFact.className = "fact";
  const wIc = document.createElement("span");
  wIc.className = "ic";
  wIc.textContent = "☀️";
  const wText = document.createElement("span");
  if (weatherState.result.error) {
    wText.textContent = `Weather for ${weatherState.city}: unavailable`;
  } else {
    wText.append(
      `${weatherState.city}: `,
      Object.assign(document.createElement("b"), { textContent: `${weatherState.result.temperature_c}°C` }),
      `, ${weatherState.result.conditions}`,
    );
  }
  weatherFact.append(wIc, wText);
  body.appendChild(weatherFact);

  const flightFact = document.createElement("div");
  flightFact.className = "fact";
  const fIc = document.createElement("span");
  fIc.className = "ic";
  fIc.textContent = "✈️";
  const fText = document.createElement("span");
  fText.append(
    `${flightsState.origin} → ${flightsState.destination}: ${pick.airline} ${pick.flight_number} — `,
    Object.assign(document.createElement("b"), { textContent: `$${pick.price_usd}` }),
    " (best value)",
  );
  flightFact.append(fIc, fText);
  body.appendChild(flightFact);

  const reco = document.createElement("div");
  reco.className = "reco";
  reco.textContent = `Tulip Trips pick: ${pick.airline} ${pick.flight_number} pairs well with ${weatherState.result.conditions ?? "the forecast"} in ${weatherState.city} -- pack accordingly.`;
  body.appendChild(reco);

  const saveRow = document.createElement("div");
  saveRow.className = "save-row";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "save-btn";
  saveBtn.textContent = "Save trip";
  saveBtn.addEventListener("click", () => {
    saveBtn.textContent = "Saved ✓";
    saveBtn.classList.add("saved");
    saveBtn.disabled = true;
  });
  saveRow.appendChild(saveBtn);
  body.appendChild(saveRow);

  card.appendChild(body);
  thread.appendChild(card);
}

function renderToolCall(call) {
  if (call.name === "get_weather") {
    thread.appendChild(renderWeatherCard(call.result));
    weatherState = { city: call.args.city, result: call.result };
  } else if (call.name === "search_flights") {
    thread.appendChild(renderFlightsCard(call.result));
    flightsState = { origin: call.args.origin, destination: call.args.destination, result: call.result };
  }
}

async function sendMessage(text) {
  suggestions.style.display = "none";
  addBubble("user", text);
  messages.push({ role: "user", content: text });

  input.value = "";
  input.disabled = true;
  sendBtn.disabled = true;
  addTyping();

  try {
    const res = await fetch("api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    const data = await res.json();
    removeTyping();

    if (!res.ok || data.error) {
      addBubble("assistant", "Sorry, something went wrong on my end. Try again in a moment.");
      return;
    }

    const toolCalls = data.toolCalls ?? [];
    for (const call of toolCalls) {
      renderToolCall(call);
    }
    addBubble("assistant", data.reply || "…");
    messages.push({ role: "assistant", content: data.reply || "" });

    // Close the loop once, the first time both pieces are in place --
    // repeating it on every later message (e.g. a follow-up question)
    // would just be noise.
    if (toolCalls.length && weatherState && flightsState && !tripSummaryRendered) {
      renderTripSummary();
      tripSummaryRendered = true;
    }
  } catch {
    removeTyping();
    addBubble("assistant", "Sorry, I couldn't reach the server. Try again in a moment.");
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
    scrollToBottom();
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  sendMessage(text);
});

suggestions.addEventListener("click", (e) => {
  const target = e.target.closest(".suggestion");
  if (!target) return;
  sendMessage(target.dataset.q);
});
