import { useState, useEffect, useCallback, useRef } from "react";

// ─── ASSET METADATA ─────────────────────────────────────────────────────────────────────────────
// eventDay = Feb 28 2026 close, kept as historical reference only.
// All live calculations use livePrices state. eventDay used only as fallback if market closed.
const BASELINE = {
  spx:   { label: "S&P 500",           eventDay: 6878.88, fmt: v => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
  brent: { label: "Brent Crude",       eventDay: 72.87,   fmt: v => `$${v.toFixed(2)}` },
  ust5y: { label: "5Y Treasury Yield", eventDay: 3.512,   fmt: v => `${v.toFixed(3)}%` },
  dxy:   { label: "DXY (USD Index)",   eventDay: 97.65,   fmt: v => v.toFixed(2) },
};

// ─── STATIC SCENARIO DEFINITIONS (colors, labels, base scores) ───────────────
const SCENARIO_DEFS = [
  { id: "status_quo",     label: "Status Quo / Continuity",  color: "#f5a623", desc: "Assembly of Experts names new Supreme Leader within 48hrs", baseScore: 2 },
  { id: "military_junta", label: "Military Junta (IRGC)",    color: "#e74c3c", desc: "IRGC declares State of Emergency; Artesh stays in barracks",  baseScore: 3 },
  { id: "reform",         label: "Controlled Reform",        color: "#3498db", desc: "Appointment of Larijani / Council; release political prisoners", baseScore: 2 },
  { id: "collapse",       label: "Regime Collapse",          color: "#2ecc71", desc: "General-level defections; seizure of state TV by protesters",  baseScore: 1 },
];

// ─── DEFAULT MARKET DATA (used until AI overrides) ───────────────────────────
// ─── DEFAULT MARKET IMPACTS ──────────────────────────────────────────────────
// Calibrated March 28 2026 from CURRENT PRICE LEVELS (not Feb 28 baseline).
// Sources: BlackRock Weekly (Mar 20), Berkshire Edge Gulf War analogue,
//          RBC Wealth Management 20-conflict study, Schwab market update (Mar 28),
//          CBS/AP live market data, Macquarie $200/bbl tail scenario.
//
// KEY CALIBRATION FACTS (as of Mar 28 2026):
//   SPX ~6,368 (-8.7% from Jan ATH, -7% from pre-war). 5th losing week.
//   Brent ~$107 (+$35 war premium vs $72 pre-war). Hit $119.50 peak Mar 8.
//   10Y yield 4.43% (up from 3.97% pre-war). 5Y ~4.07% (up from 3.51%).
//   DXY ~99.9. Mar 23 peace signal: Brent -10% in one session.
//   BlackRock: "S&P 500 just 7% below record, disconnect vs macro shock."
//   Gulf War I analogue: oil peak Oct 90 -> -30.7% then, SPX +11.8%.
//
// All pct values = % move from CURRENT live price over 7-day horizon.
// ust5y values = basis points from current yield (~4.07%).
const DEFAULT_MARKETS = {
  status_quo: {
    // War continues, no new catalyst. Most of the shock already priced.
    // BlackRock disconnect suggests modest additional SPX downside.
    // Brent: war premium in place, slight upward drift on continued uncertainty.
    // Yields: stagflation + war spending keeps upward pressure. No safety bid.
    spx:   { direction: "down",    pct_mid: -1.5,  pct_low: -4.0,  pct_high: +1.0,  timeframe: 7, rationale: "War already priced -8.7% from ATH. BlackRock disconnect = modest further downside. 5th losing week pattern.", ci_label: "-4% to +1%", isBps: false },
    brent: { direction: "up",      pct_mid: +3.0,  pct_low: -3.0,  pct_high: +8.0,  timeframe: 7, rationale: "Hormuz semi-closure sustained. War premium (~$35) largely in. Soft upward bias on continued uncertainty.", ci_label: "-3% to +8%", isBps: false },
    ust5y: { direction: "up",      pct_mid: +8,    pct_low: -5,    pct_high: +18,   timeframe: 7, rationale: "War spending debate, weak Treasury auctions, soft Fed demand. Stagflation premium persists. Up 56bps from pre-war.", ci_label: "-5bps to +18bps", isBps: true },
    dxy:   { direction: "neutral", pct_mid: +0.3,  pct_low: -0.5,  pct_high: +1.2,  timeframe: 5, rationale: "Safe-haven already partially in (+2.3% vs pre-war). Minimal additional move without new catalyst.", ci_label: "-0.5% to +1.2%", isBps: false },
  },
  military_junta: {
    // Houthis activate OR Hormuz fully closed. Incremental shock from already-elevated base.
    // Berkshire Edge Path 3 (7% odds): Brent $125-170 avg, SPX -20-30% from ATH.
    // From current levels that implies SPX -13% to -22% additional.
    // Macquarie: $200/bbl if war to end-June = +87% from $107 current.
    spx:   { direction: "down",  pct_mid: -10.0, pct_low: -6.0,  pct_high: -18.0, timeframe: 7, rationale: "Full Hormuz closure triggers recession pricing. BlackRock disconnect resolves violently. Berkshire Edge -20-30% from ATH.", ci_label: "-6% to -18%", isBps: false },
    brent: { direction: "up",    pct_mid: +22.0, pct_low: +12.0, pct_high: +45.0, timeframe: 7, rationale: "Dual choke: Hormuz + Bab al-Mandab. From $107 -> $130-155 central, $200 Macquarie tail. 21% global oil at risk.", ci_label: "+12% to +45%", isBps: false },
    ust5y: { direction: "down",  pct_mid: -30,   pct_low: -18,   pct_high: -45,   timeframe: 7, rationale: "Flight-to-safety overwhelms stagflation. Fed forced to signal cuts. Gulf War II: 5Y fell 20-25bps in week 1.", ci_label: "-18bps to -45bps", isBps: true },
    dxy:   { direction: "up",    pct_mid: +3.0,  pct_low: +1.5,  pct_high: +5.5,  timeframe: 7, rationale: "Strong safe-haven surge. EM currencies crushed. Consistent with 2003 Iraq, 2019 Aramco precedents.", ci_label: "+1.5% to +5.5%", isBps: false },
  },
  reform: {
    // Ceasefire / Apr 6 Hormuz deal. Largest impact scenario from current levels.
    // Mar 23 peace SIGNAL alone: Brent -10% in one session, SPX +2.5%.
    // Full deal = full war premium unwind. Berkshire Edge Path 1B.
    // Brent back toward $72-85 pre-war range over 7 days.
    spx:   { direction: "up",   pct_mid: +8.0,  pct_low: +4.0,  pct_high: +13.0, timeframe: 7, rationale: "Full war premium unwind. Berkshire Edge Path 1B: oil breaks -> stocks stabilise fast. Gulf War I: SPX +13.6% once oil fell.", ci_label: "+4% to +13%", isBps: false },
    brent: { direction: "down", pct_mid: -25.0, pct_low: -15.0, pct_high: -35.0, timeframe: 7, rationale: "War premium ($35) fully unwinds. Mar 23 signal = -10% in one session. Full deal -> $70-90 pre-war range. Immediate.", ci_label: "-15% to -35%", isBps: false },
    ust5y: { direction: "up",   pct_mid: +20,   pct_low: +10,   pct_high: +35,   timeframe: 7, rationale: "Inflation expectations collapse as oil falls. Safety unwind. Risk-on bond selling. War risk premium exits.", ci_label: "+10bps to +35bps", isBps: true },
    dxy:   { direction: "down", pct_mid: -2.5,  pct_low: -1.2,  pct_high: -4.0,  timeframe: 7, rationale: "Risk-on. EM and commodity currencies surge. Safe-haven unwind. Consistent with Gulf War I oil peak reversal.", ci_label: "-1.2% to -4%", isBps: false },
  },
  collapse: {
    // Regime falls. Initially chaotic, then large relief rally if pro-West transition.
    // Path-dependent: initial selloff then sharp reversal. Biggest Brent downside.
    // Iran supply normalisation + Hormuz reopening = structural oil supply increase.
    spx:   { direction: "mixed", pct_mid: +3.0,  pct_low: -8.0,  pct_high: +12.0, timeframe: 7, rationale: "Highly path-dependent. Initial chaos -5-8% then sharp relief rally if pro-West transition. Net positive on 7-day.", ci_label: "-8% to +12% (path-dependent)", isBps: false },
    brent: { direction: "down",  pct_mid: -30.0, pct_low: -20.0, pct_high: -40.0, timeframe: 7, rationale: "Largest oil downside. Iran supply (3.2mb/d) normalises + Hormuz reopens. Structural supply increase. $107 -> $65-85.", ci_label: "-20% to -40%", isBps: false },
    ust5y: { direction: "up",    pct_mid: +25,   pct_low: +12,   pct_high: +40,   timeframe: 7, rationale: "Inflation expectations drop sharply on oil collapse. Risk-on bond selling. Largest safety unwind scenario.", ci_label: "+12bps to +40bps", isBps: true },
    dxy:   { direction: "down",  pct_mid: -3.0,  pct_low: -1.5,  pct_high: -5.0,  timeframe: 7, rationale: "Strongest risk-on unwind of all scenarios. EM and oil-linked currencies (CAD, RUB, BRL) outperform sharply.", ci_label: "-1.5% to -5%", isBps: false },
  },
};


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
const CORS_PROXY = "https://api.allorigins.win/get?url=";
const RSSHUB = "https://rsshub-production-0380.up.railway.app";

const RSS_SOURCES = [
  // ── Established wire / broadcast ──────────────────────────────────────────
  { id: "aljazeera",  name: "Al Jazeera",            color: "#c8a84b", url: "https://www.aljazeera.com/xml/rss/all.xml",                              type: "rss" },
  { id: "bbc_me",     name: "BBC Middle East",        color: "#bb1919", url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",                type: "rss" },
  { id: "bbc_persian",name: "BBC Persian",            color: "#cc2200", url: "https://feeds.bbci.co.uk/persian/rss.xml",                               type: "rss" },
  { id: "reuters",    name: "Reuters World",          color: "#ff6600", url: "https://feeds.reuters.com/reuters/worldNews",                            type: "rss" },
  { id: "ap",         name: "AP Middle East",         color: "#ff4400", url: `${RSSHUB}/apnews/topics/middle-east`,                           type: "rss" },
  { id: "guardian",   name: "Guardian Middle East",   color: "#005689", url: "https://www.theguardian.com/world/middleeast/rss",                       type: "rss" },
  { id: "rferl",      name: "RFE/RL Iran",            color: "#1a6496", url: "https://www.rferl.org/api/epiqq",                                        type: "rss" },
  { id: "almonitor",  name: "Al-Monitor",             color: "#2e86ab", url: "https://www.al-monitor.com/rss",                                         type: "rss" },
  // ── Iran-specialist outlets ───────────────────────────────────────────────
  { id: "iranintl",   name: "Iran International",     color: "#7b5ea7", url: "https://www.iranintl.com/en/rss",                                        type: "rss" },
  // ── Telegram via RSSHub bridge (may require self-hosted RSSHub for reliability)
  { id: "vahidonline", name: "Vahid Online (TG)",     color: "#2ca5e0", url: `${RSSHUB}/telegram/channel/VahidOnline`,                        type: "telegram" },
  { id: "iranintl_tg", name: "Iran Intl (TG)",        color: "#9b59b6", url: `${RSSHUB}/telegram/channel/iranintl`,                           type: "telegram" },
];


// ─── LEADERS ──────────────────────────────────────────────────────────────────
const LEADERS = [
  { id: "mojtaba",  name: "Mojtaba Khamenei",  role: "Son of late Supreme Leader",                 scenario: "military_junta", color: "#e74c3c", trajectory: "Hardline Survival",     powerBase: "IRGC & Basij networks cultivated over 20 years", strategy: "Hereditary theocracy — clerical shell with military governance", risk: "CRITICAL — accelerates civil war; violates anti-monarchical founding principles", signal: "Named to any formal leadership role by IRGC or AoE" },
  { id: "pahlavi",  name: "Reza Pahlavi",       role: "Exiled son of last Shah",                    scenario: "collapse",       color: "#2ecc71", trajectory: "Total Regime Change",   powerBase: "Iranian diaspora + domestic nostalgia; National Council of Iran", strategy: "Positions as unifier for secular democratic transition, not ruling king", risk: "MODERATE — requires sustained US backing and street momentum", signal: "US State Dept or EU Parliament invite for formal consultations" },
  { id: "larijani", name: "Ali Larijani",        role: "Sec-Gen, Supreme National Security Council", scenario: "reform",         color: "#3498db", trajectory: "Managed De-escalation", powerBase: "IRGC background + diplomatic reputation; bridges hardliners and West", strategy: "National Salvation Council — concessions to end bombing, preserve state", risk: "LOW-MODERATE — requires regime consensus that pure force has failed", signal: "IRIB features him prominently or he meets Artesh leadership publicly" },
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

function ProbabilityRing({ value, color, label, aiOverride }) {
  const r = 38, c = 2 * Math.PI * r, dash = (Math.min(100, value) / 100) * c;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative" }}>
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
        {aiOverride && (
          <div style={{ position: "absolute", top: 0, right: -4, width: 10, height: 10, borderRadius: "50%", background: "#0f0", boxShadow: "0 0 6px #0f0" }} title="AI updated" />
        )}
      </div>
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

// ─── MARKET IMPACT CARD ───────────────────────────────────────────────────────
function MarketImpactCard({ asset, mdata, livePrice }) {
  const bl = livePrice || BASELINE[asset].eventDay;
  const isBps = mdata.isBps;
  const dc = dirColor(mdata.direction);
  const midLevel  = isBps ? bl + mdata.pct_mid  / 100 : bl * (1 + mdata.pct_mid  / 100);
  const lowLevel  = isBps ? bl + mdata.pct_low  / 100 : bl * (1 + mdata.pct_low  / 100);
  const highLevel = isBps ? bl + mdata.pct_high / 100 : bl * (1 + mdata.pct_high / 100);
  const midStr = isBps
    ? `${mdata.pct_mid > 0 ? "+" : ""}${mdata.pct_mid}bps`
    : `${mdata.pct_mid > 0 ? "+" : ""}${mdata.pct_mid.toFixed(1)}%`;

  return (
    <div style={{ background: "#0d0d0d", border: `1px solid ${dc}33`, borderRadius: 5, padding: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "#666", fontSize: 10, letterSpacing: 1 }}>{BASELINE[asset].label}</span>
        <span style={{ color: dc, fontSize: 18, fontWeight: 700, fontFamily: "monospace" }}>{midStr}</span>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ color: dc, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
          Target: {BASELINE[asset].fmt(midLevel)}
          <span style={{ color: "#444", fontWeight: 400, marginLeft: 6, fontSize: 10 }}>(from {BASELINE[asset].fmt(bl)})</span>
        </div>
        <div style={{ position: "relative", height: 20, background: "#111", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
          <div style={{
            position: "absolute",
            left: `${Math.min(50, 50 + Math.min(mdata.pct_low, mdata.pct_high) * 2)}%`,
            width: `${Math.abs(mdata.pct_high - mdata.pct_low) * 2}%`,
            height: "100%", background: `${dc}33`, borderRadius: 2,
          }} />
          <div style={{ position: "absolute", left: `${50 + mdata.pct_mid * 2}%`, width: 2, height: "100%", background: dc, boxShadow: `0 0 4px ${dc}` }} />
          <div style={{ position: "absolute", left: "50%", width: 1, height: "100%", background: "#333" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#555" }}>
          <span>Bear: {BASELINE[asset].fmt(Math.min(lowLevel, highLevel))}</span>
          <span>Bull: {BASELINE[asset].fmt(Math.max(lowLevel, highLevel))}</span>
        </div>
      </div>
      <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 6 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ color: "#f5a623", fontSize: 9, background: "#f5a62318", border: "1px solid #f5a62333", padding: "1px 6px", borderRadius: 2 }}>{mdata.timeframe}D WINDOW</span>
          <span style={{ color: "#555", fontSize: 9, background: "#1a1a1a", padding: "1px 6px", borderRadius: 2 }}>90% CI: {mdata.ci_label}</span>
        </div>
        <div style={{ color: "#666", fontSize: 10, lineHeight: 1.4 }}>{mdata.rationale}</div>
      </div>
    </div>
  );
}

// ─── LIVE PRICE TICKER ────────────────────────────────────────────────────────
function LivePriceTicker({ prices, loading, lastFetched, onRefresh }) {
  return (
    <div style={{ background: "#060a06", border: "1px solid #0f03", borderRadius: 6, padding: "10px 16px", marginBottom: 12, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
      <span style={{ color: "#0f0", fontSize: 10, letterSpacing: 2, flexShrink: 0 }}>LIVE PRICES</span>
      {Object.entries(BASELINE).map(([a, b]) => {
        const live = prices[a];
        const chg  = live ? ((live - b.eventDay) / b.eventDay * 100) : null;
        const isUp = chg > 0;
        return (
          <div key={a} style={{ display: "flex", flexDirection: "column", minWidth: 90 }}>
            <span style={{ color: "#555", fontSize: 9, letterSpacing: 1 }}>{b.label.toUpperCase()}</span>
            <span style={{ color: live ? (isUp ? "#2ecc71" : "#e74c3c") : "#444", fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>
              {live ? b.fmt(live) : b.fmt(b.eventDay)}
            </span>
            {chg !== null
              ? <span style={{ color: isUp ? "#2ecc71" : "#e74c3c", fontSize: 9 }}>{isUp ? "+" : ""}{chg.toFixed(2)}% vs Feb 28</span>
              : <span style={{ color: "#333", fontSize: 9 }}>Feb 28 event-day ref</span>
            }
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
const TABS = ["dashboard", "ai analysis", "markets", "live feed", "indicators", "leaders", "military", "economic", "notes"];

// ─── BUILD AI PROMPT ──────────────────────────────────────────────────────────
function buildPrompt(checkedIndicators, militaryRisk, econTriggers, recentHeadlines, livePrices, polyData) {
  const activeInds     = ALL_INDICATORS.filter(i => checkedIndicators[i.id]);
  const militaryAlerts = Object.entries(militaryRisk).filter(([, v]) => v !== "nominal");
  const econActive     = ECON_TRIGGERS.filter(t => econTriggers[t.id]);

  const now       = new Date();
  const today     = now.toISOString().slice(0, 10);
  const daysSince = Math.round((now - new Date("2026-02-28")) / 86400000);

  // Headlines: last 6h, max 20, title only
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
  const headlines = recentHeadlines
    .filter(h => h.date && new Date(h.date).getTime() > sixHoursAgo)
    .slice(0, 20)
    .map(h => (h.source?.name || "?") + ": " + h.title)
    .join("\n");

  // Prices: compact single line
  const prices = Object.entries(BASELINE).map(([k, b]) => {
    const live = livePrices[k];
    const chg  = live ? ((live - b.eventDay) / b.eventDay * 100).toFixed(1) : null;
    return b.label + " " + (live ? b.fmt(live) + "(" + (chg > 0 ? "+" : "") + chg + "%)" : "closed");
  }).join(", ");

  // Active signals: compact
  const signals = [
    ...activeInds.map(i => i.scenario.slice(0,3).toUpperCase() + ":" + i.label),
    ...militaryAlerts.map(([u, s]) => "MIL:" + u + "=" + s),
    ...econActive.map(t => "ECON:" + t.label),
  ].join("; ") || "none";

  // Polymarket crowd odds
  const polyText = polyData?.markets ? Object.values(polyData.markets)
    .filter(m => m.probability != null)
    .map(m => m.label + ": " + m.probability + "% (" + (m.volume || "?") + " vol)")
    .join("; ") : "unavailable";

  return (
    "Iran war analyst. Day " + daysSince + " (" + today + ").\n" +
    "CALIBRATION (use these as anchors for market impact estimates):\n" +
    "SPX -8.7% from Jan ATH, 5th losing week. Brent $107 (+$35 war premium). 10Y 4.43% (was 3.97%). DXY 99.9.\n" +
    "Mar23 peace SIGNAL alone: Brent -10% in one session, SPX +2.5%. Full deal = much larger.\n" +
    "Gulf War I analogue: oil -30.7%, SPX +11.8% once oil peaked and fell (DataTrek).\n" +
    "BlackRock (Mar20): SPX -7% from pre-war, disconnect vs macro shock. Underweight long Treasuries.\n" +
    "Macquarie tail: Brent $200/bbl if war to end-June. Berkshire Edge -20-30% SPX in severe scenario.\n" +
    "IRGC controls succession. Hormuz ~closed. Apr6 Trump deadline. Houthis intact.\n" +
    "PRICES: " + prices + "\n" +
    "SIGNALS: " + signals + "\n" +

    "=== THREE-SOURCE SYNTHESIS (Bridgewater method) ===\n" +
    "SOURCE 1  -  EXPERT ANALYST CONSENSUS (weighted by track record):\n" +
    "  HIGH WEIGHT: CSIS (Seth Jones, Mona Yacoubian, Jon Alterman)  -  embedded sourcing, track record on Iran\n" +
    "  HIGH WEIGHT: Anthony Cordesman (CSIS)  -  40yr ME military analysis record\n" +
    "  MED WEIGHT: Brookings (O'Hanlon, Gordon)  -  sound on US strategy, less on internal Iran dynamics\n" +
    "  MED WEIGHT: Behnam Ben Taleblu (FDD)  -  strong on IRGC structure, hawkish bias\n" +
    "  LOW WEIGHT: CNN/PBS talking heads  -  useful for US political framing, not Iran internal\n" +
    "  CONSENSUS VIEW: StatusQuo/IRGC-junta = ~55-65%, Reform/ceasefire = 20-30%, Collapse = 10-15%\n" +
    "SOURCE 2  -  POLYMARKET CALIBRATION ANCHORS (specific binary questions, not scenario probabilities):\n" +
    "  " + polyText + "\n" +
    "  Use these as CONSTRAINTS: e.g. if crowd gives 21% to regime fall by Jun 30, your Collapse scenario\n" +
    "  probability should be in a similar ballpark unless you have strong contrary signals.\n" +
    "  Note: insider trading documented on these markets  -  treat as informed signal, not pure crowd.\n" +
    "SOURCE 3  -  LIVE OSINT SIGNALS (from dashboard above)\n\n" +

    "SYNTHESIS INSTRUCTIONS:\n" +
    "1. Start with expert consensus as your prior (highest weight  -  these analysts have Iran-specific sourcing)\n" +
    "2. Update with Polymarket crowd odds  -  especially where crowd DEVIATES from experts by >10pp (this is signal)\n" +
    "3. Further update with live OSINT signals and headlines\n" +
    "4. Show your work: if you deviate from expert consensus, briefly state why in analyst_summary\n" +
    "5. Probabilities should reflect ALL THREE sources blended, not just one\n\n" +

    "HEADLINES:\n" + (headlines || "none") + "\n\n" +
    "Output JSON only. Probabilities sum=100. Forward projections from current prices. " +
    "Rationale max 15 words. analyst_summary 2 sentences: (1) dominant scenario + sources driving it, (2) where crowd vs experts diverge.\n" +
    '{"probabilities":{"status_quo":0,"military_junta":0,"reform":0,"collapse":0},' +
    '"markets":{"status_quo":{"spx":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"neutral","timeframe":5,"rationale":"","ci_label":"","isBps":false},' +
    '"brent":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"up","timeframe":7,"rationale":"","ci_label":"","isBps":false},' +
    '"ust5y":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"neutral","timeframe":5,"rationale":"","ci_label":"","isBps":true},' +
    '"dxy":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"neutral","timeframe":5,"rationale":"","ci_label":"","isBps":false}},' +
    '"military_junta":{"spx":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"down","timeframe":7,"rationale":"","ci_label":"","isBps":false},' +
    '"brent":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"up","timeframe":7,"rationale":"","ci_label":"","isBps":false},' +
    '"ust5y":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"down","timeframe":7,"rationale":"","ci_label":"","isBps":true},' +
    '"dxy":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"up","timeframe":7,"rationale":"","ci_label":"","isBps":false}},' +
    '"reform":{"spx":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"up","timeframe":7,"rationale":"","ci_label":"","isBps":false},' +
    '"brent":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"down","timeframe":7,"rationale":"","ci_label":"","isBps":false},' +
    '"ust5y":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"up","timeframe":7,"rationale":"","ci_label":"","isBps":true},' +
    '"dxy":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"down","timeframe":7,"rationale":"","ci_label":"","isBps":false}},' +
    '"collapse":{"spx":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"mixed","timeframe":7,"rationale":"","ci_label":"","isBps":false},' +
    '"brent":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"down","timeframe":7,"rationale":"","ci_label":"","isBps":false},' +
    '"ust5y":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"up","timeframe":7,"rationale":"","ci_label":"","isBps":true},' +
    '"dxy":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"down","timeframe":7,"rationale":"","ci_label":"","isBps":false}}},' +
    '"auto_indicators":[],' +
    '"analyst_summary":"",' +
    '"key_risks":["","",""],' +
    '"confidence_level":"medium",' +
    '"last_analysed":"' + now.toISOString() + '"}'
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [checked,        setChecked]        = useLocalStorage("iran_tmd_v15_indicators", {});
  const [militaryRisk,   setMilitaryRisk]   = useLocalStorage("iran_tmd_v15_military",   {});
  const [econTriggers,   setEconTriggers]   = useLocalStorage("iran_tmd_v15_econ",       {});
  const [notes,          setNotes]          = useLocalStorage("iran_tmd_v15_notes",       "");
  const [lastUpdate,     setLastUpdate]     = useLocalStorage("iran_tmd_v15_lastupdate",  null);

  const [activeTab,      setActiveTab]      = useState("dashboard");
  const [feedItems,      setFeedItems]      = useState([]);
  const [feedLoading,    setFeedLoading]    = useState(false);
  const [feedError,      setFeedError]      = useState(null);
  const [lastFetch,      setLastFetch]      = useState(null);
  const [feedFilter,     setFeedFilter]     = useState("all");
  const [livePrices,     setLivePrices]     = useState({});
  const [priceLoading,   setPriceLoading]   = useState(false);
  const [priceFetched,   setPriceFetched]   = useState(null);
  const [priceBasis,     setPriceBasis]     = useState({});   // basis tracking for derivative inference
  const [priceMethods,   setPriceMethods]   = useState({});   // how each price was derived
  const [polyData,       setPolyData]       = useState(null);
  const [polyLoading,    setPolyLoading]    = useState(false);

  // AI analysis state
  const [aiAnalysis,     setAiAnalysis]     = useState(null); // session only — fresh analysis on each visit
  const [aiLoading,      setAiLoading]      = useState(false);
  const [aiError,        setAiError]        = useState(null);
  const [aiTriggerCount, setAiTriggerCount] = useState(0);
  const prevFlaggedCount                    = useRef(0);
  const [calibration,    setCalibration]    = useState(() => {
    // Load cached calibration from localStorage (persists across sessions)
    try { const s = localStorage.getItem("iran_tmf_calibration"); return s ? JSON.parse(s) : null; }
    catch { return null; }
  });
  const [calibLoading,   setCalibLoading]   = useState(false);

  // ── Live price fetch ──────────────────────────────────────────────────────
  const fetchPrices = useCallback(async () => {
    setPriceLoading(true);
    try {
      // Pass last-known basis values so server can infer closed-market prices
      const headers = { "Content-Type": "application/json" };
      if (priceBasis.spxBasis  != null) headers["x-spx-basis"]   = priceBasis.spxBasis.toFixed(2);
      if (priceBasis.zfPrice   != null) headers["x-zf-last"]     = priceBasis.zfPrice.toFixed(4);
      if (priceBasis.ust5yYield != null) headers["x-ust5y-last"] = priceBasis.ust5yYield.toFixed(4);

      const res  = await fetch("/api/prices", { headers });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const results = {};
      if (data.spx   != null) results.spx   = data.spx;
      if (data.brent != null) results.brent = data.brent;
      if (data.ust5y != null) results.ust5y = data.ust5y;
      if (data.dxy   != null) results.dxy   = data.dxy;

      if (Object.keys(results).length > 0) {
        setLivePrices(results);
        setPriceFetched(new Date());
      }
      if (data.basis)   setPriceBasis(data.basis);
      if (data.methods) setPriceMethods(data.methods);
    } catch (err) {
      console.warn("Price fetch failed:", err.message);
    }
    setPriceLoading(false);
  }, [priceBasis]);

  useEffect(() => { fetchPrices(); }, [fetchPrices]);

  // Run calibration once per day, after prices are available
  useEffect(() => {
    if (Object.keys(livePrices).length > 0) {
      runCalibration(livePrices);
    }
  }, [livePrices, runCalibration]);

  // ── Polymarket odds fetch ─────────────────────────────────────────────────
  const fetchPolymarket = useCallback(async () => {
    setPolyLoading(true);
    try {
      const res = await fetch("/api/polymarket");
      const data = await res.json();
      if (data.markets) setPolyData(data);
    } catch (err) { console.warn("Polymarket fetch failed:", err.message); }
    setPolyLoading(false);
  }, []);
  useEffect(() => { fetchPolymarket(); }, [fetchPolymarket]);
  useEffect(() => {
    const id = setInterval(fetchPolymarket, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchPolymarket]);

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
    if (deduped.length === 0) setFeedError("No feed data returned. CORS proxy may be temporarily unavailable.");
    // Trigger AI analysis after every feed refresh (covers launch + 5-min cycle)
    setTimeout(() => { if (runAiRef.current) runAiRef.current(); }, 500);
  }, []);

  // Fetch feeds on launch and every 5 minutes regardless of active tab
  useEffect(() => { fetchFeeds(); }, [fetchFeeds]);
  useEffect(() => {
    const id = setInterval(fetchFeeds, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchFeeds]);

  // ── AI Analysis ───────────────────────────────────────────────────────────
  const runAiAnalysis = useCallback(async (items, currentChecked, currentMilitary, currentEcon, prices, poly, force = false) => {
    // Global throttle: refuse to fire if last call was < 55 minutes ago (cross-tab, cross-refresh)
    if (!force) {
      const lastCall = parseInt(localStorage.getItem("iran_tmf_last_ai_call") || "0");
      const minsBetween = (Date.now() - lastCall) / 60000;
      if (minsBetween < 55) {
        console.log(`AI throttled — last call ${minsBetween.toFixed(1)} min ago, minimum 55 min`);
        return;
      }
    }
    localStorage.setItem("iran_tmf_last_ai_call", Date.now().toString());
    setAiLoading(true);
    setAiError(null);
    try {
      const prompt = buildPrompt(currentChecked, currentMilitary, currentEcon, items, prices, poly);

      // Call via /api/analyze — Vercel serverless proxy (keeps API key server-side)
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile", // Groq free tier
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        const msg = data?.error?.message || data?.error || `Server returned ${response.status}`;
        throw new Error(typeof msg === "object" ? JSON.stringify(msg) : msg);
      }
      if (data?.error) throw new Error(typeof data.error === "object" ? JSON.stringify(data.error) : data.error);
      const text  = data.content?.map(b => b.text || "").join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      // Auto-apply detected indicators
      if (parsed.auto_indicators && parsed.auto_indicators.length > 0) {
        setChecked(prev => {
          const next = { ...prev };
          parsed.auto_indicators.forEach(id => { next[id] = true; });
          return next;
        });
        setLastUpdate(new Date().toISOString());
      }

      setAiAnalysis({ ...parsed, fetchedAt: new Date().toISOString() });
      setAiTriggerCount(c => c + 1);
    } catch (err) {
      setAiError(`Analysis failed: ${typeof err.message === 'string' ? err.message : JSON.stringify(err)}`);
    }
    setAiLoading(false);
  }, [setChecked, setLastUpdate, setAiAnalysis]);

  // Auto-trigger AI on first feed load
  // ── Daily market calibration ─────────────────────────────────────────────
  const runCalibration = useCallback(async (prices, force = false) => {
    // Only run once per calendar day (stored in localStorage)
    const today = new Date().toISOString().slice(0, 10);
    if (!force) {
      try {
        const last = localStorage.getItem("iran_tmf_calib_date");
        if (last === today) { console.log("Calibration already run today, skipping"); return; }
      } catch {}
    }
    if (!prices || Object.keys(prices).length === 0) return; // need live prices first

    setCalibLoading(true);
    try {
      const spx   = prices.spx   ? BASELINE.spx.fmt(prices.spx)     : "unavailable";
      const brent = prices.brent ? BASELINE.brent.fmt(prices.brent)  : "unavailable";
      const ust5y = prices.ust5y ? BASELINE.ust5y.fmt(prices.ust5y)  : "unavailable";
      const dxy   = prices.dxy   ? BASELINE.dxy.fmt(prices.dxy)      : "unavailable";

      const prompt = [
        "You are a quantitative market strategist calibrating scenario impact estimates for an Iran war risk dashboard.",
        "Today: " + today + ". Active conflict - US-Israeli strikes killed Khamenei Feb 28 2026.",
        "CURRENT LIVE PRICES (start all projections from these levels):",
        "S&P 500: " + spx + " (was 6,878 pre-war, -7% from ATH)",
        "Brent Crude: " + brent + " (was $72.87 pre-war, ~$35 war premium already in)",
        "5Y Treasury Yield: " + ust5y + " (was 3.51% pre-war)",
        "DXY: " + dxy + " (was 97.65 pre-war)",
        "HISTORICAL CALIBRATION ANCHORS:",
        "- Mar 23 peace signal alone: Brent -10% in one session, SPX +2.5%",
        "- Gulf War I: oil -30.7%, SPX +13.6% once oil peaked and fell",
        "- BlackRock (Mar 20): SPX disconnect vs macro shock, underweight long Treasuries",
        "- Macquarie tail: Brent $200/bbl if war extends to June",
        "- RBC: SPX avg -6% in 20 post-WWII conflicts, recovery in 28 days unless energy disrupted",
        "For each of the 4 scenarios, estimate 7-day % move FROM CURRENT PRICES (marginal move - shock is already priced).",
        "ust5y values are basis points (bps), all others are percentages.",
        "SCENARIOS:",
        "1. STATUS_QUO: War ongoing, IRGC in control, no new catalyst",
        "2. MILITARY_JUNTA: Houthis activate OR Hormuz fully closed, deeper escalation",
        "3. REFORM: Ceasefire deal, Hormuz reopens, Apr6 deadline met",
        "4. COLLAPSE: Regime falls, pro-West transition, Iran supply normalises",
        "Reply with ONLY valid JSON, no markdown:",
        '{"calibrated_at":"' + today + '","status_quo":{"spx":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"neutral","rationale":""},"brent":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"up","rationale":""},"ust5y":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"neutral","rationale":""},"dxy":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"neutral","rationale":""}},',
        '"military_junta":{"spx":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"down","rationale":""},"brent":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"up","rationale":""},"ust5y":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"down","rationale":""},"dxy":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"up","rationale":""}},',
        '"reform":{"spx":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"up","rationale":""},"brent":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"down","rationale":""},"ust5y":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"up","rationale":""},"dxy":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"down","rationale":""}},',
        '"collapse":{"spx":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"mixed","rationale":""},"brent":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"down","rationale":""},"ust5y":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"up","rationale":""},"dxy":{"pct_mid":0,"pct_low":0,"pct_high":0,"direction":"down","rationale":""}}}',
        "All zeros are placeholders - replace with calibrated values from current prices."
      ].join("\n");

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 1200,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!response.ok) throw new Error("Calibration API returned " + response.status);
      const data = await response.json();
      if (data?.error) throw new Error(data.error);
      const text  = data.content?.map(b => b.text || "").join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      // Merge with DEFAULT_MARKETS structure (add isBps, timeframe, ci_label)
      const merged = {};
      ["status_quo","military_junta","reform","collapse"].forEach(sc => {
        if (!parsed[sc]) return;
        merged[sc] = {};
        ["spx","brent","ust5y","dxy"].forEach(asset => {
          const d = parsed[sc][asset];
          if (!d) return;
          const isBps = asset === "ust5y";
          const lo = Math.min(d.pct_low, d.pct_high);
          const hi = Math.max(d.pct_low, d.pct_high);
          merged[sc][asset] = {
            ...DEFAULT_MARKETS[sc][asset], // keep isBps, timeframe
            pct_mid:   d.pct_mid,
            pct_low:   lo,
            pct_high:  hi,
            direction: d.direction,
            rationale: d.rationale,
            ci_label:  isBps
              ? lo.toFixed(0) + "bps to " + hi.toFixed(0) + "bps"
              : lo.toFixed(1) + "% to +" + hi.toFixed(1) + "%",
          };
        });
      });

      const result = { ...parsed, markets: merged, calibratedAt: new Date().toISOString() };
      setCalibration(result);
      try {
        localStorage.setItem("iran_tmf_calibration", JSON.stringify(result));
        localStorage.setItem("iran_tmf_calib_date", today);
      } catch {}

    } catch (err) {
      console.warn("Calibration failed:", err.message);
    }
    setCalibLoading(false);
  }, []);

  // ── Keep a stable ref to latest runAiAnalysis so fetchFeeds can call it without deps issues
  const runAiRef = useRef(null);
  useEffect(() => { runAiRef.current = () => runAiAnalysis(feedItems, checked, militaryRisk, econTriggers, livePrices, polyData); },
    [feedItems, checked, militaryRisk, econTriggers, livePrices, polyData, runAiAnalysis]);

  // Auto-trigger AI every 5 minutes via stable interval
  useEffect(() => {
    const id = setInterval(() => { if (runAiRef.current && !aiLoading) runAiRef.current(); }, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [aiLoading]);

  // Auto-trigger when new flagged signals appear between cycles
  useEffect(() => {
    const flagged = feedItems.filter(i => i.classification).length;
    if (flagged > prevFlaggedCount.current && feedItems.length > 0 && !aiLoading) {
      prevFlaggedCount.current = flagged;
      if (runAiRef.current) runAiRef.current();
    }
  }, [feedItems, aiLoading]);

  // ── Compute probabilities (AI overrides static weights if available) ──────
  const aiProbs    = aiAnalysis?.probabilities || null;
  const aiMarkets  = aiAnalysis?.markets       || null;

  // Static score fallback
  const staticScores = {};
  SCENARIO_DEFS.forEach(s => { staticScores[s.id] = s.baseScore; });
  ALL_INDICATORS.forEach(ind => { if (checked[ind.id]) staticScores[ind.scenario] = (staticScores[ind.scenario] || 0) + ind.weight; });
  Object.entries(militaryRisk).forEach(([unit, state]) => {
    const u = MILITARY_UNITS.find(m => m.unit === unit); if (!u) return;
    if (state === "concerning") { u.branch === "Artesh" ? staticScores.collapse++ : staticScores.military_junta++; }
    if (state === "defected")   { u.branch === "Artesh" ? staticScores.collapse += 3 : staticScores.military_junta += 2; }
  });
  ECON_TRIGGERS.forEach(t => { if (econTriggers[t.id]) staticScores.collapse = (staticScores.collapse || 0) + t.collapseAdd; });
  const staticTotal = Object.values(staticScores).reduce((a, b) => a + b, 0);
  const staticProbs = {};
  SCENARIO_DEFS.forEach(s => { staticProbs[s.id] = Math.round((staticScores[s.id] / staticTotal) * 100); });

  const probabilities = aiProbs || staticProbs;
  // Priority: AI markets (from Groq analysis) > calibration (daily) > static defaults
  const calibMarkets  = calibration?.markets || null;
  const marketData    = aiMarkets || calibMarkets || DEFAULT_MARKETS;

  // Build full scenario objects merging static defs with dynamic data
  const SCENARIOS = SCENARIO_DEFS.map(s => ({
    ...s,
    probability: probabilities[s.id] || 0,
    markets: marketData[s.id] || DEFAULT_MARKETS[s.id],
  }));

  const leading      = SCENARIOS.reduce((a, b) => a.probability > b.probability ? a : b);
  const checkedCount = Object.values(checked).filter(Boolean).length;
  const flaggedCount = feedItems.filter(i => i.classification).length;

  function toggleIndicator(id) { setChecked(p => { const n = {...p, [id]: !p[id]}; setLastUpdate(new Date().toISOString()); return n; }); }
  function toggleMilitary(unit) { setMilitaryRisk(p => { const s = ["nominal","concerning","defected"], c = p[unit]||"nominal"; return {...p, [unit]: s[(s.indexOf(c)+1)%3]}; }); }
  function toggleEcon(id) { setEconTriggers(p => ({...p, [id]: !p[id]})); }

  const tabStyle = t => ({
    padding: "8px 14px", cursor: "pointer", fontFamily: "monospace", fontSize: 11,
    letterSpacing: 1, textTransform: "uppercase", border: "none", whiteSpace: "nowrap",
    background: activeTab === t ? (t === "ai analysis" ? "#0f0" : "#0f0") : "transparent",
    color:      activeTab === t ? "#000" : (t === "ai analysis" ? "#0f0" : "#0f0"),
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
          <div style={{ color: "#555", fontSize: 10, letterSpacing: 2 }}>
            TRANSITION MONITORING FRAMEWORK · OSINT + GROQ AI · <span style={{ color: "#0f06" }}>v1.22</span>
            {aiAnalysis && <span style={{ color: "#0f0", marginLeft: 8 }}>· GROQ ACTIVE ({aiTriggerCount} analyses)</span>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <Timestamp />
          <div style={{ color: "#555", fontSize: 10 }}>
            {checkedCount}/{ALL_INDICATORS.length} indicators · {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : "--"}
          </div>
        </div>
      </div>

      {/* Alert banner */}
      <div style={{ background: `${leading.color}18`, borderBottom: `1px solid ${leading.color}44`, padding: "8px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: leading.color, boxShadow: `0 0 10px ${leading.color}`, animation: "pulse 1.5s infinite", flexShrink: 0 }} />
        <span style={{ color: leading.color, fontWeight: 700, letterSpacing: 1 }}>LEADING: {leading.label.toUpperCase()}</span>
        <span style={{ color: "#555", fontSize: 10, marginLeft: 4 }}>{aiProbs ? "· GROQ-REASONED" : "· STATIC WEIGHTS"}</span>
        <span style={{ color: "#666", marginLeft: "auto" }}>{leading.probability}% probability</span>
        {flaggedCount > 0 && <span style={{ color: "#e74c3c", fontSize: 10, border: "1px solid #e74c3c44", padding: "2px 8px", borderRadius: 3 }}>⚡ {flaggedCount} signals</span>}
        {aiLoading && <span style={{ color: "#0f0", fontSize: 10, animation: "pulse 1s infinite" }}>◈ AI ANALYSING...</span>}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #0f0", overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>
            {t === "live feed" && flaggedCount > 0 ? `live feed (${flaggedCount})` : t}
            {t === "ai analysis" && aiLoading ? " ◈" : ""}
          </button>
        ))}
      </div>

      <div style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>

        {/* ══ DASHBOARD ══ */}
        {activeTab === "dashboard" && (
          <div>

            {/* AI status strip */}
            <div style={{ ...card, background: aiAnalysis ? "#050a05" : "#080808", borderColor: aiAnalysis ? "#0f03" : "#1a1a1a", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: aiAnalysis ? "#0f0" : "#333", boxShadow: aiAnalysis ? "0 0 8px #0f0" : "none", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <span style={{ color: aiAnalysis ? "#0f0" : "#555", fontSize: 11 }}>
                  {aiAnalysis ? `Groq AI active — last run ${new Date(aiAnalysis.fetchedAt).toLocaleTimeString()} · ${aiTriggerCount} total runs` : "Groq AI loading — will auto-run on first feed fetch..."}
                </span>
                {aiAnalysis && <span style={{ color: "#555", fontSize: 10, marginLeft: 8 }}>confidence: {aiAnalysis.confidence_level?.toUpperCase()}</span>}
                <span style={{ color: "#0f05", fontSize: 10, marginLeft: 8 }}>· auto-runs every 5 min</span>
              </div>
              <button
                onClick={() => runAiAnalysis(feedItems, checked, militaryRisk, econTriggers, livePrices, polyData, true)}
                disabled={aiLoading}
                style={{ background: aiLoading ? "transparent" : "#0f011", border: "1px solid #0f0", color: "#0f0", padding: "5px 14px", borderRadius: 3, fontSize: 10, cursor: aiLoading ? "not-allowed" : "pointer", fontFamily: "monospace", letterSpacing: 1 }}>
                {aiLoading ? "◈ ANALYSING..." : "◈ RUN GROQ ANALYSIS"}
              </button>
            </div>

            {/* ── POLYMARKET INTELLIGENCE ── */}
            <div style={{ background: "#080510", border: "1px solid #6633ff44", borderRadius: 6, padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <span style={{ color: "#9966ff", fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ POLYMARKET INTELLIGENCE</span>
                  <span style={{ color: "#6633ff55", fontSize: 9, marginLeft: 8 }}>crowd calibration · {polyData ? new Date(polyData.fetchedAt).toLocaleTimeString() : "loading..."}</span>
                </div>
                <button onClick={fetchPolymarket} disabled={polyLoading}
                  style={{ background: "transparent", border: "1px solid #6633ff44", color: "#9966ff", padding: "3px 8px", borderRadius: 3, fontSize: 9, cursor: "pointer", fontFamily: "monospace" }}>
                  {polyLoading ? "..." : "REFRESH"}
                </button>
              </div>
              <div style={{ color: "#444", fontSize: 9, marginBottom: 10, lineHeight: 1.5 }}>
                Specific dated binary questions — not directly comparable to scenario probabilities. Fed to Groq as calibration anchors: crowd odds constrain plausible scenario ranges.
              </div>
              {polyData?.markets && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 8 }}>
                  {Object.values(polyData.markets).filter(m => m.probability != null).map(m => {
                    const impliedScenario = SCENARIO_DEFS.find(s => s.id === m.scenario);
                    const groqProb = aiAnalysis?.probabilities?.[m.scenario];
                    const divergeMag = groqProb != null ? Math.abs(m.probability - groqProb) : null;
                    const divergeDir = groqProb != null ? (m.probability > groqProb ? "crowd implies higher" : "Groq implies higher") : null;
                    return (
                      <div key={m.label} style={{ background: "#06040f", border: "1px solid #6633ff22", borderRadius: 4, padding: "10px 12px" }}>
                        <div style={{ color: "#9966ff", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>{m.label}</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                          <span style={{ color: "#fff", fontSize: 22, fontWeight: 700, fontFamily: "monospace" }}>{m.probability}%</span>
                          <span style={{ color: "#444", fontSize: 9 }}>crowd YES</span>
                          {m.volume && <span style={{ color: "#2a2a2a", fontSize: 9, marginLeft: "auto" }}>${m.volume}</span>}
                        </div>
                        <div style={{ fontSize: 9, color: "#444", marginBottom: 4 }}>
                          Relates to: <span style={{ color: impliedScenario?.color }}>{impliedScenario?.label}</span>
                        </div>
                        <div style={{ fontSize: 9, color: "#333", fontStyle: "italic", lineHeight: 1.4 }}>{m.signal}</div>
                        {divergeMag != null && divergeMag > 10 && (
                          <div style={{ marginTop: 8, background: "#f5a62310", border: "1px solid #f5a62333", borderRadius: 3, padding: "4px 6px", fontSize: 9, color: "#f5a623" }}>
                            ⚡ {divergeDir} than Groq by {divergeMag}pp — notable divergence
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {!polyData && !polyLoading && <div style={{ color: "#333", fontSize: 10 }}>Unavailable — will retry on next refresh</div>}
              {polyLoading && <div style={{ color: "#6633ff44", fontSize: 10 }}>Fetching...</div>}
              <div style={{ color: "#1a1a1a", fontSize: 9, marginTop: 8 }}>
                ⚠ Insider trading documented on these markets — treat as informed but not pure crowd signal
              </div>
            </div>

            <div style={card}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 16 }}>
                SCENARIO PROBABILITY MATRIX
                <span style={{ color: "#333", fontWeight: 400, marginLeft: 8 }}>{aiProbs ? "· GROQ-REASONED PROBABILITIES" : "· STATIC INDICATOR WEIGHTS"}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 16, justifyItems: "center" }}>
                {SCENARIOS.map(s => <ProbabilityRing key={s.id} value={s.probability} color={s.color} label={s.label} aiOverride={!!aiProbs} />)}
              </div>
            </div>

            {/* ── LIVE PRICES + TRADING OUTLOOK ── */}
            <div style={{ background: "#03080a", border: "2px solid #0f0", borderRadius: 8, padding: 18, marginBottom: 14, boxShadow: "0 0 24px #0f010" }}>

              {/* Header row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ color: "#0f0", fontSize: 12, letterSpacing: 3, fontWeight: 700 }}>◈ LIVE PRICES · PROBABILITY-WEIGHTED OUTLOOK</div>
                  <div style={{ color: "#0f05", fontSize: 9, marginTop: 2 }}>
                    Current levels · 7-day forward projections blended across scenarios · {aiProbs ? "Groq-reasoned" : "static weights"}
                  </div>
                </div>
                <button onClick={fetchPrices} disabled={priceLoading}
                  style={{ background: "transparent", border: "1px solid #0f04", color: "#0f0", padding: "3px 8px", borderRadius: 3, fontSize: 9, cursor: "pointer", fontFamily: "monospace" }}>
                  {priceLoading ? "FETCHING..." : "↻ PRICES"}
                </button>
              </div>

              {/* Asset grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
                {Object.keys(BASELINE).map(asset => {
                  const b      = BASELINE[asset];
                  const live   = livePrices[asset];
                  const isBps  = DEFAULT_MARKETS.status_quo[asset].isBps;
                  const chg    = live ? ((live - b.eventDay) / b.eventDay * 100) : null;
                  const isUp   = chg > 0;
                  // Probability-weighted move
                  const wMid   = SCENARIOS.reduce((sum, s) => sum + (s.markets[asset].pct_mid  * s.probability / 100), 0);
                  const wLow   = SCENARIOS.reduce((sum, s) => sum + (s.markets[asset].pct_low  * s.probability / 100), 0);
                  const wHigh  = SCENARIOS.reduce((sum, s) => sum + (s.markets[asset].pct_high * s.probability / 100), 0);
                  const base   = live || b.eventDay;
                  const target = isBps ? base + wMid / 100 : base * (1 + wMid / 100);
                  const tLow   = isBps ? base + wLow  / 100 : base * (1 + wLow  / 100);
                  const tHigh  = isBps ? base + wHigh / 100 : base * (1 + wHigh / 100);
                  const dc     = wMid > 1 ? "#2ecc71" : wMid < -1 ? "#e74c3c" : "#f5a623";
                  const arrow  = wMid > 1 ? "▲" : wMid < -1 ? "▼" : "►";
                  const moveStr = isBps
                    ? (wMid > 0 ? "+" : "") + wMid.toFixed(1) + "bps"
                    : (wMid > 0 ? "+" : "") + wMid.toFixed(1) + "%";
                  const conviction = Math.abs(wMid) > 3 ? "HIGH" : Math.abs(wMid) > 1 ? "MOD" : "LOW";
                  const convColor  = conviction === "HIGH" ? "#e74c3c" : conviction === "MOD" ? "#f5a623" : "#555";

                  return (
                    <div key={asset} style={{ background: "#050d10", border: `1px solid ${dc}33`, borderRadius: 6, padding: 12 }}>
                      {/* Asset label + conviction */}
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ color: "#666", fontSize: 9, letterSpacing: 1 }}>{b.label.toUpperCase()}</span>
                        <span style={{ color: convColor, fontSize: 8, border: `1px solid ${convColor}44`, padding: "1px 4px", borderRadius: 2 }}>{conviction}</span>
                      </div>

                      {/* Current live price */}
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: live ? (isUp ? "#2ecc71" : "#e74c3c") : "#555", fontSize: 20, fontWeight: 700, fontFamily: "monospace", lineHeight: 1 }}>
                          {live ? b.fmt(live) : b.fmt(b.eventDay)}
                        </div>
                        {chg !== null
                          ? <div style={{ color: isUp ? "#2ecc71" : "#e74c3c", fontSize: 9, marginTop: 2 }}>
                              {isUp ? "+" : ""}{chg.toFixed(2)}% vs Feb 28
                            </div>
                          : <div style={{ color: "#333", fontSize: 9, marginTop: 2 }}>market closed · Feb 28 ref</div>
                        }
                        {priceMethods[asset] && (
                          <div style={{ color: "#2a3a2a", fontSize: 8, marginTop: 2, fontStyle: "italic" }}>
                            {priceMethods[asset]}
                          </div>
                        )}
                      </div>

                      {/* Divider */}
                      <div style={{ borderTop: "1px solid #1a2a1a", marginBottom: 8 }} />

                      {/* Weighted outlook */}
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                        <span style={{ color: dc, fontSize: 9 }}>{arrow}</span>
                        <span style={{ color: dc, fontSize: 18, fontWeight: 700, fontFamily: "monospace", lineHeight: 1 }}>{moveStr}</span>
                        <span style={{ color: dc, fontSize: 10, marginLeft: 2 }}>{b.fmt(target)}</span>
                      </div>
                      <div style={{ background: "#0a0a0a", borderRadius: 3, height: 5, marginBottom: 5, position: "relative", overflow: "hidden" }}>
                        <div style={{
                          position: "absolute", height: "100%", background: `${dc}55`, borderRadius: 3,
                          left: "50%", width: Math.min(80, Math.abs(wMid) * 6) + "%",
                          transform: wMid >= 0 ? "translateX(0)" : "translateX(-100%)",
                        }} />
                        <div style={{ position: "absolute", left: "50%", width: 1, height: "100%", background: "#333" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#333" }}>
                        <span>{b.fmt(Math.min(tLow, tHigh))}</span>
                        <span>90% CI</span>
                        <span>{b.fmt(Math.max(tLow, tHigh))}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ color: "#1a2a1a", fontSize: 9, marginTop: 10, textAlign: "right" }}>
                {priceFetched ? `prices fetched ${priceFetched.toLocaleTimeString()}` : "awaiting price data"} · for analytical purposes only
              </div>
            </div>


            {aiAnalysis?.analyst_summary && (
              <div style={{ ...card, borderColor: "#0f03", background: "#050a05" }}>
                <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>◈ AI ANALYST SUMMARY</div>
                <div style={{ color: "#aaa", lineHeight: 1.7, fontSize: 12 }}>{aiAnalysis.analyst_summary}</div>
                {aiAnalysis.key_risks && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ color: "#e74c3c", fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>KEY RISKS (NEXT 24H)</div>
                    {aiAnalysis.key_risks.map((r, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                        <span style={{ color: "#e74c3c", flexShrink: 0 }}>▸</span>
                        <span style={{ color: "#888", fontSize: 11 }}>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={card}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>WEIGHTED SIGNAL SCORES</div>
              {SCENARIOS.map(s => (
                <div key={s.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: s.color }}>{s.label}</span>
                    <span style={{ color: s.color, fontWeight: 700 }}>{s.probability}%</span>
                  </div>
                  <GlowBar value={s.probability} max={100} color={s.color} />
                  <div style={{ color: "#444", fontSize: 10, marginTop: 3 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ AI ANALYSIS ══ */}
        {activeTab === "ai analysis" && (
          <div>
            <div style={{ ...card, background: "#050a05", borderColor: "#0f03" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ color: "#0f0", fontSize: 12, letterSpacing: 2, marginBottom: 4 }}>◈ GROQ AI ANALYSIS ENGINE · Llama 3.3 70B</div>
                  <div style={{ color: "#555", fontSize: 11 }}>
                    Sends all active indicators, military/economic signals, and last 60 minutes of headlines to Groq (Llama 3.3 70B) for live reasoning. Free tier: 14,400 requests/day.
                    Auto-triggers when new signals are detected in the feed.
                  </div>
                </div>
                <button
                  onClick={() => runAiAnalysis(feedItems, checked, militaryRisk, econTriggers, livePrices, polyData, true)}
                  disabled={aiLoading}
                  style={{ background: aiLoading ? "transparent" : "#0f011", border: "1px solid #0f0", color: "#0f0", padding: "8px 20px", borderRadius: 3, fontSize: 11, cursor: aiLoading ? "not-allowed" : "pointer", fontFamily: "monospace", letterSpacing: 2, boxShadow: aiLoading ? "none" : "0 0 12px #0f04" }}>
                  {aiLoading ? "◈ ANALYSING IN PROGRESS..." : "◈ RUN FULL GROQ ANALYSIS NOW"}
                </button>
              </div>

              {/* Context summary */}
              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                {[
                  { label: "Active indicators", value: checkedCount, color: "#f5a623" },
                  { label: "Military alerts",   value: Object.values(militaryRisk).filter(v => v !== "nominal").length, color: "#e74c3c" },
                  { label: "Econ triggers",     value: Object.values(econTriggers).filter(Boolean).length, color: "#2ecc71" },
                  { label: "Headlines (1hr)",   value: feedItems.filter(h => h.date && (Date.now() - new Date(h.date).getTime()) < 3600000).length, color: "#3498db" },
                ].map(b => (
                  <div key={b.label} style={{ background: "#080808", border: "1px solid #1a1a1a", borderRadius: 4, padding: "8px 10px" }}>
                    <div style={{ color: b.color, fontSize: 18, fontWeight: 700 }}>{b.eventDay}</div>
                    <div style={{ color: "#555", fontSize: 9, letterSpacing: 1 }}>{b.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            </div>

            {aiError && <div style={{ ...card, borderColor: "#e74c3c44", color: "#e74c3c" }}>⚠ {aiError}</div>}

            {aiLoading && (
              <div style={{ ...card, borderColor: "#0f03", textAlign: "center", padding: 40 }}>
                <div style={{ color: "#0f0", fontSize: 14, letterSpacing: 3, animation: "pulse 1s infinite", marginBottom: 8 }}>◈ GROQ IS ANALYSING</div>
                <div style={{ color: "#555", fontSize: 11 }}>Groq / Llama 3.3 70B is processing indicators, military signals, economic triggers and recent headlines...</div>
              </div>
            )}

            {aiAnalysis && !aiLoading && (
              <div>
                {/* Probabilities */}
                <div style={{ ...card, borderColor: "#0f03" }}>
                  <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>GROQ-REASONED SCENARIO PROBABILITIES · Llama 3.3 70B</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 16, justifyItems: "center", marginBottom: 16 }}>
                    {SCENARIOS.map(s => <ProbabilityRing key={s.id} value={s.probability} color={s.color} label={s.label} aiOverride={true} />)}
                  </div>
                  <div style={{ color: "#444", fontSize: 10, textAlign: "center" }}>
                    Analysed by Groq / Llama 3.3 70B · {new Date(aiAnalysis.fetchedAt).toLocaleString()} · Confidence: {aiAnalysis.confidence_level?.toUpperCase()} · {aiTriggerCount} analyses this session
                  </div>
                </div>

                {/* Analyst summary */}
                <div style={{ ...card, borderColor: "#0f03", background: "#050a05" }}>
                  <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>ANALYST ASSESSMENT</div>
                  <div style={{ color: "#bbb", lineHeight: 1.8, fontSize: 12 }}>{aiAnalysis.analyst_summary}</div>
                  {aiAnalysis.key_risks?.length > 0 && (
                    <div style={{ marginTop: 14, borderTop: "1px solid #111", paddingTop: 12 }}>
                      <div style={{ color: "#e74c3c", fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>KEY RISKS — NEXT 24 HOURS</div>
                      {aiAnalysis.key_risks.map((r, i) => (
                        <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                          <span style={{ color: "#e74c3c", flexShrink: 0 }}>▸</span>
                          <span style={{ color: "#888", fontSize: 11 }}>{r}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Auto-detected indicators */}
                {aiAnalysis.auto_indicators?.length > 0 && (
                  <div style={{ ...card, borderColor: "#f5a62333" }}>
                    <div style={{ color: "#f5a623", fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>◈ GROQ AUTO-DETECTED INDICATORS</div>
                    <div style={{ color: "#666", fontSize: 11, marginBottom: 10 }}>These indicators were inferred from recent headlines by Groq and auto-ticked:</div>
                    {aiAnalysis.auto_indicators.map(id => {
                      const ind = ALL_INDICATORS.find(i => i.id === id);
                      const sc  = SCENARIO_DEFS.find(s => s.id === ind?.scenario);
                      if (!ind) return null;
                      return (
                        <div key={id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #111" }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc?.color, flexShrink: 0 }} />
                          <span style={{ color: "#aaa", fontSize: 11 }}>{ind.label}</span>
                          <span style={{ color: sc?.color, fontSize: 10, marginLeft: "auto" }}>{sc?.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!aiAnalysis && !aiLoading && !aiError && (
              <div style={{ ...card, textAlign: "center", padding: 40, color: "#333" }}>
                Groq analysis will run automatically once the live feeds finish loading. You can also trigger it manually above.
              </div>
            )}
          </div>
        )}

        {/* ══ MARKETS ══ */}
        {activeTab === "markets" && (
          <div>
            <LivePriceTicker prices={livePrices} loading={priceLoading} lastFetched={priceFetched} onRefresh={fetchPrices} />
            <div style={{ ...card, background: "#05080a", borderColor: "#0f03" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2 }}>CURRENT LIVE PRICES · Feb 28 event-day shown for reference</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {calibLoading && <span style={{ color: "#f5a623", fontSize: 9, animation: "pulse 1s infinite" }}>◈ CALIBRATING...</span>}
                  {calibration && !calibLoading && (
                    <span style={{ color: "#0f05", fontSize: 9, border: "1px solid #0f03", padding: "2px 6px", borderRadius: 3 }}>
                      ◈ calibrated {new Date(calibration.calibratedAt).toLocaleDateString()} {new Date(calibration.calibratedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}
                      {aiMarkets ? " · AI override active" : calibMarkets ? " · daily cal active" : ""}
                    </span>
                  )}
                  {!calibration && !calibLoading && (
                    <span style={{ color: "#333", fontSize: 9 }}>static defaults · calibration pending</span>
                  )}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                {Object.entries(BASELINE).map(([asset, b]) => {
                  const live = livePrices[asset];
                  const chg  = live ? ((live - b.eventDay) / b.eventDay * 100) : null;
                  return (
                    <div key={asset} style={{ background: "#080808", border: "1px solid #1a1a1a", borderRadius: 4, padding: "10px 12px" }}>
                      <div style={{ color: "#555", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>{b.label.toUpperCase()}</div>
                      <div style={{ color: "#aaa", fontSize: 11 }}>Baseline: <span style={{ color: "#fff", fontFamily: "monospace" }}>{b.fmt(b.eventDay)}</span></div>
                      {live && chg !== null && (
                        <div style={{ color: chg > 0 ? "#2ecc71" : "#e74c3c", fontSize: 11, marginTop: 2 }}>
                          Live: <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{b.fmt(live)}</span>
                          <span style={{ fontSize: 9, marginLeft: 6 }}>({chg > 0 ? "+" : ""}{chg.toFixed(2)}%)</span>
                        </div>
                      )}
                      {!live && <div style={{ color: "#333", fontSize: 10 }}>Market closed / unavailable</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{ color: "#333", fontSize: 10, marginTop: 10 }}>
                {aiMarkets ? "Market impact estimates are Groq-updated based on current signals and headlines." : "Market impact estimates are baseline defaults — run Groq Analysis for live-reasoned updates."}
              </div>
            </div>

            {SCENARIOS.map(s => (
              <div key={s.id} style={{ ...card, borderLeft: `3px solid ${s.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                  <div>
                    <div style={{ color: s.color, fontSize: 15, fontWeight: 700 }}>{s.label}</div>
                    <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>{s.desc}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: s.color, fontSize: 24, fontWeight: 700, fontFamily: "monospace" }}>{s.probability}%</div>
                      <div style={{ color: "#444", fontSize: 10 }}>{aiProbs ? "Groq probability" : "static probability"}</div>
                    </div>
                    <svg viewBox="0 0 50 50" width={44} height={44}>
                      <circle cx={25} cy={25} r={20} fill="none" stroke="#222" strokeWidth={5} />
                      <circle cx={25} cy={25} r={20} fill="none" stroke={s.color} strokeWidth={5}
                        strokeDasharray={`${(s.probability/100)*(2*Math.PI*20)} ${2*Math.PI*20}`}
                        strokeLinecap="round" transform="rotate(-90 25 25)"
                        style={{ filter: `drop-shadow(0 0 3px ${s.color})` }} />
                    </svg>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
                  {Object.entries(s.markets).map(([asset, mdata]) => (
                    <MarketImpactCard key={asset} asset={asset} mdata={mdata} livePrice={livePrices[asset]} />
                  ))}
                </div>
              </div>
            ))}

            {/* Probability-weighted summary */}
            {/* ── PROBABILITY-WEIGHTED TRADING OUTLOOK ── */}
            <div style={{ background: "#03080a", border: "2px solid #0f0", borderRadius: 8, padding: 20, marginBottom: 16, boxShadow: "0 0 30px #0f012" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                <div>
                  <div style={{ color: "#0f0", fontSize: 13, letterSpacing: 3, fontWeight: 700 }}>◈ PROBABILITY-WEIGHTED TRADING OUTLOOK</div>
                  <div style={{ color: "#0f06", fontSize: 10, marginTop: 2 }}>
                    Expected move blended across all scenarios · 7-day horizon · {aiProbs ? "Groq-reasoned probabilities" : "static indicator weights"}
                  </div>
                </div>
                <div style={{ color: "#0f04", fontSize: 10, border: "1px solid #0f03", padding: "4px 10px", borderRadius: 3 }}>FOR ANALYTICAL PURPOSES ONLY · NOT FINANCIAL ADVICE</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                {Object.keys(BASELINE).map(asset => {
                  const isBps  = DEFAULT_MARKETS.status_quo[asset].isBps;
                  const wMid   = SCENARIOS.reduce((sum, s) => sum + (s.markets[asset].pct_mid  * s.probability / 100), 0);
                  const wLow   = SCENARIOS.reduce((sum, s) => sum + (s.markets[asset].pct_low  * s.probability / 100), 0);
                  const wHigh  = SCENARIOS.reduce((sum, s) => sum + (s.markets[asset].pct_high * s.probability / 100), 0);
                  const base   = livePrices[asset] || BASELINE[asset].eventDay;
                  const midLvl = isBps ? base + wMid / 100 : base * (1 + wMid / 100);
                  const lowLvl = isBps ? base + wLow / 100 : base * (1 + wLow / 100);
                  const hiLvl  = isBps ? base + wHigh / 100 : base * (1 + wHigh / 100);
                  const dc     = wMid > 1 ? "#2ecc71" : wMid < -1 ? "#e74c3c" : "#f5a623";
                  const arrow  = wMid > 1 ? "▲" : wMid < -1 ? "▼" : "►";
                  const midStr = isBps ? `${wMid > 0 ? "+" : ""}${wMid.toFixed(1)}bps` : `${wMid > 0 ? "+" : ""}${wMid.toFixed(1)}%`;
                  const conviction = Math.abs(wMid) > 3 ? "HIGH" : Math.abs(wMid) > 1 ? "MODERATE" : "LOW";
                  const convColor  = conviction === "HIGH" ? "#e74c3c" : conviction === "MODERATE" ? "#f5a623" : "#555";
                  return (
                    <div key={asset} style={{ background: `${dc}09`, border: `1px solid ${dc}44`, borderRadius: 6, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ color: "#888", fontSize: 10, letterSpacing: 1 }}>{BASELINE[asset].label.toUpperCase()}</span>
                        <span style={{ color: convColor, fontSize: 9, border: `1px solid ${convColor}44`, padding: "1px 5px", borderRadius: 2 }}>{conviction}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                        <span style={{ color: dc, fontSize: 10 }}>{arrow}</span>
                        <span style={{ color: dc, fontSize: 26, fontWeight: 700, fontFamily: "monospace", lineHeight: 1 }}>{midStr}</span>
                      </div>
                      <div style={{ color: dc, fontSize: 13, fontFamily: "monospace", marginBottom: 8 }}>
                        Target: {BASELINE[asset].fmt(midLvl)}
                      </div>
                      <div style={{ color: "#444", fontSize: 10, marginBottom: 6 }}>Now: {BASELINE[asset].fmt(base)}</div>
                      <div style={{ background: "#111", borderRadius: 3, height: 6, marginBottom: 6, position: "relative", overflow: "hidden" }}>
                        <div style={{
                          position: "absolute",
                          left: "50%",
                          width: `${Math.min(80, Math.abs(wMid) * 8)}%`,
                          height: "100%",
                          background: `${dc}55`,
                          transform: wMid >= 0 ? "translateX(0)" : "translateX(-100%)",
                          borderRadius: 3,
                        }} />
                        <div style={{ position: "absolute", left: "50%", width: 2, height: "100%", background: "#333" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#444" }}>
                        <span>Bear: {BASELINE[asset].fmt(Math.min(lowLvl, hiLvl))}</span>
                        <span style={{ color: "#333" }}>90% CI</span>
                        <span>Bull: {BASELINE[asset].fmt(Math.max(lowLvl, hiLvl))}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══ LIVE FEED ══ */}
        {activeTab === "live feed" && (
          <div>
            <div style={{ ...card, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <span style={{ color: "#0f0", fontSize: 11, letterSpacing: 2 }}>SOURCES</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <span style={{ color: "#444", fontSize: 9, alignSelf: "center", letterSpacing: 1 }}>RSS:</span>
                {RSS_SOURCES.filter(s => s.type !== "telegram").map(s => (
                  <span key={s.id} style={{ background: `${s.color}22`, border: `1px solid ${s.color}44`, color: s.color, padding: "2px 8px", borderRadius: 3, fontSize: 10 }}>{s.name}</span>
                ))}
                <span style={{ color: "#444", fontSize: 9, alignSelf: "center", letterSpacing: 1, marginLeft: 4 }}>TELEGRAM:</span>
                {RSS_SOURCES.filter(s => s.type === "telegram").map(s => (
                  <span key={s.id} style={{ background: `${s.color}22`, border: `1px solid ${s.color}44`, color: s.color, padding: "2px 8px", borderRadius: 3, fontSize: 10 }}>
                    <span style={{ marginRight: 4 }}>✈</span>{s.name}
                  </span>
                ))}
              </div>
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
            {lastFetch && <div style={{ color: "#444", fontSize: 10, marginBottom: 8, textAlign: "right" }}>Last fetched {lastFetch.toLocaleTimeString()} · feeds refresh every 30 min · Groq analysis every 60 min (throttled)</div>}
            <div style={{ color: "#2ca5e066", fontSize: 10, marginBottom: 8, background: "#0d1a2011", border: "1px solid #2ca5e022", borderRadius: 3, padding: "5px 10px" }}>
              ✈ Telegram feeds (Vahid Online, Iran Intl) use the public RSSHub bridge. If they show no items, the public bridge may be rate-limited — feeds will retry on next refresh.
            </div>
            <div style={card}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>LIVE MAP & OSINT SOURCES</div>
              {[
                { name: "Iran LiveUAMap",         url: "https://iran.liveuamap.com",                    color: "#2ecc71", desc: "Geolocated real-time conflict events across Iran" },
                { name: "NetBlocks",              url: "https://netblocks.org",                         color: "#3498db", desc: "Internet shutdown & connectivity monitoring" },
                { name: "Kpler Tanker Tracking",  url: "https://www.kpler.com",                         color: "#f5a623", desc: "Real-time tanker movements — confirm Kharg Island halt" },
                { name: "Bonbast (Rial rate)",    url: "https://www.bonbast.com",                       color: "#e74c3c", desc: "Iranian Rial black market exchange rate" },
                { name: "ISW Iran Updates",       url: "https://www.understandingwar.org/regions/iran", color: "#9b59b6", desc: "Daily control-of-terrain & regime stability analysis" },
                { name: "Iran International",     url: "https://www.iranintl.com/en",                  color: "#7b5ea7", desc: "Breaking news from inside Iran" },
                { name: "Vahid Online (Telegram)", url: "https://t.me/s/VahidOnline",                  color: "#2ca5e0", desc: "Most followed Iranian OSINT aggregator — verifies street-level footage" },
                { name: "Al-Monitor Iran",         url: "https://www.al-monitor.com/iran",              color: "#2e86ab", desc: "In-depth Iran analysis and diplomatic reporting" },
                { name: "RFE/RL Iran (Radio Farda)", url: "https://www.rferl.org/iran",                color: "#1a6496", desc: "US-funded Persian-language service — strong on protest coverage" },
                { name: "The Guardian Middle East", url: "https://www.theguardian.com/world/middleeast",color: "#005689", desc: "Independent Western reporting on regional escalation" },
              ].map(src => (
                <a key={src.name} href={src.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #111", textDecoration: "none" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: src.color, boxShadow: `0 0 6px ${src.color}`, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: src.color, fontWeight: 700, fontSize: 12 }}>{src.name}</div>
                    <div style={{ color: "#555", fontSize: 11 }}>{src.desc}</div>
                  </div>
                  <span style={{ color: "#333" }}>-&gt;</span>
                </a>
              ))}
            </div>
            {feedLoading && <div style={{ color: "#0f0", textAlign: "center", padding: 40, animation: "pulse 1s infinite" }}>FETCHING FEEDS...</div>}
            {feedError && !feedLoading && <div style={{ ...card, borderColor: "#e74c3c44", color: "#e74c3c" }}>⚠ {feedError}</div>}
            {!feedLoading && feedItems.filter(item => feedFilter === "flagged" ? item.classification : true).map(item => {
              const sc = item.classification ? SCENARIO_DEFS.find(s => s.id === item.classification.scenario) : null;
              return (
                <div key={item.id} style={{ ...card, borderLeft: `3px solid ${sc ? sc.color : "#1a1a1a"}`, background: sc ? `${sc.color}08` : "#0a0a0a", marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: sc ? "#fff" : "#aaa", textDecoration: "none", flex: 1, lineHeight: 1.5 }}>{item.title}</a>
                    <span style={{ color: item.source.color, fontSize: 10, background: `${item.source.color}18`, border: `1px solid ${item.source.color}33`, padding: "2px 6px", borderRadius: 2, flexShrink: 0 }}>{item.source.name}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                    <span style={{ color: "#444", fontSize: 10 }}>{item.date.toLocaleString()}</span>
                    {sc && <span style={{ color: sc.color, fontSize: 10, background: `${sc.color}18`, border: `1px solid ${sc.color}44`, padding: "2px 8px", borderRadius: 3 }}>⚡ {item.classification.label} → {sc.label}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ INDICATORS ══ */}
        {activeTab === "indicators" && (
          <div>
            {Object.entries(INDICATORS).map(([bucket, inds]) => (
              <div key={bucket} style={card}>
                <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12, textTransform: "uppercase" }}>{bucket} indicators</div>
                {inds.map(ind => {
                  const sc  = SCENARIO_DEFS.find(s => s.id === ind.scenario);
                  const isAi = aiAnalysis?.auto_indicators?.includes(ind.id);
                  return (
                    <div key={ind.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "8px 0", borderBottom: "1px solid #111", cursor: "pointer", opacity: checked[ind.id] ? 1 : 0.5 }} onClick={() => toggleIndicator(ind.id)}>
                      <div style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${sc?.color}`, background: checked[ind.id] ? sc?.color : "transparent", flexShrink: 0, marginTop: 1, boxShadow: checked[ind.id] ? `0 0 6px ${sc?.color}` : "none", transition: "all 0.2s" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ color: checked[ind.id] ? "#fff" : "#888" }}>
                          {ind.label}
                          {isAi && <span style={{ color: "#0f0", fontSize: 9, marginLeft: 8, background: "#0f022", border: "1px solid #0f04", padding: "1px 5px", borderRadius: 2 }}>AI DETECTED</span>}
                        </div>
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
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
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
                  <div style={{ background: "#0a200a", border: "1px solid #0f04", borderRadius: 4, padding: "8px 12px" }}>
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
            <div style={{ ...card, background: "#0a0500" }}>
              <div style={{ color: "#f5a623", fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>DEFECTION THRESHOLD GUIDE</div>
              <div style={{ color: "#888", fontSize: 12 }}>Artesh defections → <span style={{ color: "#2ecc71" }}>Regime Collapse +3</span> · IRGC fractures → <span style={{ color: "#e74c3c" }}>Military Junta +2</span><br />Click a unit to cycle: NOMINAL → CONCERNING → DEFECTED</div>
            </div>
            {MILITARY_UNITS.map(u => {
              const state = militaryRisk[u.unit] || "nominal";
              const sc = { nominal: "#555", concerning: "#f5a623", defected: "#e74c3c" };
              const bc = { Artesh: "#3498db", IRGC: "#e74c3c" };
              return (
                <div key={u.unit} style={{ ...card, cursor: "pointer", borderLeft: `3px solid ${sc[state]}`, opacity: state === "nominal" ? 0.6 : 1, transition: "all 0.2s" }} onClick={() => toggleMilitary(u.unit)}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
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
                <div key={trigger.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #111", cursor: "pointer" }} onClick={() => toggleEcon(trigger.id)}>
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
                    <span style={{ color: t.color }}>{t.label}</span><span style={{ color: t.color, fontWeight: 700 }}>{t.probability}%</span>
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
                placeholder="Record observations, source citations, time-stamped updates..."
                style={{ width: "100%", minHeight: 300, background: "#050505", color: "#0f0", border: "1px solid #0f04", borderRadius: 4, fontFamily: "monospace", fontSize: 12, padding: 12, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={card}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>CURRENT ASSESSMENT SUMMARY</div>
              {SCENARIOS.map(s => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #111", padding: "6px 0" }}>
                  <span style={{ color: s.color }}>{s.label}</span>
                  <span style={{ color: s.color, fontWeight: 700 }}>{s.probability}% {aiProbs ? "(Groq)" : "(static)"}</span>
                </div>
              ))}
              <div style={{ marginTop: 12, color: "#555", fontSize: 11 }}>
                Active indicators: {checkedCount}/{ALL_INDICATORS.length} · Econ triggers: {Object.values(econTriggers).filter(Boolean).length} · Military alerts: {Object.values(militaryRisk).filter(v => v !== "nominal").length} · AI analyses: {aiTriggerCount}
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
