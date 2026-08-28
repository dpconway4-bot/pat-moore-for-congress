/* ============================================================
   Analytics
   ------------------------------------------------------------
   Two layers:
   1. Vercel Web Analytics — traffic (pageviews, visitors,
      referrers, geography). Loaded via script tag in index.html.
      Activate it in the Vercel dashboard: Project > Analytics >
      Enable. No code changes needed beyond what's already here.

   2. Google Analytics 4 — click & conversion tracking (Donate,
      Volunteer sign-up, Social share, Phone number).
      To activate: create a free GA4 property at
      https://analytics.google.com, copy its Measurement ID
      (looks like "G-XXXXXXXXXX"), and paste it below.
   ============================================================ */

const GA_MEASUREMENT_ID = "G-VQNDT2E223";

(function loadGA4() {
  if (!GA_MEASUREMENT_ID) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID);
})();

/**
 * Fires a click/conversion event to both Vercel Web Analytics
 * (custom events) and Google Analytics 4, whichever are active.
 * Safe to call even before either is configured — it just no-ops.
 */
function trackEvent(name, params) {
  try {
    if (typeof window.va === "function") {
      window.va("event", { name, data: params });
    }
  } catch (e) {
    /* no-op */
  }
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params || {});
    }
  } catch (e) {
    /* no-op */
  }
}

document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("[data-analytics-event]").forEach(function (el) {
    el.addEventListener("click", function () {
      const eventName = el.getAttribute("data-analytics-event");
      const label = el.getAttribute("data-analytics-label") || el.textContent.trim();
      trackEvent(eventName, { label });
    });
  });
});
