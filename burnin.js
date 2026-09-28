// Burn-in protection for screens that show Jarvis for hours (OLED TVs, phones on a dock):
// a small pixel shift every minute, a dim overlay on a slide nobody navigated for a while,
// and an "ambient" idle screen (black, one drifting dot) instead of a static wordmark.
// Pure helpers are exported for tests; createBurnin wires them to one element.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.JarvisBurnin = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SHIFT_PX = 6;

  function nextShift(random) {
    const pick = () => Math.round((random() * 2 - 1) * SHIFT_PX);
    return { x: pick(), y: pick() };
  }

  function dimDue(lastActivity, now, dimMs) {
    return lastActivity !== null && now - lastActivity >= dimMs;
  }

  function ambientDue(idleSince, now, ambientMs) {
    return idleSince !== null && now - idleSince >= ambientMs;
  }

  function createBurnin({ el, shiftMs = 60_000, dimMs = 600_000, ambientMs = 20_000, dotMs = 30_000, now = () => Date.now(), random = Math.random }) {
    let lastActivity = now();
    let lastShift = now();
    let lastDot = -Infinity;
    let idleSince = null;
    return {
      /** A message arrived (deck, goto, welcome …): the screen is in use. */
      activity() {
        lastActivity = now();
        idleSince = null;
        el.classList.remove("dim");
        el.classList.remove("ambient");
      },
      /** The idle screen is showing: after ambientMs it fades to the drifting dot. */
      idle() {
        idleSince = now();
        el.classList.remove("ambient");
      },
      /** Call about once a second. */
      tick() {
        const t = now();
        if (t - lastShift >= shiftMs) {
          lastShift = t;
          const { x, y } = nextShift(random);
          el.style.transform = `translate(${x}px, ${y}px)`;
        }
        if (idleSince === null && dimDue(lastActivity, t, dimMs)) el.classList.add("dim");
        if (ambientDue(idleSince, t, ambientMs)) {
          el.classList.add("ambient");
          if (t - lastDot >= dotMs) {   // the lone dot wanders: no pixel stays lit for long
            lastDot = t;
            el.style.setProperty("--dot-x", `${Math.round(10 + random() * 80)}%`);
            el.style.setProperty("--dot-y", `${Math.round(10 + random() * 80)}%`);
          }
        }
      },
    };
  }

  return { nextShift, dimDue, ambientDue, createBurnin, SHIFT_PX };
});
