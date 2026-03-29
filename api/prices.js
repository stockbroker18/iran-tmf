// Vercel serverless function — live market prices with derivative inference
// Strategy:
//   1. Always fetch derivative/CFD prices (futures, forex — trade nearly 24h)
//   2. Fetch spot prices when available
//   3. If spot is closed/stale, infer spot from derivative using last-known basis
//   4. Derive DXY from component FX pairs using the exact ICE formula
//
// No API key required — uses Yahoo Finance server-side (no CORS issue)
//
// DXY formula (ICE, exact weights):
//   DXY = 50.14348112 * EURUSD^(-0.576) * USDJPY^(0.136) * GBPUSD^(-0.119)
//         * USDCAD^(0.091) * USDSEK^(0.042) * USDCHF^(0.036)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── Symbol map ─────────────────────────────────────────────────────────────
  // spot: primary market (may be closed)
  // derivative: liquid proxy trading nearly 24h
  const SYMBOLS = {
    spx:    { spot: "^GSPC",    derivative: "ES=F",    label: "S&P 500" },
    brent:  { spot: "BZ=F",     derivative: "BZ=F",    label: "Brent Crude" },  // futures IS the primary liquid market
    ust5y:  { spot: "^FVX",     derivative: "ZF=F",    label: "5Y Treasury" },
    // DXY derived from FX pairs — see below
    eurusd: { spot: "EURUSD=X", derivative: "EURUSD=X", label: "EUR/USD" },
    usdjpy: { spot: "JPY=X",    derivative: "JPY=X",    label: "USD/JPY" },
    gbpusd: { spot: "GBPUSD=X", derivative: "GBPUSD=X", label: "GBP/USD" },
    usdcad: { spot: "USDCAD=X", derivative: "USDCAD=X", label: "USD/CAD" },
    usdsek: { spot: "USDSEK=X", derivative: "USDSEK=X", label: "USD/SEK" },
    usdchf: { spot: "USDCHF=X", derivative: "USDCHF=X", label: "USD/CHF" },
  };

  // ── Fetch a single Yahoo Finance quote ────────────────────────────────────
  async function fetchQuote(symbol) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
    });
    if (!r.ok) throw new Error(`Yahoo ${r.status} for ${symbol}`);
    const d = await r.json();
    const meta = d?.chart?.result?.[0]?.meta;
    if (!meta) throw new Error(`No meta for ${symbol}`);
    return {
      price:       meta.regularMarketPrice ?? null,
      prevClose:   meta.previousClose ?? null,
      marketState: meta.marketState ?? "UNKNOWN",
      // Yahoo returns timestamps in seconds
      priceTime:   meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : null,
    };
  }

  // ── Fetch all quotes in parallel ─────────────────────────────────────────
  const raw = {};
  await Promise.allSettled(
    Object.entries(SYMBOLS).map(async ([key, sym]) => {
      try {
        // Only fetch spot if different from derivative (avoid duplicate calls)
        const quote = await fetchQuote(sym.spot);
        raw[key] = quote;
      } catch (e) {
        raw[key] = { error: e.message };
      }
    })
  );

  // Also fetch E-mini futures and 5Y futures explicitly for derivative inference
  let esMini = null, zf = null;
  try { esMini = await fetchQuote("ES=F"); } catch {}
  try { zf     = await fetchQuote("ZF=F"); } catch {}

  // ── Helper: is a quote fresh? (within last 30 minutes) ────────────────────
  function isFresh(quote) {
    if (!quote?.price || !quote?.priceTime) return false;
    return (Date.now() - quote.priceTime.getTime()) < 30 * 60 * 1000;
  }

  // ── SPX: use spot if fresh, else infer from E-mini ────────────────────────
  // ES futures trade at a small premium to SPX (fair value basis ~5-15pts typically)
  // When we have both, compute basis = SPX_spot - ES_future
  // When spot is closed, apply last known basis to current ES price
  let spxPrice = null, spxMethod = "closed";
  const spxSpot = raw.spx;
  if (isFresh(spxSpot)) {
    spxPrice  = spxSpot.price;
    spxMethod = "spot";
  } else if (esMini?.price) {
    // Fair value approximation: ES futures typically trade ~5-10pts above SPX spot
    // during normal conditions (interest rate - dividend yield * days to expiry / 365)
    // For simplicity use a fixed basis of -10pts (ES premium to spot)
    // This is updated by our basis tracking below
    const storedBasis = parseFloat(req.headers["x-spx-basis"] || "-10");
    spxPrice  = esMini.price + storedBasis;
    spxMethod = `inferred from ES=F (basis ${storedBasis > 0 ? "+" : ""}${storedBasis.toFixed(0)}pts)`;
  } else if (spxSpot?.prevClose) {
    spxPrice  = spxSpot.prevClose;
    spxMethod = "prev close";
  }

  // ── Brent: futures ARE the primary liquid market, always use directly ──────
  let brentPrice = null, brentMethod = "closed";
  const brentQ = raw.brent;
  if (brentQ?.price) {
    brentPrice  = brentQ.price;
    brentMethod = `BZ=F futures (${brentQ.marketState})`;
  }

  // ── 5Y Treasury Yield: use ^FVX spot if fresh, else infer from ZF futures ─
  // ZF (5Y T-Note futures) price and yield are inversely related
  // Yield ≈ (1 - (ZF_price / 100 - 1)) * 2 is a rough approximation
  // Better: use the last known spread between ^FVX yield and ZF-implied yield
  let ust5yPrice = null, ust5yMethod = "closed";
  const fvxQ = raw.ust5y;
  if (isFresh(fvxQ)) {
    ust5yPrice  = fvxQ.price;   // ^FVX already returns % yield directly
    ust5yMethod = "^FVX spot";
  } else if (zf?.price) {
    // ZF is quoted as % of par (e.g. 105.50 means 105.50% of face value)
    // Rough yield approximation from 5Y futures price:
    // DV01 of 5Y note ~ $40/bp, so yield = coupon + (100 - price) / duration_approx
    // Simpler: use price change to infer yield change from last known yield
    const lastYield = parseFloat(req.headers["x-ust5y-last"] || "4.07");
    const lastZF    = parseFloat(req.headers["x-zf-last"]    || "105.50");
    const zfChange  = zf.price - lastZF;   // pts change in ZF price
    // ZF DV01 ≈ $40 per $100k face per bp → price change in pts ≈ yield change * 0.04
    const yieldChange = -(zfChange / 0.04) / 100; // sign flip: price up = yield down
    ust5yPrice  = Math.max(0, lastYield + yieldChange);
    ust5yMethod = `inferred from ZF=F (Δ${zfChange.toFixed(3)}pts → Δ${(yieldChange*100).toFixed(1)}bps)`;
  } else if (fvxQ?.prevClose) {
    ust5yPrice  = fvxQ.prevClose;
    ust5yMethod = "prev close";
  }

  // ── DXY: compute from live FX component pairs using exact ICE formula ──────
  // DXY = 50.14348112 × EUR^(-0.576) × JPY^(0.136) × GBP^(-0.119)
  //       × CAD^(0.091) × SEK^(0.042) × CHF^(0.036)
  // Forex trades 24h/5d — always fresh. This is the most accurate DXY method.
  let dxyPrice = null, dxyMethod = "closed";
  const fx = {
    eurusd: raw.eurusd?.price,
    usdjpy: raw.usdjpy?.price,
    gbpusd: raw.gbpusd?.price,
    usdcad: raw.usdcad?.price,
    usdsek: raw.usdsek?.price,
    usdchf: raw.usdchf?.price,
  };
  if (Object.values(fx).every(v => v != null)) {
    dxyPrice = 50.14348112
      * Math.pow(fx.eurusd, -0.576)
      * Math.pow(fx.usdjpy,  0.136)
      * Math.pow(fx.gbpusd, -0.119)
      * Math.pow(fx.usdcad,  0.091)
      * Math.pow(fx.usdsek,  0.042)
      * Math.pow(fx.usdchf,  0.036);
    dxyMethod = "computed from 6 FX pairs (ICE formula)";
  } else {
    // Fallback: try ^DXY directly
    try {
      const dxQ = await fetchQuote("DX-Y.NYB");
      if (dxQ?.price) { dxyPrice = dxQ.price; dxyMethod = "DX-Y.NYB"; }
    } catch {}
  }

  // ── Compute basis for next call (when both spot and derivative available) ──
  const spxBasis = (isFresh(spxSpot) && esMini?.price)
    ? (spxSpot.price - esMini.price)
    : null;

  const zfPrice = zf?.price ?? null;

  // ── Response ───────────────────────────────────────────────────────────────
  return res.status(200).json({
    // Primary outputs
    spx:   spxPrice   != null ? Math.round(spxPrice * 100) / 100 : null,
    brent: brentPrice != null ? Math.round(brentPrice * 100) / 100 : null,
    ust5y: ust5yPrice != null ? Math.round(ust5yPrice * 1000) / 1000 : null,
    dxy:   dxyPrice   != null ? Math.round(dxyPrice * 100) / 100 : null,

    // Method transparency
    methods: { spx: spxMethod, brent: brentMethod, ust5y: ust5yMethod, dxy: dxyMethod },

    // Basis tracking (for client to pass back on next request via headers)
    basis: { spxBasis, zfPrice, ust5yYield: ust5yPrice },

    // Raw FX components (useful for debugging / display)
    fx,

    // Market state
    marketStates: {
      spx:   spxSpot?.marketState,
      brent: brentQ?.marketState,
      ust5y: fvxQ?.marketState,
    },

    source:    "Yahoo Finance (server-side) · DXY via ICE formula · derivatives for after-hours",
    fetchedAt: new Date().toISOString(),
  });
}
