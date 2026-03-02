// Vercel serverless function — fetches live market prices via Twelve Data
// Free tier: 800 calls/day, no expiry, no credit card required
// Get a free key at: https://twelvedata.com/apikey
//
// Symbols used:
//   SPX     — S&P 500 index (tracks E-mini ES futures during off-hours)
//   BRENT   — Brent Crude Oil
//   DXY     — US Dollar Index
//   UST5Y via US5Y (5-Year Treasury Yield)
// All four fetched in a single batched API call to minimise quota usage

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "TWELVEDATA_API_KEY not set. Get a free key at twelvedata.com/apikey then add it in Vercel → Settings → Environment Variables."
    });
  }

  try {
    // Single batched request — counts as 1 API call against the 800/day quota
    const symbols = "SPX,BRENT,DXY,US5Y";
    const url = `https://api.twelvedata.com/price?symbol=${symbols}&apikey=${apiKey}`;

    const response = await fetch(url);
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ error: "Twelve Data returned non-JSON: " + text.slice(0, 200) });
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.message || "Twelve Data API error" });
    }

    // Parse response — Twelve Data returns { SYMBOL: { price: "..." } } for batched requests
    // or { price: "..." } for single symbol. Handle both.
    function extractPrice(key) {
      const entry = data[key];
      if (!entry) return null;
      if (entry.status === "error") return null;
      const p = parseFloat(entry.price);
      return isNaN(p) ? null : p;
    }

    const spx   = extractPrice("SPX");
    const brent = extractPrice("BRENT");
    const dxy   = extractPrice("DXY");
    const ust5y = extractPrice("US5Y");

    // Convert 5Y yield: Twelve Data returns it as a percentage value e.g. 3.512
    // No conversion needed — matches our baseline format directly

    const result = {
      spx,
      brent,
      dxy,
      ust5y,
      source: "Twelve Data (free tier · 800 calls/day)",
      fetchedAt: new Date().toISOString(),
      marketStatus: data.market_status ?? null,
    };

    // Log what we got for debugging
    console.log("Prices fetched:", JSON.stringify(result));

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: "Price fetch failed: " + err.message });
  }
}
