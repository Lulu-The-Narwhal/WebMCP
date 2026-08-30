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

function scrollToBottom() {
  thread.scrollTop = thread.scrollHeight;
}

function addBubble(role, text) {
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

  const eyebrow = document.createElement("div");
  eyebrow.className = "tool-eyebrow";
  eyebrow.textContent = "get_weather";
  body.appendChild(eyebrow);

  if (result.error) {
    const p = document.createElement("p");
    p.style.color = "var(--lw-ink-soft)";
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
  return card;
}

function renderSponsoredStrip(sponsored) {
  const strip = document.createElement("div");
  strip.className = "lw-strip";

  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = "SPONSORED";
  strip.appendChild(badge);

  if (sponsored.logoUrl) {
    const logoUrl = safeImgUrl(sponsored.logoUrl);
    if (logoUrl) {
      const logo = document.createElement("span");
      logo.style.width = "22px";
      logo.style.height = "22px";
      logo.style.borderRadius = "6px";
      logo.style.background = "#fff";
      logo.style.display = "flex";
      logo.style.alignItems = "center";
      logo.style.justifyContent = "center";
      logo.style.flexShrink = "0";
      logo.style.overflow = "hidden";
      const img = document.createElement("img");
      img.src = logoUrl;
      img.alt = "";
      img.style.width = "15px";
      img.style.height = "15px";
      img.style.objectFit = "contain";
      logo.appendChild(img);
      strip.appendChild(logo);
    }
  }

  const txt = document.createElement("span");
  txt.className = "txt";
  txt.textContent = sponsored.text;
  strip.appendChild(txt);

  const link = safeUrl(sponsored.url);
  if (link) {
    const a = document.createElement("a");
    a.className = "cta";
    a.href = link;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Learn more →";
    strip.appendChild(a);
  }

  const via = document.createElement("span");
  via.className = "via";
  via.textContent = "via Lulu Ads";
  strip.appendChild(via);

  return strip;
}

function renderFlightsCard(result) {
  const card = document.createElement("div");
  card.className = "tool-card";
  const body = document.createElement("div");
  body.className = "tool-body";

  const eyebrow = document.createElement("div");
  eyebrow.className = "tool-eyebrow";
  eyebrow.textContent = "search_flights";
  body.appendChild(eyebrow);

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
    card.appendChild(renderSponsoredStrip(result.sponsored));
  }

  return card;
}

function renderToolCall(call) {
  if (call.name === "get_weather") {
    thread.appendChild(renderWeatherCard(call.result));
  } else if (call.name === "search_flights") {
    thread.appendChild(renderFlightsCard(call.result));
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

    for (const call of data.toolCalls ?? []) {
      renderToolCall(call);
    }
    addBubble("assistant", data.reply || "…");
    messages.push({ role: "assistant", content: data.reply || "" });
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
