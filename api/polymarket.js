// Vercel serverless function — fetches live Polymarket prediction market prices
// Uses the public Gamma API — no API key or auth required
// Docs: https://docs.polymarket.com/market-data/overview

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Key Iran/conflict markets mapped to our scenario framework
  // slugs are the human-readable event identifiers from polymarket.com URLs
  const MARKETS = [
    {
      key:      "regime_fall_apr30",
      label:    "Regime fall by Apr 30",
      slug:     "will-the-iranian-regime-fall-by-april-30",
      scenario: "collapse",
      signal:   "YES price = probability of near-term collapse",
    },
    {
      key:      "regime_fall_jun30",
      label:    "Regime fall by Jun 30",
      slug:     "will-the-iranian-regime-fall-by-june-30",
      scenario: "collapse",
      signal:   "YES price = medium-term collapse probability",
    },
    {
      key:      "ceasefire_dec31",
      label:    "US-Iran ceasefire by Dec 31",
      slug:     "us-x-iran-ceasefire-by",
      scenario: "reform",
      signal:   "Multi-outcome — fetch sub-market for Dec 31",
    },
    {
      key:      "mojtaba_leader",
      label:    "Mojtaba as Iran leader end-2026",
      slug:     "iran-leader-end-of-2026",
      scenario: "military_junta",
      signal:   "Mojtaba YES price = IRGC hardline continuity",
    },
  ];

  const results = {};

  await Promise.allSettled(MARKETS.map(async (market) => {
    try {
      // Gamma API: public endpoint, no auth
      const url = `https://gamma-api.polymarket.com/events?slug=${market.slug}&limit=1`;
      const res2 = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "IranTMF/1.0" },
      });
      if (!res2.ok) throw new Error(`Gamma API ${res2.status} for ${market.slug}`);
      const data = await res2.json();

      const event = Array.isArray(data) ? data[0] : data;
      if (!event) throw new Error(`No event found for ${market.slug}`);

      // For binary markets: find the YES outcome price
      // outcomePrices is a JSON string array e.g. '["0.085","0.915"]'
      // outcomes is a JSON string array e.g. '["Yes","No"]'
      const markets = event.markets || [];

      let yesPrice = null;
      let volume   = event.volume ?? null;
      let label    = market.label;

      if (market.key === "mojtaba_leader") {
        // Multi-outcome: find the Mojtaba market
        const m = markets.find(m2 =>
          (m2.question || "").toLowerCase().includes("mojtaba") ||
          (m2.outcomeName || "").toLowerCase().includes("mojtaba")
        );
        if (m) {
          const prices = typeof m.outcomePrices === "string" ? JSON.parse(m.outcomePrices) : m.outcomePrices;
          yesPrice = parseFloat(prices?.[0]) || null;
          label = "Mojtaba as Iran leader (end 2026)";
        }
      } else if (market.key === "ceasefire_dec31") {
        // Multi-date: find the Dec 31 sub-market
        const m = markets.find(m2 =>
          (m2.question || m2.groupItemTitle || "").includes("December 31") ||
          (m2.question || m2.groupItemTitle || "").includes("Dec 31")
        );
        if (m) {
          const prices = typeof m.outcomePrices === "string" ? JSON.parse(m.outcomePrices) : m.outcomePrices;
          const outcomes = typeof m.outcomes === "string" ? JSON.parse(m.outcomes) : m.outcomes;
          const yesIdx = outcomes?.findIndex(o => o.toLowerCase() === "yes");
          yesPrice = yesIdx >= 0 ? parseFloat(prices?.[yesIdx]) : parseFloat(prices?.[0]);
          label = "US-Iran ceasefire by Dec 31";
        }
      } else {
        // Standard binary market
        const m = markets[0];
        if (m) {
          const prices   = typeof m.outcomePrices === "string" ? JSON.parse(m.outcomePrices) : m.outcomePrices;
          const outcomes = typeof m.outcomes === "string" ? JSON.parse(m.outcomes) : m.outcomes;
          const yesIdx   = outcomes?.findIndex(o => o.toLowerCase() === "yes") ?? 0;
          yesPrice = parseFloat(prices?.[yesIdx >= 0 ? yesIdx : 0]) || null;
        }
      }

      if (yesPrice !== null) {
        results[market.key] = {
          label,
          probability: Math.round(yesPrice * 100),  // e.g. 0.085 -> 8.5%
          scenario:    market.scenario,
          signal:      market.signal,
          volume:      volume ? Math.round(volume / 1000) + "k" : null,
          fetchedAt:   new Date().toISOString(),
        };
      }
    } catch (err) {
      results[market.key] = { label: market.label, error: err.message, scenario: market.scenario };
    }
  }));

  return res.status(200).json({
    markets: results,
    fetchedAt: new Date().toISOString(),
    source: "Polymarket Gamma API (public)",
  });
}
