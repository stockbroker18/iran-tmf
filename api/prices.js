// Vercel serverless function — live market prices via Yahoo Finance
// No API key required. Runs server-side so CORS is not an issue.
// Symbols:
//   ^GSPC  = S&P 500 spot index
//   BZ=F   = Brent Crude front-month futures (most liquid Brent proxy)
//   ^FVX   = 5-Year Treasury Yield (CBOE)
//   DX-Y.NYB = US Dollar Index (DXY)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const symbolMap = {
    spx:   "^GSPC",
    brent: "BZ=F",
    ust5y: "^FVX",
    dxy:   "DX-Y.NYB",
  };

  const results = {};
  const errors  = {};

  await Promise.allSettled(
    Object.entries(symbolMap).map(async ([asset, sym]) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d`;
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Iran-TMF/1.0)",
            "Accept": "application/json",
          },
        });

        if (!response.ok) throw new Error(`Yahoo returned ${response.status} for ${sym}`);

        const data  = await response.json();
        const meta  = data?.chart?.result?.[0]?.meta;
        if (!meta)  throw new Error(`No meta for ${sym}`);

        // Prefer regularMarketPrice (real-time during market hours)
        // Fall back to previousClose if market is closed
        const price = meta.regularMarketPrice ?? meta.previousClose ?? null;
        const marketState = meta.marketState ?? "UNKNOWN";

        if (price == null) throw new Error(`No price for ${sym}`);

        // ^FVX returns yield * 10 — divide to get actual % yield
        results[asset] = asset === "ust5y" ? price / 10 : price;
        results[`${asset}_marketState`] = marketState;

      } catch (err) {
        errors[asset] = err.message;
      }
    })
  );

  // Build a readable market status string
  const states = Object.entries(results)
    .filter(([k]) => k.endsWith("_marketState"))
    .map(([k, v]) => `${k.replace("_marketState", "")}:${v}`)
    .join(", ");

  return res.status(200).json({
    spx:   results.spx   ?? null,
    brent: results.brent ?? null,
    ust5y: results.ust5y ?? null,
    dxy:   results.dxy   ?? null,
    marketStates: states,
    source: "Yahoo Finance (server-side, no auth)",
    fetchedAt: new Date().toISOString(),
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  });
}
