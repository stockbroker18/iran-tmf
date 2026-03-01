import { useState, useEffect, useCallback } from "react";

// ─── BASELINE PRICES (Feb 28 2026 close) ─────────────────────────────────────
// These are the verified closing levels used as the starting point for all impact estimates.
// The app attempts to update these live via Yahoo Finance query API on load / refresh.
const BASELINE = {
  spx:   { value: 6878.88, label: "S&P 500",          unit: "pts",  fmt: v => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
  brent: { value: 72.87,   label: "Brent Crude",       unit: "$/bbl",fmt: v => `$${v.toFixed(2)}` },
  ust5y: { value: 3.512,   label: "5Y Treasury Yield", unit: "%",    fmt: v => `${v.toFixed(3)}%` },
  dxy:   { value: 97.65,   label: "DXY (USD Index)",   unit: "",     fmt: v => v.toFixed(2) },
};



// ─── SCENARIOS ────────────────────────────────────────────────────────────────
// Each market entry:
//   pct_low / pct_high  : confidence interval bounds (% move from baseline; bps for ust5y)
//   pct_mid             : central estimate
//   direction           : "up" | "down" | "mixed" | "neutral"
//   timeframe           : days over which the move is expected to play out
//   rationale           : brief reasoning
//   ci_label            : human-readable confidence interval string
const SCENARIOS = [
  {
    id: "status_quo", label: "Status Quo / Continuity", color: "#f5a623",
    desc: "Assembly of Experts names new Supreme Leader within 48hrs", baseScore: 2,
    markets: {
      spx:   { direction: "neutral", pct_mid: -0.5,  pct_low: -1.5,  pct_high: +0.5,  timeframe: 5, rationale: "Relief at succession certainty offsets ongoing conflict risk. No de-escalation catalyst. Already-elevated VIX (19.86) limits further compression.", ci_label: "−1.5% to +0.5%" },
      brent: { direction: "up",      pct_mid: +4.0,  pct_low: +2.0,  pct_high: +8.0,  timeframe: 7, rationale: "Sustained Hormuz risk premium. Brent already elevated at $72.87 (+$10 war premium per JPM). New leader continuity = no supply normalisation.", ci_label: "+2% to +8%" },
      ust5y: { direction: "neutral", pct_mid: +3,    pct_low: -5,    pct_high: +8,    timeframe: 5, rationale: "No flight-to-safety driver, no resolution. Inflation from oil persists. 5Y yield (3.512%) stays range-bound near Fed funds rate.", ci_label: "−5bps to +8bps", isBps: true },
      dxy:   { direction: "up",      pct_mid: +0.4,  pct_low: +0.1,  pct_high: +0.9,  timeframe: 5, rationale: "Mild safe-haven bid maintained. DXY (97.65) already weak vs 52w high of 107.56 — limited upside without new catalyst.", ci_label: "+0.1% to +0.9%" },
    },
  },
  {
    id: "military_junta", label: "Military Junta (IRGC)", color: "#e74c3c",
    desc: "IRGC declares State of Emergency; Artesh stays in barracks", baseScore: 3,
    markets: {
      spx:   { direction: "down",  pct_mid: -4.0,  pct_low: -2.5,  pct_high: -6.5,  timeframe: 7, rationale: "Protracted conflict risk-off shock. Historical analogue: SPX −3.1% in week following Gulf War I outbreak. Elevated VIX (19.86) → 28−35 range. Energy/defence outperform; tech/consumer underperform.", ci_label: "−2.5% to −6.5%" },
      brent: { direction: "up",    pct_mid: +12.0, pct_low: +8.0,  pct_high: +18.0, timeframe: 7, rationale: "IRGC takeover sharply raises Hormuz closure risk. Strait carries ~21% global oil. Barclays warns 'Brent could hit $100'. Current $72.87 → $81–86 central, $100 tail. Eurasia Group: +$5–10 just from restriction news.", ci_label: "+8% to +18%" },
      ust5y: { direction: "down",  pct_mid: -20,   pct_low: -12,   pct_high: -28,   timeframe: 7, rationale: "Classic flight-to-safety bid. Historical: 5Y yields fell 15−25bps in first week of Gulf War II. Fed may signal pause. Stagflation risk complicates direction beyond week 1.", ci_label: "−12bps to −28bps", isBps: true },
      dxy:   { direction: "up",    pct_mid: +2.2,  pct_low: +1.2,  pct_high: +3.5,  timeframe: 7, rationale: "Strong safe-haven surge. EM and commodity currencies sell off. DXY spike of +2−4% is consistent with prior Middle East escalation episodes (2003 Iraq, 2019 Aramco strike).", ci_label: "+1.2% to +3.5%" },
    },
  },
  {
    id: "reform", label: "Controlled Reform", color: "#3498db",
    desc: "Appointment of Larijani / Council; release political prisoners", baseScore: 2,
    markets: {
      spx:   { direction: "up",   pct_mid: +2.0,  pct_low: +0.8,  pct_high: +3.5,  timeframe: 7, rationale: "De-escalation relief rally. Energy sector (XLE) leads. Geopolitical risk premium unwinds partially. Historical: SPX +1.5−2.5% on comparable ME ceasefire/deal news.", ci_label: "+0.8% to +3.5%" },
      brent: { direction: "down", pct_mid: -7.0,  pct_low: -4.0,  pct_high: -11.0, timeframe: 7, rationale: "War premium unwinding. Potential Iranian supply return if sanctions partially lifted. Brent gives back ~50−75% of war premium. JPM fair value ~$60 implies $12+ downside from $72.87.", ci_label: "−4% to −11%" },
      ust5y: { direction: "up",   pct_mid: +10,   pct_low: +5,    pct_high: +18,   timeframe: 7, rationale: "Risk appetite returns, Treasuries sold. Oil price drop reduces inflation expectation. 5Y yield rises as safe-haven unwind dominates.", ci_label: "+5bps to +18bps", isBps: true },
      dxy:   { direction: "down", pct_mid: -1.1,  pct_low: -0.5,  pct_high: -1.8,  timeframe: 7, rationale: "Risk-on flows into EM, commodity FX. EUR/USD, AUD/USD outperform. DXY gives back safe-haven bid.", ci_label: "−0.5% to −1.8%" },
    },
  },
  {
    id: "collapse", label: "Regime Collapse", color: "#2ecc71",
    desc: "General-level defections; seizure of state TV by protesters", baseScore: 1,
    markets: {
      spx:   { direction: "mixed", pct_mid: +2.0, pct_low: -4.0,  pct_high: +6.0,  timeframe: 7, rationale: "Sequencing is everything. Day 1−2: risk-off −2 to −4% on chaos and uncertainty. Day 3−7: sharp rally +4 to +6% if pro-West transition confirmed. Net weekly outcome: positive if transition narrative takes hold. Wide CI reflects binary path.", ci_label: "−4% to +6% (path-dependent)" },
      brent: { direction: "down",  pct_mid: -8.0, pct_low: -3.0,  pct_high: -15.0, timeframe: 7, rationale: "Medium-term most bearish scenario for oil. Iran supply normalisation + Hormuz reopening = structural demand for price lower. But chaotic transition could cause short-term spike. Net: −5 to −15% over the week as normalisation narrative dominates.", ci_label: "−3% to −15%" },
      ust5y: { direction: "up",    pct_mid: +12,  pct_low: +5,    pct_high: +22,   timeframe: 7, rationale: "Post-chaos: once transition confirmed, inflation expectations ease sharply (Iran supply returns). 5Y yields rise on growth optimism. Initial safety bid reverses quickly.", ci_label: "+5bps to +22bps", isBps: true },
      dxy:   { direction: "down",  pct_mid: -1.6, pct_low: -0.5,  pct_high: -2.8,  timeframe: 7, rationale: "Strongest risk-on unwind of all scenarios. EM and oil-linked currencies (CAD, NOK, RUB) rally hard. DXY gives back all war-premium safe-haven flows.", ci_label: "−0.5% to −2.8%" },
    },
  },
];

// ─── INDICATORS ───────────────────────────────────────────────────────────────
const INDICATORS = {
  security: [
    { id: "s1",  label: "Security force defections observed",                      scenario: "collapse",       weight: 3 },
    { id: "s2",  label: "Artesh claims neutrality publicly",                        scenario: "collapse",       weight: 3 },
    { id: "s3",  label: "IRGC deploys to central Tehran districts",                 scenario: "military_junta", weight: 2 },
    { id: "s4",  label: "Basij absent from neighbourhood checkpoints",              scenario: "collapse",       weight: 2 },
    { id: "s5",  label: "Internet restored while protests active (NetBlocks)",       scenario: "collapse",       weight: 2 },
    { id: "s6",  label: "IRGC / Artesh exchange fire or compete for state TV",       scenario: "collapse",       weight: 4 },
    { id: "s7",  label: "Quds Force commanders recalled from Syria/Iraq",            scenario: "military_junta", weight: 2 },
    { id: "s8",  label: "65th Airborne Brigade issues neutrality statement",         scenario: "collapse",       weight: 3 },
    { id: "s9",  label: "Air Force (IRIAF) pilots refuse sorties against civilians", scenario: "collapse",       weight: 3 },
    { id: "s10", label: "IRGC declares formal State of Emergency",                  scenario: "military_junta", weight: 3 },
  ],
  institutional: [
    { id: "i1",  label: "Assembly of Experts convenes quorum",                      scenario: "status_quo",     weight: 3 },
    { id: "i2",  label: "New Supreme Leader named within 48hrs",                    scenario: "status_quo",     weight: 4 },
    { id: "i3",  label: "AoE fails to reach quorum / forms council instead",         scenario: "military_junta", weight: 3 },
    { id: "i4",  label: "50-day election clock postponed indefinitely",              scenario: "military_junta", weight: 2 },
    { id: "i5",  label: "IRIB state media features Larijani as voice of reason",     scenario: "reform",         weight: 3 },
    { id: "i6",  label: "Political prisoners released",                              scenario: "reform",         weight: 2 },
    { id: "i7",  label: "IRIB defections / anti-regime content broadcast",           scenario: "collapse",       weight: 3 },
    { id: "i8",  label: "High-level sensitive leaks from factional infighting",      scenario: "collapse",       weight: 2 },
    { id: "i9",  label: "Mojtaba Khamenei named to any leadership role",             scenario: "military_junta", weight: 3 },
    { id: "i10", label: "Larijani chairs National Salvation Council",                scenario: "reform",         weight: 3 },
  ],
  external: [
    { id: "e1", label: "US State Dept uses term 'Provisional Government'",           scenario: "collapse",       weight: 4 },
    { id: "e2", label: "Reza Pahlavi invited for formal US/EU consultations",        scenario: "collapse",       weight: 4 },
    { id: "e3", label: "US establishes humanitarian corridors / Starlink drops",     scenario: "collapse",       weight: 3 },
    { id: "e4", label: "US sanctions relief for 'humanitarian purposes'",            scenario: "reform",         weight: 2 },
    { id: "e5", label: "Ceasefire or bombing pause announced",                       scenario: "reform",         weight: 3 },
    { id: "e6", label: "US/Israel expand strikes to civilian infrastructure",        scenario: "collapse",       weight: 2 },
  ],
  economic: [
    { id: "ec1", label: "Kharg Island tanker loading halted (Kpler)",                scenario: "collapse",       weight: 4 },
    { id: "ec2", label: "Partial oil sector strike begins",                          scenario: "military_junta", weight: 2 },
    { id: "ec3", label: "Council for Oil Workers announces 'permanent halt'",        scenario: "collapse",       weight: 3 },
    { id: "ec4", label: "Tehran Grand Bazaar closes indefinitely",                   scenario: "collapse",       weight: 3 },
    { id: "ec5", label: "Rial black market spikes >20% in single day (Bonbast)",    scenario: "collapse",       weight: 3 },
    { id: "ec6", label: "Utility workers strike / political blackouts",              scenario: "collapse",       weight: 2 },
    { id: "ec7", label: "South Pars gas field production halt",                      scenario: "collapse",       weight: 3 },
  ],
};

const ALL_INDICATORS = Object.values(INDICATORS).flat();

// ─── KEYWORD CLASSIFIER ───────────────────────────────────────────────────────
const KEYWORD_MAP = [
  { keywords: ["defect", "desert", "neutral", "refuse order", "refuse to fire", "join protest", "artesh"],   scenario: "collapse",       label: "Security defection signal" },
  { keywords: ["assembly of experts", "supreme leader", "successor", "named leader", "new leader"],          scenario: "status_quo",     label: "Succession signal" },
  { keywords: ["irgc", "revolutionary guard", "state of emergency", "martial law", "military control"],      scenario: "military_junta", label: "Military takeover signal" },
  { keywords: ["larijani", "ceasefire", "negotiat", "council", "prisoner release", "reform"],                scenario: "reform",         label: "Reform / de-escalation signal" },
  { keywords: ["pahlavi", "provisional government", "regime change", "collapse", "overthrow", "uprising"],   scenario: "collapse",       label: "Regime collapse signal" },
  { keywords: ["oil strike", "kharg", "refinery strike", "bazaar close", "rial crash", "hormuz"],            scenario: "collapse",       label: "Economic trigger signal" },
  { keywords: ["protest", "demonstration", "tehran street", "mashhad", "tabriz"],                            scenario: "collapse",       label: "Civil unrest signal" },
  { keywords: ["starlink", "humanitarian corridor", "us recognition", "state department", "sanctions lift"], scenario: "collapse",       label: "US intervention signal" },
  { keywords: ["mojtaba", "khamenei son", "hereditary"],                                                     scenario: "military_junta", label: "Hardline succession signal" },
  { keywords: ["airstrike iran", "bombing iran", "strike iran", "iran missile", "iran war"],                 scenario: "military_junta", label: "Kinetic escalation signal" },
];

function classifyHeadline(text) {
  const lower = text.toLowerCase();
  for (const rule of KEYWORD_MAP) {
    if (rule.keywords.some(k => lower.includes(k))) return rule;
  }
  return null;
}

// ─── RSS SOURCES ──────────────────────────────────────────────────────────────
const RSS_SOURCES = [
  { id: "aljazeera", name: "Al Jazeera",         color: "#c8a84b", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { id: "bbc",       name: "BBC Middle East",    color: "#bb1919", url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml" },
  { id: "reuters",   name: "Reuters World",      color: "#ff6600", url: "https://feeds.reuters.com/reuters/worldNews" },
  { id: "iranintl",  name: "Iran International", color: "#7b5ea7", url: "https://www.iranintl.com/en/rss" },
];
const CORS_PROXY = "https://api.allorigins.win/get?url=";

// ─── LEADERS ──────────────────────────────────────────────────────────────────
const LEADERS = [
  { id: "mojtaba",  name: "Mojtaba Khamenei",  role: "Son of late Supreme Leader",                 scenario: "military_junta", color: "#e74c3c", trajectory: "Hardline Survival",     powerBase: "IRGC & Basij networks cultivated over 20 years",                       strategy: "Hereditary theocracy — clerical shell with military governance",          risk: "CRITICAL — accelerates civil war; violates anti-monarchical founding principles", signal: "Named to any formal leadership role by IRGC or AoE" },
  { id: "pahlavi",  name: "Reza Pahlavi",       role: "Exiled son of last Shah",                    scenario: "collapse",       color: "#2ecc71", trajectory: "Total Regime Change",   powerBase: "Iranian diaspora + domestic nostalgia; National Council of Iran",        strategy: "Positions as unifier for secular democratic transition, not ruling king",  risk: "MODERATE — requires sustained US backing and street momentum",                signal: "US State Dept or EU Parliament invite for formal consultations" },
  { id: "larijani", name: "Ali Larijani",        role: "Sec-Gen, Supreme National Security Council", scenario: "reform",         color: "#3498db", trajectory: "Managed De-escalation", powerBase: "IRGC background + diplomatic reputation; bridges hardliners and West",   strategy: "National Salvation Council — concessions to end bombing, preserve state",  risk: "LOW-MODERATE — requires regime consensus that pure force has failed",          signal: "IRIB features him prominently or he meets Artesh leadership publicly" },
];

// ─── MILITARY ─────────────────────────────────────────────────────────────────
const MILITARY_UNITS = [
  { region: "Tehran",    unit: "65th Airborne Special Forces", branch: "Artesh", significance: "Elite unit; neutrality statement = regime imminent fall" },
  { region: "Tehran",    unit: "16th Armored Division",        branch: "Artesh", significance: "Controls main capital arteries" },
  { region: "Tehran",    unit: "Mohammad Rasool-ollah Corps",  branch: "IRGC",   significance: "Primary IRGC unit for capital security" },
  { region: "Tabriz",    unit: "21st Infantry Division",       branch: "Artesh", significance: "Azeri ethnic faction — defection triggers regional revolt" },
  { region: "Mashhad",   unit: "77th Infantry Division",       branch: "Artesh", significance: "Guards holiest city — defection destroys religious legitimacy" },
  { region: "Air Force", unit: "IRIAF (All Bases)",            branch: "Artesh", significance: "Air Force historically first to defect (1979 precedent)" },
  { region: "National",  unit: "Basij Paramilitary",           branch: "IRGC",   significance: "Street fighters / neighborhood checkpoints" },
  { region: "Foreign",   unit: "Quds Force",                   branch: "IRGC",   significance: "Recall from Syria/Iraq = cannibalising foreign influence" },
];

// ─── ECONOMIC ─────────────────────────────────────────────────────────────────
const ECON_TRIGGERS = [
  { id: "partial_strike",  label: "Partial Oil Sector Strike",                   color: "#f5a623", collapseAdd: 2, desc: "Council for Oil Contract Workers announces action at major sites" },
  { id: "kharg_halt",      label: "Kharg Island Tanker Loading Halted",          color: "#e67e22", collapseAdd: 4, desc: "90% of crude exports stopped — confirm via Kpler satellite" },
  { id: "south_pars",      label: "South Pars Gas Field Halt",                   color: "#e67e22", collapseAdd: 3, desc: "Critical gas infrastructure production ceases" },
  { id: "bazaar_closed",   label: "Tehran Grand Bazaar Closed Indefinitely",     color: "#e74c3c", collapseAdd: 3, desc: "Merchant class abandons regime — historical parallel to 1979" },
  { id: "rial_spike",      label: "Rial Black Market Spike >20% in One Day",    color: "#e74c3c", collapseAdd: 3, desc: "Monitor: bonbast.com — soldier purchasing power collapse" },
  { id: "general_strike",  label: "General Strike (Oil + Bazaar + Utilities)",   color: "#c0392b", collapseAdd: 6, desc: "Total state paralysis — defection expected within 7-14 days" },
  { id: "utility_strike",  label: "Utility Workers Strike / Political Blackouts",color: "#e74c3c", collapseAdd: 2, desc: "Surveillance infrastructure collapse begins" },
];

const ECON_THRESHOLDS = [
  { label: "Partial Oil Strike",          probability: 30, color: "#f5a623", desc: "Reduced revenue; military pay over civil services prioritised" },
  { label: "Kharg Island Total Halt",     probability: 70, color: "#e67e22", desc: "Regime loses 90% export cash; military pay threatened" },
  { label: "General Strike (Bazaar+Oil)", probability: 95, color: "#e74c3c", desc: "Total state paralysis; security forces defect within 7-14 days" },
];

// ─── HOOKS ────────────────────────────────────────────────────────────────────
function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try { const s = window.localStorage.getItem(key); return s ? JSON.parse(s) : initial; }
    catch { return initial; }
  });
  useEffect(() => { try { window.localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function GlowBar({ value, max, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ background: "#111", borderRadius: 4, height: 8, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, boxShadow: `0 0 8px ${color}`, transition: "width 0.5s ease", borderRadius: 4 }} />
    </div>
  );
}

function ProbabilityRing({ value, color, label }) {
  const r = 38, c = 2 * Math.PI * r, dash = (Math.min(100, value) / 100) * c;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={100} height={100} viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={r} fill="none" stroke="#222" strokeWidth={8} />
        <circle cx={50} cy={50} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round" transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dasharray 0.6s ease", filter: `drop-shadow(0 0 6px ${color})` }} />
        <text x={50} y={54} textAnchor="middle" fill={color}
          style={{ fontSize: 18, fontFamily: "'Courier New', monospace", fontWeight: 700 }}>
          {Math.round(value)}%
        </text>
      </svg>
      <span style={{ fontSize: 10, color: "#aaa", textAlign: "center", maxWidth: 90, fontFamily: "monospace" }}>{label}</span>
    </div>
  );
}

function Timestamp() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return <span style={{ fontFamily: "monospace", color: "#0f0", fontSize: 12 }}>{t.toUTCString()}</span>;
}

function dirColor(d) {
  if (d === "up")      return "#2ecc71";
  if (d === "down")    return "#e74c3c";
  if (d === "neutral") return "#f5a623";
  return "#3498db";
}

// ─── MARKET PRICE CARD ────────────────────────────────────────────────────────
function MarketImpactCard({ asset, mdata, scenarioColor, livePrice, scenarioProb }) {
  const bl = livePrice || BASELINE[asset].value;
  const isBps = mdata.isBps;
  const dc = dirColor(mdata.direction);

  const midLevel  = isBps ? bl + mdata.pct_mid / 100  : bl * (1 + mdata.pct_mid  / 100);
  const lowLevel  = isBps ? bl + mdata.pct_low / 100  : bl * (1 + mdata.pct_low  / 100);
  const highLevel = isBps ? bl + mdata.pct_high / 100 : bl * (1 + mdata.pct_high / 100);

  const midFmt  = BASELINE[asset].fmt(midLevel);
  const lowFmt  = BASELINE[asset].fmt(Math.min(lowLevel, highLevel));
  const highFmt = BASELINE[asset].fmt(Math.max(lowLevel, highLevel));

  const midStr  = isBps
    ? `${mdata.pct_mid > 0 ? "+" : ""}${mdata.pct_mid}bps`
    : `${mdata.pct_mid > 0 ? "+" : ""}${mdata.pct_mid.toFixed(1)}%`;

  return (
    <div style={{ background: "#0d0d0d", border: `1px solid ${dc}33`, borderRadius: 5, padding: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "#666", fontSize: 10, letterSpacing: 1 }}>{BASELINE[asset].label}</span>
        <span style={{ color: dc, fontSize: 18, fontWeight: 700, fontFamily: "monospace" }}>{midStr}</span>
      </div>

      {/* Central estimate with CI bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ color: dc, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
          Target: {midFmt}
          <span style={{ color: "#444", fontWeight: 400, marginLeft: 6, fontSize: 10 }}>
            ({BASELINE[asset].fmt(bl)} baseline)
          </span>
        </div>

        {/* CI visualisation bar */}
        <div style={{ position: "relative", height: 20, background: "#111", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
          {/* full range */}
          <div style={{
            position: "absolute",
            left: `${Math.min(50, 50 + Math.min(mdata.pct_low, mdata.pct_high) * 2)}%`,
            width: `${Math.abs(mdata.pct_high - mdata.pct_low) * 2}%`,
            height: "100%",
            background: `${dc}33`,
            borderRadius: 2,
          }} />
          {/* central marker */}
          <div style={{
            position: "absolute",
            left: `${50 + mdata.pct_mid * 2}%`,
            width: 2,
            height: "100%",
            background: dc,
            boxShadow: `0 0 4px ${dc}`,
          }} />
          {/* zero line */}
          <div style={{ position: "absolute", left: "50%", width: 1, height: "100%", background: "#333" }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#555" }}>
          <span>Bear: {lowFmt} ({mdata.ci_label.split(" to ")[0]})</span>
          <span>Bull: {highFmt}</span>
        </div>
      </div>

      {/* Timeframe + rationale */}
      <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 6, marginTop: 4 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ color: "#f5a623", fontSize: 9, background: "#f5a62318", border: "1px solid #f5a62333", padding: "1px 6px", borderRadius: 2 }}>
            {mdata.timeframe}D WINDOW
          </span>
          <span style={{ color: "#555", fontSize: 9, background: "#1a1a1a", padding: "1px 6px", borderRadius: 2 }}>
            90% CI: {mdata.ci_label}
          </span>
        </div>
        <div style={{ color: "#666", fontSize: 10, lineHeight: 1.4 }}>{mdata.rationale}</div>
      </div>
    </div>
  );
}

// ─── LIVE PRICE TICKER ────────────────────────────────────────────────────────
function LivePriceTicker({ prices, loading, lastFetched, onRefresh }) {
  const assets = ["spx", "brent", "ust5y", "dxy"];
  return (
    <div style={{ background: "#060a06", border: "1px solid #0f03", borderRadius: 6, padding: "10px 16px", marginBottom: 12, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
      <span style={{ color: "#0f0", fontSize: 10, letterSpacing: 2, flexShrink: 0 }}>LIVE PRICES</span>
      {assets.map(a => {
        const live = prices[a];
        const base = BASELINE[a].value;
        const chg  = live ? ((live - base) / base * 100) : null;
        const isUp = chg > 0;
        return (
          <div key={a} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 90 }}>
            <span style={{ color: "#555", fontSize: 9, letterSpacing: 1 }}>{BASELINE[a].label.toUpperCase()}</span>
            <span style={{ color: live ? (isUp ? "#2ecc71" : "#e74c3c") : "#444", fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>
              {live ? BASELINE[a].fmt(live) : BASELINE[a].fmt(base)}
              {loading && !live && <span style={{ color: "#333", marginLeft: 4 }}>...</span>}
            </span>
            {chg !== null && (
              <span style={{ color: isUp ? "#2ecc71" : "#e74c3c", fontSize: 9 }}>
                {isUp ? "+" : ""}{chg.toFixed(2)}% vs baseline
              </span>
            )}
            {!live && !loading && (
              <span style={{ color: "#333", fontSize: 9 }}>baseline</span>
            )}
          </div>
        );
      })}
      <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <button onClick={onRefresh} disabled={loading}
          style={{ background: "transparent", border: "1px solid #0f04", color: "#0f0", padding: "3px 8px", borderRadius: 3, fontSize: 9, cursor: "pointer", fontFamily: "monospace" }}>
          {loading ? "FETCHING..." : "UPDATE PRICES"}
        </button>
        {lastFetched && <span style={{ color: "#333", fontSize: 9 }}>fetched {lastFetched.toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}

const card = { background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 6, padding: 16, marginBottom: 12 };
const TABS = ["dashboard", "markets", "live feed", "indicators", "leaders", "military", "economic", "notes"];

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [checked,      setChecked]      = useLocalStorage("iran_tmd_indicators", {});
  const [militaryRisk, setMilitaryRisk] = useLocalStorage("iran_tmd_military",   {});
  const [econTriggers, setEconTriggers] = useLocalStorage("iran_tmd_econ",       {});
  const [notes,        setNotes]        = useLocalStorage("iran_tmd_notes",       "");
  const [lastUpdate,   setLastUpdate]   = useLocalStorage("iran_tmd_lastupdate",  null);

  const [activeTab,      setActiveTab]      = useState("dashboard");
  const [feedItems,      setFeedItems]      = useState([]);
  const [feedLoading,    setFeedLoading]    = useState(false);
  const [feedError,      setFeedError]      = useState(null);
  const [lastFetch,      setLastFetch]      = useState(null);
  const [feedFilter,     setFeedFilter]     = useState("all");
  const [livePrices,     setLivePrices]     = useState({});
  const [priceLoading,   setPriceLoading]   = useState(false);
  const [priceFetched,   setPriceFetched]   = useState(null);

  // ── Live price fetch via Yahoo Finance query API ──────────────────────────
  const fetchPrices = useCallback(async () => {
    setPriceLoading(true);
    const results = {};
    const symbolMap = { spx: "^GSPC", brent: "BZ=F", ust5y: "^FVX", dxy: "DX-Y.NYB" };
    await Promise.allSettled(Object.entries(symbolMap).map(async ([asset, sym]) => {
      try {
        const url = `${CORS_PROXY}${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`)}`;
        const res  = await fetch(url);
        const json = await res.json();
        const body = JSON.parse(json.contents);
        const price = body?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price) results[asset] = price;
      } catch {}
    }));
    if (Object.keys(results).length > 0) {
      setLivePrices(results);
      setPriceFetched(new Date());
    }
    setPriceLoading(false);
  }, []);

  useEffect(() => { fetchPrices(); }, [fetchPrices]);

  // ── RSS feed fetch ────────────────────────────────────────────────────────
  const fetchFeeds = useCallback(async () => {
    setFeedLoading(true);
    setFeedError(null);
    const results = [];
    await Promise.allSettled(RSS_SOURCES.map(async (src) => {
      try {
        const res  = await fetch(`${CORS_PROXY}${encodeURIComponent(src.url)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const doc  = new DOMParser().parseFromString(json.contents, "text/xml");
        Array.from(doc.querySelectorAll("item")).slice(0, 20).forEach(item => {
          const title   = item.querySelector("title")?.textContent?.trim() || "";
          const link    = item.querySelector("link")?.textContent?.trim() || item.querySelector("guid")?.textContent?.trim() || "#";
          const pubDate = item.querySelector("pubDate")?.textContent?.trim() || "";
          results.push({ id: `${src.id}-${link}`, title, link, date: pubDate ? new Date(pubDate) : new Date(), source: src, classification: classifyHeadline(title) });
        });
      } catch (err) { console.warn(`${src.name} failed:`, err.message); }
    }));
    const seen = new Set();
    const deduped = results
      .filter(r => { if (seen.has(r.title)) return false; seen.add(r.title); return true; })
      .sort((a, b) => b.date - a.date);
    setFeedItems(deduped);
    setLastFetch(new Date());
    setFeedLoading(false);
    if (deduped.length === 0) setFeedError("No feed data returned. The CORS proxy may be temporarily unavailable — try refreshing in a minute.");
  }, []);

  useEffect(() => { if (activeTab === "live feed") fetchFeeds(); }, [activeTab, fetchFeeds]);
  useEffect(() => {
    if (activeTab !== "live feed") return;
    const id = setInterval(fetchFeeds, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [activeTab, fetchFeeds]);

  // ── Scores ────────────────────────────────────────────────────────────────
  const scores = {};
  SCENARIOS.forEach(s => { scores[s.id] = s.baseScore; });
  ALL_INDICATORS.forEach(ind => { if (checked[ind.id]) scores[ind.scenario] = (scores[ind.scenario] || 0) + ind.weight; });
  Object.entries(militaryRisk).forEach(([unit, state]) => {
    const u = MILITARY_UNITS.find(m => m.unit === unit); if (!u) return;
    if (state === "concerning") { u.branch === "Artesh" ? scores.collapse++ : scores.military_junta++; }
    if (state === "defected")   { u.branch === "Artesh" ? scores.collapse += 3 : scores.military_junta += 2; }
  });
  ECON_TRIGGERS.forEach(t => { if (econTriggers[t.id]) scores.collapse = (scores.collapse || 0) + t.collapseAdd; });

  const totalScore    = Object.values(scores).reduce((a, b) => a + b, 0);
  const probabilities = {};
  SCENARIOS.forEach(s => { probabilities[s.id] = Math.round((scores[s.id] / totalScore) * 100); });
  const leading = SCENARIOS.reduce((a, b) => probabilities[a.id] > probabilities[b.id] ? a : b);

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const flaggedCount = feedItems.filter(i => i.classification).length;

  function toggleIndicator(id) { setChecked(p => { const n = {...p, [id]: !p[id]}; setLastUpdate(new Date().toISOString()); return n; }); }
  function toggleMilitary(unit) { setMilitaryRisk(p => { const s = ["nominal","concerning","defected"], c = p[unit]||"nominal"; return {...p, [unit]: s[(s.indexOf(c)+1)%3]}; }); }
  function toggleEcon(id) { setEconTriggers(p => ({...p, [id]: !p[id]})); }

  const tabStyle = t => ({
    padding: "8px 14px", cursor: "pointer", fontFamily: "monospace", fontSize: 11,
    letterSpacing: 1, textTransform: "uppercase", border: "none", whiteSpace: "nowrap",
    background: activeTab === t ? "#0f0" : "transparent",
    color:      activeTab === t ? "#000" : "#0f0",
    borderBottom: activeTab === t ? "none" : "1px solid #0f0",
    transition: "all 0.2s",
  });

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#050505", color: "#ccc", minHeight: "100vh", fontFamily: "'Courier New', monospace", fontSize: 13 }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #0f0", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ color: "#0f0", fontSize: 18, fontWeight: 700, letterSpacing: 3 }}>IRAN TMF</div>
          <div style={{ color: "#555", fontSize: 10, letterSpacing: 2 }}>TRANSITION MONITORING FRAMEWORK · OSINT SIMULATION · <span style={{ color: "#0f06" }}>v1.4</span></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <Timestamp />
          <div style={{ color: "#555", fontSize: 10 }}>
            {checkedCount}/{ALL_INDICATORS.length} indicators · updated {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : "--"}
          </div>
        </div>
      </div>

      {/* Alert banner */}
      <div style={{ background: `${leading.color}18`, borderBottom: `1px solid ${leading.color}44`, padding: "8px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: leading.color, boxShadow: `0 0 10px ${leading.color}`, animation: "pulse 1.5s infinite", flexShrink: 0 }} />
        <span style={{ color: leading.color, fontWeight: 700, letterSpacing: 1 }}>LEADING: {leading.label.toUpperCase()}</span>
        <span style={{ color: "#666", marginLeft: "auto" }}>{probabilities[leading.id]}% probability</span>
        {flaggedCount > 0 && <span style={{ color: "#e74c3c", fontSize: 10, border: "1px solid #e74c3c44", padding: "2px 8px", borderRadius: 3 }}>⚡ {flaggedCount} signals in feed</span>}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #0f0", overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>
            {t === "live feed" && flaggedCount > 0 ? `live feed (${flaggedCount})` : t}
          </button>
        ))}
      </div>

      <div style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>

        {/* ══ DASHBOARD ══ */}
        {activeTab === "dashboard" && (
          <div>
            <LivePriceTicker prices={livePrices} loading={priceLoading} lastFetched={priceFetched} onRefresh={fetchPrices} />
            <div style={card}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 16 }}>SCENARIO PROBABILITY MATRIX</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 16, justifyItems: "center" }}>
                {SCENARIOS.map(s => <ProbabilityRing key={s.id} value={probabilities[s.id]} color={s.color} label={s.label} />)}
              </div>
            </div>
            <div style={card}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>WEIGHTED SIGNAL SCORES</div>
              {SCENARIOS.map(s => (
                <div key={s.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: s.color }}>{s.label}</span>
                    <span style={{ color: "#666" }}>score: {scores[s.id]}</span>
                  </div>
                  <GlowBar value={scores[s.id]} max={Math.max(...Object.values(scores))} color={s.color} />
                  <div style={{ color: "#444", fontSize: 10, marginTop: 3 }}>{s.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 12 }}>
              {[
                { label: "Security",      items: INDICATORS.security,      color: "#e74c3c" },
                { label: "Institutional", items: INDICATORS.institutional, color: "#f5a623" },
                { label: "External",      items: INDICATORS.external,      color: "#3498db" },
                { label: "Economic",      items: INDICATORS.economic,      color: "#2ecc71" },
              ].map(b => (
                <div key={b.label} style={{ ...card, marginBottom: 0 }}>
                  <div style={{ color: b.color, fontSize: 20, fontWeight: 700 }}>{b.items.filter(i => checked[i.id]).length}/{b.items.length}</div>
                  <div style={{ color: "#666", fontSize: 10, letterSpacing: 1 }}>{b.label.toUpperCase()} SIGNALS</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ MARKETS ══ */}
        {activeTab === "markets" && (
          <div>
            <LivePriceTicker prices={livePrices} loading={priceLoading} lastFetched={priceFetched} onRefresh={fetchPrices} />

            {/* Baseline table */}
            <div style={{ ...card, background: "#05080a", borderColor: "#0f03" }}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>BASELINE PRICES — FEB 28 2026 CLOSE</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                {Object.entries(BASELINE).map(([asset, b]) => {
                  const live = livePrices[asset];
                  const chg  = live ? ((live - b.value) / b.value * 100) : null;
                  const isUp = chg > 0;
                  return (
                    <div key={asset} style={{ background: "#080808", border: "1px solid #1a1a1a", borderRadius: 4, padding: "10px 12px" }}>
                      <div style={{ color: "#555", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>{b.label.toUpperCase()}</div>
                      <div style={{ color: "#aaa", fontSize: 11, marginBottom: 2 }}>Baseline: <span style={{ color: "#fff", fontFamily: "monospace" }}>{b.fmt(b.value)}</span></div>
                      {live && (
                        <div style={{ color: isUp ? "#2ecc71" : "#e74c3c", fontSize: 11 }}>
                          Live: <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{b.fmt(live)}</span>
                          <span style={{ fontSize: 9, marginLeft: 6 }}>({isUp ? "+" : ""}{chg.toFixed(2)}%)</span>
                        </div>
                      )}
                      {!live && <div style={{ color: "#333", fontSize: 10 }}>Live price loading...</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{ color: "#333", fontSize: 10, marginTop: 10 }}>
                All impact estimates calculated from Feb 28 close. Live prices update when markets are open. Click UPDATE PRICES to refresh manually.
              </div>
            </div>

            {/* Per-scenario impact cards */}
            {SCENARIOS.map(s => (
              <div key={s.id} style={{ ...card, borderLeft: `3px solid ${s.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                  <div>
                    <div style={{ color: s.color, fontSize: 15, fontWeight: 700 }}>{s.label}</div>
                    <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>{s.desc}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: s.color, fontSize: 24, fontWeight: 700, fontFamily: "monospace" }}>{probabilities[s.id]}%</div>
                      <div style={{ color: "#444", fontSize: 10 }}>probability</div>
                    </div>
                    <svg viewBox="0 0 50 50" width={44} height={44}>
                      <circle cx={25} cy={25} r={20} fill="none" stroke="#222" strokeWidth={5} />
                      <circle cx={25} cy={25} r={20} fill="none" stroke={s.color} strokeWidth={5}
                        strokeDasharray={`${(probabilities[s.id]/100)*(2*Math.PI*20)} ${2*Math.PI*20}`}
                        strokeLinecap="round" transform="rotate(-90 25 25)"
                        style={{ filter: `drop-shadow(0 0 3px ${s.color})` }} />
                    </svg>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
                  {Object.entries(s.markets).map(([asset, mdata]) => (
                    <MarketImpactCard key={asset} asset={asset} mdata={mdata} scenarioColor={s.color} livePrice={livePrices[asset]} scenarioProb={probabilities[s.id]} />
                  ))}
                </div>
              </div>
            ))}

            {/* Prob-weighted summary */}
            <div style={card}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>PROBABILITY-WEIGHTED EXPECTED MOVE (7-DAY OUTLOOK)</div>
              <div style={{ color: "#555", fontSize: 11, marginBottom: 12 }}>
                Weighted average of central estimates across all scenarios, adjusted for current probability scores.
              </div>
              {Object.keys(BASELINE).map(asset => {
                const isBps = SCENARIOS[0].markets[asset].isBps;
                const weightedMid = SCENARIOS.reduce((sum, s) => sum + (s.markets[asset].pct_mid * probabilities[s.id] / 100), 0);
                const weightedLow = SCENARIOS.reduce((sum, s) => sum + (s.markets[asset].pct_low  * probabilities[s.id] / 100), 0);
                const weightedHigh= SCENARIOS.reduce((sum, s) => sum + (s.markets[asset].pct_high * probabilities[s.id] / 100), 0);
                const base = livePrices[asset] || BASELINE[asset].value;
                const midLevel  = isBps ? base + weightedMid / 100  : base * (1 + weightedMid  / 100);
                const dc = weightedMid > 1 ? "#2ecc71" : weightedMid < -1 ? "#e74c3c" : "#f5a623";
                const midStr = isBps
                  ? `${weightedMid > 0 ? "+" : ""}${weightedMid.toFixed(1)}bps`
                  : `${weightedMid > 0 ? "+" : ""}${weightedMid.toFixed(1)}%`;
                const ciStr = isBps
                  ? `${weightedLow.toFixed(0)} to ${weightedHigh.toFixed(0)}bps`
                  : `${weightedLow.toFixed(1)}% to ${weightedHigh.toFixed(1)}%`;
                return (
                  <div key={asset} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #111", flexWrap: "wrap" }}>
                    <div style={{ width: 150 }}>
                      <div style={{ color: "#aaa", fontSize: 12 }}>{BASELINE[asset].label}</div>
                      <div style={{ color: "#555", fontSize: 10 }}>{BASELINE[asset].fmt(base)} baseline</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ color: dc, fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>{midStr}</span>
                        <span style={{ color: dc, fontSize: 11 }}>→ {BASELINE[asset].fmt(midLevel)}</span>
                        <span style={{ color: "#444", fontSize: 10, background: "#1a1a1a", padding: "2px 6px", borderRadius: 3 }}>90% CI: {ciStr}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div style={{ color: "#2a2a2a", fontSize: 10, marginTop: 10 }}>
                For analytical purposes only. Not financial advice. Confidence intervals based on historical geopolitical shock analogues.
              </div>
            </div>
          </div>
        )}

        {/* ══ LIVE FEED ══ */}
        {activeTab === "live feed" && (
          <div>
            <div style={{ ...card, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <span style={{ color: "#0f0", fontSize: 11, letterSpacing: 2 }}>SOURCES</span>
              {RSS_SOURCES.map(s => (
                <span key={s.id} style={{ background: `${s.color}22`, border: `1px solid ${s.color}44`, color: s.color, padding: "3px 10px", borderRadius: 3, fontSize: 10 }}>{s.name}</span>
              ))}
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button onClick={() => setFeedFilter(f => f === "all" ? "flagged" : "all")}
                  style={{ background: feedFilter === "flagged" ? "#e74c3c22" : "transparent", border: `1px solid ${feedFilter === "flagged" ? "#e74c3c" : "#333"}`, color: feedFilter === "flagged" ? "#e74c3c" : "#666", padding: "4px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "monospace" }}>
                  {feedFilter === "flagged" ? "SIGNALS ONLY" : "ALL ITEMS"}
                </button>
                <button onClick={fetchFeeds} disabled={feedLoading}
                  style={{ background: "transparent", border: "1px solid #0f04", color: "#0f0", padding: "4px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "monospace" }}>
                  {feedLoading ? "FETCHING..." : "REFRESH"}
                </button>
              </div>
            </div>
            {lastFetch && <div style={{ color: "#444", fontSize: 10, marginBottom: 8, textAlign: "right" }}>Last fetched {lastFetch.toLocaleTimeString()} · auto-refreshes every 5 min</div>}
            <div style={card}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>LIVE MAP & OSINT SOURCES</div>
              <div style={{ color: "#555", fontSize: 11, marginBottom: 14 }}>These sources block embedding — open alongside this dashboard in a separate tab.</div>
              {[
                { name: "Iran LiveUAMap",         url: "https://iran.liveuamap.com",                    color: "#2ecc71", desc: "Geolocated real-time conflict events across Iran" },
                { name: "NetBlocks",              url: "https://netblocks.org",                         color: "#3498db", desc: "Internet shutdown & connectivity monitoring" },
                { name: "Kpler Tanker Tracking",  url: "https://www.kpler.com",                         color: "#f5a623", desc: "Real-time tanker movements — confirm Kharg Island halt" },
                { name: "Bonbast (Rial rate)",    url: "https://www.bonbast.com",                       color: "#e74c3c", desc: "Iranian Rial black market exchange rate" },
                { name: "ISW Iran Updates",       url: "https://www.understandingwar.org/regions/iran", color: "#9b59b6", desc: "Daily control-of-terrain & regime stability analysis" },
                { name: "Critical Threats / CTP", url: "https://www.criticalthreats.org/topics/iran",  color: "#e67e22", desc: "CTP-ISW Iran regime instability indicators" },
                { name: "ACLED Conflict Data",    url: "https://acleddata.com/dashboard",              color: "#3498db", desc: "Armed conflict location & event data" },
                { name: "Iran International",     url: "https://www.iranintl.com/en",                  color: "#7b5ea7", desc: "Farsi & English breaking news from inside Iran" },
              ].map(src => (
                <a key={src.name} href={src.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #111", textDecoration: "none" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: src.color, boxShadow: `0 0 6px ${src.color}`, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: src.color, fontWeight: 700, fontSize: 12 }}>{src.name}</div>
                    <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>{src.desc}</div>
                  </div>
                  <div style={{ color: "#333", fontSize: 11 }}>-&gt;</div>
                </a>
              ))}
            </div>
            {feedLoading && <div style={{ color: "#0f0", textAlign: "center", padding: 40, letterSpacing: 2, animation: "pulse 1s infinite" }}>FETCHING INTELLIGENCE FEEDS...</div>}
            {feedError && !feedLoading && <div style={{ ...card, borderColor: "#e74c3c44", color: "#e74c3c" }}>⚠ {feedError}</div>}
            {!feedLoading && feedItems.length === 0 && !feedError && <div style={{ color: "#555", textAlign: "center", padding: 40 }}>No items yet — click REFRESH above.</div>}
            {!feedLoading && feedItems
              .filter(item => feedFilter === "flagged" ? item.classification : true)
              .map(item => {
                const sc = item.classification ? SCENARIOS.find(s => s.id === item.classification.scenario) : null;
                return (
                  <div key={item.id} style={{ ...card, borderLeft: `3px solid ${sc ? sc.color : "#1a1a1a"}`, background: sc ? `${sc.color}08` : "#0a0a0a", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                      <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: sc ? "#fff" : "#aaa", textDecoration: "none", flex: 1, lineHeight: 1.5, fontSize: 13 }}>{item.title}</a>
                      <span style={{ color: item.source.color, fontSize: 10, background: `${item.source.color}18`, border: `1px solid ${item.source.color}33`, padding: "2px 6px", borderRadius: 2, flexShrink: 0 }}>{item.source.name}</span>
                    </div>
                    <div style={{ display: "flex", gap: 12, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ color: "#444", fontSize: 10 }}>{item.date.toLocaleString()}</span>
                      {sc && <span style={{ color: sc.color, fontSize: 10, background: `${sc.color}18`, border: `1px solid ${sc.color}44`, padding: "2px 8px", borderRadius: 3 }}>⚡ {item.classification.label} → {sc.label}</span>}
                    </div>
                  </div>
                );
              })
            }
          </div>
        )}

        {/* ══ INDICATORS ══ */}
        {activeTab === "indicators" && (
          <div>
            {Object.entries(INDICATORS).map(([bucket, inds]) => (
              <div key={bucket} style={card}>
                <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12, textTransform: "uppercase" }}>{bucket} indicators</div>
                {inds.map(ind => {
                  const sc = SCENARIOS.find(s => s.id === ind.scenario);
                  return (
                    <div key={ind.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "8px 0", borderBottom: "1px solid #111", cursor: "pointer", opacity: checked[ind.id] ? 1 : 0.5 }} onClick={() => toggleIndicator(ind.id)}>
                      <div style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${sc?.color}`, background: checked[ind.id] ? sc?.color : "transparent", flexShrink: 0, marginTop: 1, boxShadow: checked[ind.id] ? `0 0 6px ${sc?.color}` : "none", transition: "all 0.2s" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ color: checked[ind.id] ? "#fff" : "#888" }}>{ind.label}</div>
                        <div style={{ display: "flex", gap: 12, marginTop: 3 }}>
                          <span style={{ color: sc?.color, fontSize: 10 }}>{sc?.label}</span>
                          <span style={{ color: "#444", fontSize: 10 }}>weight: +{ind.weight}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* ══ LEADERS ══ */}
        {activeTab === "leaders" && (
          <div>
            {LEADERS.map(l => (
              <div key={l.id} style={{ ...card, borderLeft: `3px solid ${l.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ color: l.color, fontSize: 16, fontWeight: 700 }}>{l.name}</div>
                    <div style={{ color: "#666", fontSize: 11 }}>{l.role}</div>
                  </div>
                  <div style={{ background: `${l.color}22`, border: `1px solid ${l.color}44`, padding: "4px 10px", borderRadius: 3, fontSize: 10, color: l.color }}>{l.trajectory.toUpperCase()}</div>
                </div>
                <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                  {[["POWER BASE", l.powerBase], ["STRATEGY", l.strategy], ["RISK", l.risk]].map(([k, v]) => (
                    <div key={k}><div style={{ color: "#555", fontSize: 10, letterSpacing: 1 }}>{k}</div><div style={{ color: "#bbb", marginTop: 2 }}>{v}</div></div>
                  ))}
                  <div style={{ background: "#0a200a", border: "1px solid #0f04", borderRadius: 4, padding: "8px 12px", marginTop: 4 }}>
                    <span style={{ color: "#0f0", fontSize: 10 }}>SIGNAL: </span>
                    <span style={{ color: "#8f8" }}>{l.signal}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#555" }}>Scenario probability: <span style={{ color: l.color, fontWeight: 700 }}>{probabilities[l.scenario]}%</span></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ MILITARY ══ */}
        {activeTab === "military" && (
          <div>
            <div style={{ ...card, background: "#0a0500", borderColor: "#333" }}>
              <div style={{ color: "#f5a623", fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>DEFECTION THRESHOLD GUIDE</div>
              <div style={{ color: "#888", fontSize: 12 }}>
                Artesh defections → <span style={{ color: "#2ecc71" }}>Regime Collapse +3</span> · IRGC fractures → <span style={{ color: "#e74c3c" }}>Military Junta +2</span><br />
                Click a unit to cycle: NOMINAL → CONCERNING → DEFECTED
              </div>
            </div>
            {MILITARY_UNITS.map(u => {
              const state = militaryRisk[u.unit] || "nominal";
              const sc = { nominal: "#555", concerning: "#f5a623", defected: "#e74c3c" };
              const bc = { Artesh: "#3498db", IRGC: "#e74c3c" };
              return (
                <div key={u.unit} style={{ ...card, cursor: "pointer", borderLeft: `3px solid ${sc[state]}`, opacity: state === "nominal" ? 0.6 : 1, transition: "all 0.2s" }} onClick={() => toggleMilitary(u.unit)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div><div style={{ color: "#ccc" }}>{u.unit}</div><div style={{ color: "#666", fontSize: 11 }}>{u.region}</div></div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ background: `${bc[u.branch]}22`, border: `1px solid ${bc[u.branch]}44`, color: bc[u.branch], padding: "2px 8px", borderRadius: 3, fontSize: 10 }}>{u.branch}</span>
                      <span style={{ background: `${sc[state]}22`, border: `1px solid ${sc[state]}`, color: sc[state], padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 700, boxShadow: state !== "nominal" ? `0 0 8px ${sc[state]}` : "none" }}>{state.toUpperCase()}</span>
                    </div>
                  </div>
                  <div style={{ color: "#555", fontSize: 11, marginTop: 6 }}>{u.significance}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ ECONOMIC ══ */}
        {activeTab === "economic" && (
          <div>
            <div style={card}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>ECONOMIC KILL-SWITCH TRIGGERS</div>
              {ECON_TRIGGERS.map(trigger => (
                <div key={trigger.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderBottom: "1px solid #111", cursor: "pointer" }} onClick={() => toggleEcon(trigger.id)}>
                  <div style={{ width: 18, height: 18, borderRadius: 3, border: `1px solid ${trigger.color}`, background: econTriggers[trigger.id] ? trigger.color : "transparent", boxShadow: econTriggers[trigger.id] ? `0 0 8px ${trigger.color}` : "none", flexShrink: 0, marginTop: 2, transition: "all 0.2s" }} />
                  <div>
                    <div style={{ color: econTriggers[trigger.id] ? "#fff" : "#888" }}>{trigger.label}</div>
                    <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>{trigger.desc}</div>
                    <div style={{ color: trigger.color, fontSize: 10, marginTop: 3 }}>Collapse score +{trigger.collapseAdd}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={card}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>COLLAPSE PROBABILITY BY ECONOMIC STATE</div>
              {ECON_THRESHOLDS.map(t => (
                <div key={t.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: t.color }}>{t.label}</span>
                    <span style={{ color: t.color, fontWeight: 700 }}>{t.probability}%</span>
                  </div>
                  <GlowBar value={t.probability} max={100} color={t.color} />
                  <div style={{ color: "#444", fontSize: 11, marginTop: 3 }}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ NOTES ══ */}
        {activeTab === "notes" && (
          <div>
            <div style={card}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>ANALYST NOTES</div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Record observations, source citations, time-stamped intelligence updates..."
                style={{ width: "100%", minHeight: 300, background: "#050505", color: "#0f0", border: "1px solid #0f04", borderRadius: 4, fontFamily: "monospace", fontSize: 12, padding: 12, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={card}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>CURRENT ASSESSMENT SUMMARY</div>
              {SCENARIOS.map(s => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #111", padding: "6px 0" }}>
                  <span style={{ color: s.color }}>{s.label}</span>
                  <span style={{ color: s.color, fontWeight: 700 }}>{probabilities[s.id]}%</span>
                </div>
              ))}
              <div style={{ marginTop: 12, color: "#555", fontSize: 11 }}>
                Active indicators: {checkedCount}/{ALL_INDICATORS.length} · Economic triggers: {Object.values(econTriggers).filter(Boolean).length} · Military alerts: {Object.values(militaryRisk).filter(v => v !== "nominal").length}
              </div>
            </div>
          </div>
        )}

      </div>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#050505}
        ::-webkit-scrollbar-thumb{background:#0f0}
      `}</style>
    </div>
  );
}
