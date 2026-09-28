// Jarvis Stage renderer: one file for the Cast receiver, the browser stage and the demo.
// All content is set with textContent / SVG attributes — deck text is never parsed as HTML.
(function () {
  "use strict";
  const NS = "urn:x-cast:ai.jarvis.stage";
  const stageEl = document.getElementById("stage");
  const SVG = "http://www.w3.org/2000/svg";
  let deck = null;
  let index = 0;
  // Burn-in protection (burnin.js): pixel shift, dim stale slides, ambient idle screen.
  let clockSkew = 0;   // test hook: advance the burn-in clock without waiting
  const burnin = window.JarvisBurnin
    ? window.JarvisBurnin.createBurnin({ el: stageEl, now: () => Date.now() + clockSkew })
    : { activity() {}, idle() {}, tick() {} };
  setInterval(() => burnin.tick(), 1000);

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function svg(tag, attrs) {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, String(v));
    return node;
  }

  function niceStep(rough) {
    if (!(rough > 0)) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const r = rough / mag;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * mag;
  }

  // "Hermes" with a breathing dot while the hub has open tasks (data-working on the stage element).
  function workingBadge() {
    const badge = el("span", "working");
    badge.append(el("i", "working-dot"), document.createTextNode("Hermes"));
    return badge;
  }

  function idle(message) {
    deck = null;
    burnin.idle();
    stageEl.replaceChildren();
    const box = el("section", "slide slide-idle");
    box.append(el("h1", "wordmark", "Jarvis"), el("p", "idle-text", message), workingBadge());
    stageEl.append(box);
  }

  const renderers = {
    title(data, body) {
      if (data.subtitle) body.append(el("p", "subtitle", data.subtitle));
    },
    bullets(data, body) {
      const list = el("ul", "bullets");
      for (const item of data.items || []) list.append(el("li", null, item));
      body.append(list);
    },
    metric(data, body) {
      const grid = el("div", "metrics count-" + (data.items || []).length);
      for (const item of data.items || []) {
        const card = el("div", "metric");
        const value = el("div", "metric-value", item.value);
        if (item.trend) value.append(el("span", "trend trend-" + item.trend, { up: "▲", down: "▼", flat: "▶" }[item.trend]));
        card.append(value, el("div", "metric-label", item.label));
        grid.append(card);
      }
      body.append(grid);
    },
    chart(data, body) {
      const W = 1000, H = 440;
      const all = (data.series || []).flatMap((s) => s.values);
      const rawMax = Math.max(1, ...all), rawMin = Math.min(0, ...all);
      // "Nice" ticks: a 1/2/5 × 10^n step so the axis reads 0/20/40/60 instead of 15/31/46/61.
      const stepY = niceStep((rawMax - rawMin) / 4);
      const min = Math.floor(rawMin / stepY) * stepY, max = Math.ceil(rawMax / stepY) * stepY;
      const decimals = stepY >= 1 ? 0 : 1;
      const yLabel = (v) => v.toFixed(decimals) + (data.unit ? " " + data.unit : "");
      const longestY = yLabel(max).length > yLabel(min).length ? yLabel(max) : yLabel(min);
      const P = { l: Math.max(70, 12 + longestY.length * 11), r: 20, t: 20, b: 50 };
      const n = (data.x || []).length || 1;
      const xAt = (i) => P.l + (n === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (n - 1));
      const yAt = (v) => P.t + (H - P.t - P.b) * (1 - (v - min) / (max - min || 1));
      const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "chart" });
      chart.setAttribute("preserveAspectRatio", "xMinYMid meet");
      for (let v = min; v <= max + stepY / 1000; v += stepY) {
        const y = yAt(v);
        chart.append(svg("line", { x1: P.l, x2: W - P.r, y1: y, y2: y, class: "grid" }));
        const label = svg("text", { x: P.l - 10, y: y + 5, class: "axis", "text-anchor": "end" });
        label.textContent = yLabel(v);
        chart.append(label);
      }
      // Show as many x labels as fit: about 11 px per character at the axis size, plus a gap.
      const longestX = Math.max(1, ...(data.x || []).map((x) => String(x).length));
      const step = Math.max(1, Math.ceil((n * (longestX * 11 + 14)) / (W - P.l - P.r)));
      const groupW = (W - P.l - P.r) / n;
      // Bars sit in the middle of their group; line points sit on the ticks.
      const labelX = (i) => (data.kind === "bar" ? P.l + i * groupW + groupW / 2 : xAt(i));
      (data.x || []).forEach((x, i) => {
        if (i % step) return;
        const t = svg("text", { x: labelX(i), y: H - 15, class: "axis", "text-anchor": "middle" });
        t.textContent = x;
        chart.append(t);
      });
      (data.series || []).forEach((s, k) => {
        if (data.kind === "bar") {
          const barW = Math.max(2, (groupW * 0.8) / data.series.length);
          s.values.forEach((v, i) => {
            const x = P.l + i * groupW + groupW * 0.1 + k * barW;
            chart.append(svg("rect", { x, y: yAt(Math.max(v, 0)), width: barW, height: Math.abs(yAt(v) - yAt(0)), class: "series-" + k }));
          });
        } else if (s.values.length === 1) {
          chart.append(svg("circle", { cx: xAt(0), cy: yAt(s.values[0]), r: 9, class: "point series-" + k }));  // a single point has no line
        } else {
          const d = s.values.map((v, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
          chart.append(svg("path", { d, class: "line series-" + k }));
        }
      });
      body.append(chart);
      if ((data.series || []).length > 1) {
        const legend = el("div", "legend");
        data.series.forEach((s, k) => {
          const item = el("span", "legend-item");
          item.append(el("i", "swatch series-" + k), document.createTextNode(s.name));
          legend.append(item);
        });
        body.append(legend);
      }
    },
    table(data, body) {
      const table = el("table", "table");
      if ((data.columns || []).length) {
        const head = el("tr");
        for (const c of data.columns) head.append(el("th", null, c));
        table.append(head);
      }
      for (const row of data.rows || []) {
        const tr = el("tr");
        for (const cell of row) tr.append(el("td", null, cell));
        table.append(tr);
      }
      const wrap = el("div", "table-wrap");
      wrap.append(table);
      body.append(wrap);
    },
    image(data, body) {
      const figure = el("figure", "image");
      const img = el("img");
      img.src = data.url;
      img.alt = data.caption || "";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => img.replaceWith(el("div", "broken", "Image could not be loaded"));
      figure.append(img);
      if (data.caption) figure.append(el("figcaption", null, data.caption));
      body.append(figure);
    },
    text(data, body) {
      body.append(el("blockquote", "text", data.body));
    },
  };

  function render() {
    delete stageEl.dataset.mode;   // a deck/goto ends camera mode
    if (!deck || !deck.slides || !deck.slides.length) return idle("Waiting for a presentation");
    index = Math.max(0, Math.min(index, deck.slides.length - 1));
    const slide = deck.slides[index];
    const section = el("section", "slide type-" + slide.type);
    section.lang = deck.lang || "en";
    const header = el("header", "slide-header");
    header.append(el("span", "deck-title", deck.title), workingBadge(), el("span", "progress", `${index + 1} / ${deck.slides.length}`));
    const body = el("div", "slide-body");
    body.append(el("h1", "slide-title", slide.title));
    (renderers[slide.type] || renderers.text)(slide.data || {}, body);
    section.append(header, body);
    stageEl.replaceChildren(section);
  }

  function showCamera(b64) {
    if (typeof b64 !== "string" || !b64) return;
    const img = document.createElement("img");
    img.className = "camera-frame";
    img.alt = "Camera";
    img.src = "data:image/jpeg;base64," + b64;
    stageEl.replaceChildren(img);
    stageEl.dataset.mode = "camera";
  }

  function handle(message, reply) {
    if (!message || typeof message !== "object") return;
    if (message.type !== "working") burnin.activity();   // a task count changing is not someone using the screen
    if (message.type === "hello" && reply) reply({ type: "ready" });
    else if (message.type === "deck") { deck = message.deck; index = message.index || 0; render(); }
    else if (message.type === "goto") { index = message.index; render(); }
    else if (message.type === "close") return "close";
    else if (message.type === "image") showCamera(message.data);
    else if (message.type === "working") stageEl.dataset.working = message.count > 0 ? "true" : "false";
    else if (message.type === "welcome") idle("Screen “" + message.screen + "” is ready");
  }

  function startCast() {
    const ctx = cast.framework.CastReceiverContext.getInstance();
    ctx.addCustomMessageListener(NS, (event) => {
      const result = handle(event.data, (answer) => ctx.sendCustomMessage(NS, event.senderId, answer));
      if (result === "close") ctx.stop();
    });
    const options = new cast.framework.CastReceiverOptions();
    options.disableIdleTimeout = true;
    options.customNamespaces = { [NS]: cast.framework.system.MessageType.JSON };
    ctx.start(options);
    idle("Connecting…");
  }

  function startBrowser() {
    const params = new URLSearchParams(location.search);
    let token = "", screen = params.get("screen") || "";
    try {
      token = localStorage.getItem("jarvis.token") || "";
      screen = screen || localStorage.getItem("jarvis.screen") || "browser";
      localStorage.setItem("jarvis.screen", screen);
    } catch { screen = screen || "browser"; }
    if (!token) return idle("Open the Jarvis voice page once and enter the device token");
    let delay = 1000;
    const connect = () => {
      const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/stage/ws");
      let alive;
      ws.onopen = () => {
        delay = 1000;
        ws.send(JSON.stringify({ type: "hello", token, screen }));
        alive = setInterval(() => ws.readyState === 1 && ws.send("ping"), 20000);
      };
      ws.onmessage = (event) => {
        const result = handle(JSON.parse(event.data));
        if (result === "close") idle("Presentation ended");
      };
      ws.onclose = (event) => {
        clearInterval(alive);
        if (event.code === 4401) return idle("Device token rejected");
        if (event.code === 4409) return idle("Another page took over this screen name");
        idle("Reconnecting…");
        setTimeout(connect, delay);
        delay = Math.min(delay * 2, 30000);
      };
    };
    connect();
  }

  function startDemo() {
    const decks = window.JARVIS_SAMPLE_DECKS || [];
    const wanted = new URLSearchParams(location.search).get("deck");
    deck = decks.find((d) => d.id === wanted) || decks[0] || null;
    index = 0;
    render();
    // Hooks for the headless render test (tests/renderer).
    window.__stage = {
      count: () => (deck ? deck.slides.length : 0),
      goto: (i) => { index = i; render(); },
      handle,
      idle: () => idle("Waiting for a presentation"),
      advance: (ms) => { clockSkew += ms; burnin.tick(); },
    };
    document.addEventListener("keydown", (event) => {
      if (!deck) return;
      if (event.key === "ArrowRight") index = Math.min(index + 1, deck.slides.length - 1);
      if (event.key === "ArrowLeft") index = Math.max(index - 1, 0);
      render();
    });
  }

  window.JarvisStage = { handle, render, show: (d, i) => { deck = d; index = i || 0; render(); } };
  const mode = document.body.dataset.mode;
  if (mode === "cast") startCast();
  else if (new URLSearchParams(location.search).has("demo")) startDemo();
  else startBrowser();
})();
