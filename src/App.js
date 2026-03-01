import { useState, useEffect } from "react";

const SCENARIOS = [
  {
    id: "status_quo",
    label: "Status Quo / Continuity",
    color: "#f5a623",
    desc: "Assembly of Experts names new Supreme Leader within 48hrs",
    baseScore: 2,
  },
  {
    id: "military_junta",
    label: "Military Junta (IRGC)",
    color: "#e74c3c",
    desc: "IRGC declares State of Emergency; Artesh stays in barracks",
    baseScore: 3,
  },
  {
    id: "reform",
    label: "Controlled Reform",
    color: "#3498db",
    desc: "Appointment of Larijani / Council; release political prisoners",
    baseScore: 2,
  },
  {
    id: "collapse",
    label: "Regime Collapse",
    color: "#2ecc71",
    desc: "General-level defections; seizure of state TV by protesters",
    baseScore: 1,
  },
];

const INDICATORS = {
  security: [
    { id: "s1", label: "Security force defections observed", scenario: "collapse", weight: 3 },
    { id: "s2", label: "Artesh claims neutrality publicly", scenario: "collapse", weight: 3 },
    { id: "s3", label: "IRGC deploys to central Tehran districts", scenario: "military_junta", weight: 2 },
    { id: "s4", label: "Basij absent from neighbourhood checkpoints", scenario: "collapse", weight: 2 },
    { id: "s5", label: "Internet restored while protests active (NetBlocks)", scenario: "collapse", weight: 2 },
    { id: "s6", label: "IRGC / Artesh exchange fire or compete for state TV", scenario: "collapse", weight: 4 },
    { id: "s7", label: "Quds Force commanders recalled from Syria/Iraq", scenario: "military_junta", weight: 2 },
    { id: "s8", label: "65th Airborne Brigade issues neutrality statement", scenario: "collapse", weight: 3 },
    { id: "s9", label: "Air Force (IRIAF) pilots refuse sorties against civilians", scenario: "collapse", weight: 3 },
    { id: "s10", label: "IRGC declares formal State of Emergency", scenario: "military_junta", weight: 3 },
  ],
  institutional: [
    { id: "i1", label: "Assembly of Experts convenes quorum", scenario: "status_quo", weight: 3 },
    { id: "i2", label: "New Supreme Leader named within 48hrs", scenario: "status_quo", weight: 4 },
    { id: "i3", label: "AoE fails to reach quorum / forms council instead", scenario: "military_junta", weight: 3 },
    { id: "i4", label: "50-day election clock postponed indefinitely", scenario: "military_junta", weight: 2 },
    { id: "i5", label: "IRIB state media features Larijani as voice of reason", scenario: "reform", weight: 3 },
    { id: "i6", label: "Political prisoners released", scenario: "reform", weight: 2 },
    { id: "i7", label: "IRIB defections / anti-regime content broadcast", scenario: "collapse", weight: 3 },
    { id: "i8", label: "High-level sensitive leaks from factional infighting", scenario: "collapse", weight: 2 },
    { id: "i9", label: "Mojtaba Khamenei named to any leadership role", scenario: "military_junta", weight: 3 },
    { id: "i10", label: "Larijani chairs National Salvation Council", scenario: "reform", weight: 3 },
  ],
  external: [
    { id: "e1", label: "US State Dept uses term 'Provisional Government'", scenario: "collapse", weight: 4 },
    { id: "e2", label: "Reza Pahlavi invited for formal US/EU consultations", scenario: "collapse", weight: 4 },
    { id: "e3", label: "US establishes humanitarian corridors / Starlink drops", scenario: "collapse", weight: 3 },
    { id: "e4", label: "US sanctions relief for 'humanitarian purposes'", scenario: "reform", weight: 2 },
    { id: "e5", label: "Ceasefire or bombing pause announced", scenario: "reform", weight: 3 },
    { id: "e6", label: "US/Israel expand strikes to civilian infrastructure", scenario: "collapse", weight: 2 },
  ],
  economic: [
    { id: "ec1", label: "Kharg Island tanker loading halted (Kpler)", scenario: "collapse", weight: 4 },
    { id: "ec2", label: "Partial oil sector strike begins", scenario: "military_junta", weight: 2 },
    { id: "ec3", label: "Council for Oil Workers announces 'permanent halt'", scenario: "collapse", weight: 3 },
    { id: "ec4", label: "Tehran Grand Bazaar closes indefinitely", scenario: "collapse", weight: 3 },
    { id: "ec5", label: "Rial black market spikes >20% in single day (Bonbast)", scenario: "collapse", weight: 3 },
    { id: "ec6", label: "Utility workers strike / political blackouts", scenario: "collapse", weight: 2 },
    { id: "ec7", label: "South Pars gas field production halt", scenario: "collapse", weight: 3 },
  ],
};

const ALL_INDICATORS = Object.values(INDICATORS).flat();

const LEADERS = [
  {
    id: "mojtaba",
    name: "Mojtaba Khamenei",
    role: "Son of late Supreme Leader",
    scenario: "military_junta",
    color: "#e74c3c",
    trajectory: "Hardline Survival",
    powerBase: "IRGC & Basij networks cultivated over 20 years",
    strategy: "Hereditary theocracy — clerical shell with military governance",
    risk: "CRITICAL — accelerates civil war; violates anti-monarchical founding principles",
    signal: "Named to any formal leadership role by IRGC or AoE",
  },
  {
    id: "pahlavi",
    name: "Reza Pahlavi",
    role: "Exiled son of last Shah",
    scenario: "collapse",
    color: "#2ecc71",
    trajectory: "Total Regime Change",
    powerBase: "Iranian diaspora + domestic nostalgia; National Council of Iran",
    strategy: "Positions as unifier for secular democratic transition, not ruling king",
    risk: "MODERATE — requires sustained US backing and street momentum",
    signal: "US State Dept or EU Parliament invite for formal consultations",
  },
  {
    id: "larijani",
    name: "Ali Larijani",
    role: "Sec-Gen, Supreme National Security Council",
    scenario: "reform",
    color: "#3498db",
    trajectory: "Managed De-escalation",
    powerBase: "IRGC background + diplomatic reputation; bridges hardliners and West",
    strategy: "National Salvation Council — concessions to end bombing, preserve state",
    risk: "LOW-MODERATE — requires regime consensus that pure force has failed",
    signal: "IRIB features him prominently or he meets Artesh leadership publicly",
  },
];

const MILITARY_UNITS = [
  { region: "Tehran", unit: "65th Airborne Special Forces", branch: "Artesh", significance: "Elite unit; neutrality statement = regime imminent fall" },
  { region: "Tehran", unit: "16th Armored Division", branch: "Artesh", significance: "Controls main capital arteries" },
  { region: "Tehran", unit: "Mohammad Rasool-ollah Corps", branch: "IRGC", significance: "Primary IRGC unit for capital security" },
  { region: "Tabriz", unit: "21st Infantry Division", branch: "Artesh", significance: "Azeri ethnic faction — defection triggers regional revolt" },
  { region: "Mashhad", unit: "77th Infantry Division", branch: "Artesh", significance: "Guards holiest city — defection destroys religious legitimacy" },
  { region: "Air Force", unit: "IRIAF (All Bases)", branch: "Artesh", significance: "Air Force historically first to defect (1979 precedent)" },
  { region: "National", unit: "Basij Paramilitary", branch: "IRGC", significance: "Street fighters / neighborhood checkpoints — eyes & ears" },
  { region: "Foreign", unit: "Quds Force", branch: "IRGC", significance: "Recall from Syria/Iraq = cannibalising foreign influence" },
];

const ECON_THRESHOLDS = [
  { label: "Partial Oil Strike", probability: 30, color: "#f5a623", desc: "Reduced revenue; military pay over civil services prioritised" },
  { label: "Kharg Island Total Halt", probability: 70, color: "#e67e22", desc: "Regime loses 90% export cash; military pay threatened" },
  { label: "General Strike (Bazaar + Oil)", probability: 95, color: "#e74c3c", desc: "Total state paralysis; security forces defect within 7–14 days" },
];

const ECON_TRIGGERS = [
  { id: "partial_strike", label: "Partial Oil Sector Strike", color: "#f5a623", collapseAdd: 2, desc: "Council for Oil Contract Workers announces action at major sites" },
  { id: "kharg_halt", label: "Kharg Island Tanker Loading Halted", color: "#e67e22", collapseAdd: 4, desc: "90% of crude exports stopped — confirm via Kpler satellite" },
  { id: "south_pars", label: "South Pars Gas Field Halt", color: "#e67e22", collapseAdd: 3, desc: "Critical gas infrastructure production ceases" },
  { id: "bazaar_closed", label: "Tehran Grand Bazaar Closed Indefinitely", color: "#e74c3c", collapseAdd: 3, desc: "Merchant class abandons regime — historical parallel to 1979" },
  { id: "rial_spike", label: "Rial Black Market Spike >20% in One Day", color: "#e74c3c", collapseAdd: 3, desc: "Monitor: bonbast.com — soldier purchasing power collapse" },
  { id: "general_strike", label: "General Strike (Oil + Bazaar + Utilities)", color: "#c0392b", collapseAdd: 6, desc: "Total state paralysis — defection expected within 7–14 days" },
  { id: "utility_strike", label: "Utility Workers Strike / Political Blackouts", color: "#e74c3c", collapseAdd: 2, desc: "Surveillance infrastructure collapse begins" },
];

function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const s = window.localStorage.getItem(key);
      return s ? JSON.parse(s) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  }, [key, val]);
  return [val, setVal];
}

function GlowBar({ value, max, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ background: "#111", borderRadius: 4, height: 8, overflow: "hidden" }}>
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          boxShadow: `0 0 8px ${color}`,
          transition: "width 0.5s ease",
          borderRadius: 4,
        }}
      />
    </div>
  );
}

function ProbabilityRing({ value, color, label }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, value);
  const dash = (pct / 100) * c;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={100} height={100} viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={r} fill="none" stroke="#222" strokeWidth={8} />
        <circle
          cx={50} cy={50} r={r} fill="none"
          stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{
            transition: "stroke-dasharray 0.6s ease",
            filter: `drop-shadow(0 0 6px ${color})`,
          }}
        />
        <text
          x={50} y={54}
          textAnchor="middle"
          fill={color}
          style={{ fontSize: 18, fontFamily: "'Courier New', monospace", fontWeight: 700 }}
        >
          {Math.round(pct)}%
        </text>
      </svg>
      <span style={{ fontSize: 10, color: "#aaa", textAlign: "center", maxWidth: 90, fontFamily: "monospace" }}>
        {label}
      </span>
    </div>
  );
}

function Timestamp() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ fontFamily: "monospace", color: "#0f0", fontSize: 12 }}>
      {t.toUTCString()}
    </span>
  );
}

const cardStyle = {
  background: "#0a0a0a",
  border: "1px solid #1a1a1a",
  borderRadius: 6,
  padding: 16,
  marginBottom: 12,
};

const TABS = ["dashboard", "indicators", "leaders", "military", "economic", "notes"];

export default function App() {
  const [checked, setChecked] = useLocalStorage("iran_tmd_indicators", {});
  const [militaryRisk, setMilitaryRisk] = useLocalStorage("iran_tmd_military", {});
  const [econTriggers, setEconTriggers] = useLocalStorage("iran_tmd_econ", {});
  const [activeTab, setActiveTab] = useState("dashboard");
  const [notes, setNotes] = useLocalStorage("iran_tmd_notes", "");
  const [lastUpdate, setLastUpdate] = useLocalStorage("iran_tmd_lastupdate", null);

  function toggleIndicator(id) {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      setLastUpdate(new Date().toISOString());
      return next;
    });
  }

  function toggleMilitary(unit) {
    setMilitaryRisk((prev) => {
      const states = ["nominal", "concerning", "defected"];
      const cur = prev[unit] || "nominal";
      const next = states[(states.indexOf(cur) + 1) % states.length];
      return { ...prev, [unit]: next };
    });
  }

  function toggleEcon(id) {
    setEconTriggers((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Compute scores
  const scores = {};
  SCENARIOS.forEach((s) => { scores[s.id] = s.baseScore; });

  ALL_INDICATORS.forEach((ind) => {
    if (checked[ind.id]) {
      scores[ind.scenario] = (scores[ind.scenario] || 0) + ind.weight;
    }
  });

  Object.entries(militaryRisk).forEach(([unit, state]) => {
    const u = MILITARY_UNITS.find((m) => m.unit === unit);
    if (!u) return;
    if (state === "concerning") {
      if (u.branch === "Artesh") scores.collapse = (scores.collapse || 0) + 1;
      if (u.branch === "IRGC") scores.military_junta = (scores.military_junta || 0) + 1;
    }
    if (state === "defected") {
      if (u.branch === "Artesh") scores.collapse = (scores.collapse || 0) + 3;
      if (u.branch === "IRGC") scores.military_junta = (scores.military_junta || 0) + 2;
    }
  });

  ECON_TRIGGERS.forEach((t) => {
    if (econTriggers[t.id]) {
      scores.collapse = (scores.collapse || 0) + t.collapseAdd;
    }
  });

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const probabilities = {};
  SCENARIOS.forEach((s) => {
    probabilities[s.id] = Math.round((scores[s.id] / totalScore) * 100);
  });

  const leading = SCENARIOS.reduce((a, b) =>
    probabilities[a.id] > probabilities[b.id] ? a : b
  );

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const totalIndicators = ALL_INDICATORS.length;

  const tabStyle = (t) => ({
    padding: "8px 16px",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    border: "none",
    background: activeTab === t ? "#0f0" : "transparent",
    color: activeTab === t ? "#000" : "#0f0",
    borderBottom: activeTab === t ? "none" : "1px solid #0f0",
    transition: "all 0.2s",
  });

  return (
    <div style={{ background: "#050505", color: "#ccc", minHeight: "100vh", fontFamily: "'Courier New', monospace", fontSize: 13 }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #0f0", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ color: "#0f0", fontSize: 18, fontWeight: 700, letterSpacing: 3 }}>◈ IRAN TMF</div>
          <div style={{ color: "#555", fontSize: 10, letterSpacing: 2 }}>TRANSITION MONITORING FRAMEWORK — OPEN SOURCE INTELLIGENCE SIMULATION</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <Timestamp />
          <div style={{ color: "#555", fontSize: 10 }}>
            {checkedCount}/{totalIndicators} indicators active
            {lastUpdate && ` · last update ${new Date(lastUpdate).toLocaleTimeString()}`}
          </div>
        </div>
      </div>

      {/* Alert banner */}
      <div style={{ background: `${leading.color}18`, borderBottom: `1px solid ${leading.color}44`, padding: "8px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: leading.color, boxShadow: `0 0 10px ${leading.color}`, animation: "pulse 1.5s infinite" }} />
        <span style={{ color: leading.color, fontWeight: 700, letterSpacing: 1 }}>
          LEADING TRAJECTORY: {leading.label.toUpperCase()}
        </span>
        <span style={{ color: "#666", marginLeft: "auto" }}>{probabilities[leading.id]}% probability</span>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #0f0", overflowX: "auto" }}>
        {TABS.map((t) => (
          <button key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>{t}</button>
        ))}
      </div>

      <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>

        {/* DASHBOARD */}
        {activeTab === "dashboard" && (
          <div>
            <div style={cardStyle}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 16 }}>◈ SCENARIO PROBABILITY MATRIX</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 16, justifyItems: "center" }}>
                {SCENARIOS.map((s) => (
                  <ProbabilityRing key={s.id} value={probabilities[s.id]} color={s.color} label={s.label} />
                ))}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>◈ WEIGHTED SIGNAL SCORES</div>
              {SCENARIOS.map((s) => (
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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              {[
                { label: "Security Signals", items: INDICATORS.security, color: "#e74c3c" },
                { label: "Institutional Signals", items: INDICATORS.institutional, color: "#f5a623" },
                { label: "External Signals", items: INDICATORS.external, color: "#3498db" },
                { label: "Economic Signals", items: INDICATORS.economic, color: "#2ecc71" },
              ].map((b) => (
                <div key={b.label} style={{ ...cardStyle, marginBottom: 0 }}>
                  <div style={{ color: b.color, fontSize: 20, fontWeight: 700 }}>
                    {b.items.filter((i) => checked[i.id]).length}/{b.items.length}
                  </div>
                  <div style={{ color: "#666", fontSize: 10, letterSpacing: 1 }}>{b.label.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INDICATORS */}
        {activeTab === "indicators" && (
          <div>
            {Object.entries(INDICATORS).map(([bucket, inds]) => (
              <div key={bucket} style={cardStyle}>
                <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12, textTransform: "uppercase" }}>
                  ◈ {bucket} indicators
                </div>
                {inds.map((ind) => {
                  const sc = SCENARIOS.find((s) => s.id === ind.scenario);
                  return (
                    <div
                      key={ind.id}
                      style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "8px 0", borderBottom: "1px solid #111", cursor: "pointer", opacity: checked[ind.id] ? 1 : 0.5 }}
                      onClick={() => toggleIndicator(ind.id)}
                    >
                      <div style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${sc?.color || "#0f0"}`, background: checked[ind.id] ? sc?.color : "transparent", flexShrink: 0, marginTop: 1, boxShadow: checked[ind.id] ? `0 0 6px ${sc?.color}` : "none", transition: "all 0.2s" }} />
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

        {/* LEADERS */}
        {activeTab === "leaders" && (
          <div>
            {LEADERS.map((l) => (
              <div key={l.id} style={{ ...cardStyle, borderLeft: `3px solid ${l.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ color: l.color, fontSize: 16, fontWeight: 700 }}>{l.name}</div>
                    <div style={{ color: "#666", fontSize: 11 }}>{l.role}</div>
                  </div>
                  <div style={{ background: `${l.color}22`, border: `1px solid ${l.color}44`, padding: "4px 10px", borderRadius: 3, fontSize: 10, color: l.color }}>
                    TRAJECTORY: {l.trajectory.toUpperCase()}
                  </div>
                </div>
                <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                  {[["POWER BASE", l.powerBase], ["STRATEGY", l.strategy], ["RISK ASSESSMENT", l.risk]].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ color: "#555", fontSize: 10, letterSpacing: 1 }}>{k}</div>
                      <div style={{ color: "#bbb", marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                  <div style={{ background: "#0a200a", border: "1px solid #0f04", borderRadius: 4, padding: "8px 12px", marginTop: 4 }}>
                    <span style={{ color: "#0f0", fontSize: 10, letterSpacing: 1 }}>▶ CONFIRMATION SIGNAL: </span>
                    <span style={{ color: "#8f8" }}>{l.signal}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#555" }}>
                    Scenario probability: <span style={{ color: l.color, fontWeight: 700 }}>{probabilities[l.scenario]}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MILITARY */}
        {activeTab === "military" && (
          <div>
            <div style={{ ...cardStyle, background: "#0a0500", borderColor: "#333" }}>
              <div style={{ color: "#f5a623", fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>◈ DEFECTION THRESHOLD GUIDE</div>
              <div style={{ color: "#888", fontSize: 12 }}>
                Artesh (Regular Army) defections → <span style={{ color: "#2ecc71" }}>Regime Collapse score +3</span><br />
                IRGC fractures → <span style={{ color: "#e74c3c" }}>Military Junta score +2</span><br />
                Click a unit to cycle status: NOMINAL → CONCERNING → DEFECTED
              </div>
            </div>
            {MILITARY_UNITS.map((u) => {
              const state = militaryRisk[u.unit] || "nominal";
              const stateColors = { nominal: "#555", concerning: "#f5a623", defected: "#e74c3c" };
              const branchColors = { Artesh: "#3498db", IRGC: "#e74c3c" };
              return (
                <div
                  key={u.unit}
                  style={{ ...cardStyle, cursor: "pointer", borderLeft: `3px solid ${stateColors[state]}`, opacity: state === "nominal" ? 0.6 : 1, transition: "all 0.2s" }}
                  onClick={() => toggleMilitary(u.unit)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ color: "#ccc" }}>{u.unit}</div>
                      <div style={{ color: "#666", fontSize: 11 }}>{u.region}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ background: `${branchColors[u.branch]}22`, border: `1px solid ${branchColors[u.branch]}44`, color: branchColors[u.branch], padding: "2px 8px", borderRadius: 3, fontSize: 10 }}>{u.branch}</span>
                      <span style={{ background: `${stateColors[state]}22`, border: `1px solid ${stateColors[state]}`, color: stateColors[state], padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 700, boxShadow: state !== "nominal" ? `0 0 8px ${stateColors[state]}` : "none" }}>{state.toUpperCase()}</span>
                    </div>
                  </div>
                  <div style={{ color: "#555", fontSize: 11, marginTop: 6 }}>{u.significance}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ECONOMIC */}
        {activeTab === "economic" && (
          <div>
            <div style={cardStyle}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>◈ ECONOMIC KILL-SWITCH TRIGGERS</div>
              <div style={{ color: "#666", fontSize: 12, marginBottom: 16 }}>
                Toggle triggers as confirmed. Kharg Island halt = +4 to Collapse. General Strike = +6 to Collapse.
              </div>
              {ECON_TRIGGERS.map((trigger) => (
                <div
                  key={trigger.id}
                  style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderBottom: "1px solid #111", cursor: "pointer" }}
                  onClick={() => toggleEcon(trigger.id)}
                >
                  <div style={{ width: 18, height: 18, borderRadius: 3, border: `1px solid ${trigger.color}`, background: econTriggers[trigger.id] ? trigger.color : "transparent", boxShadow: econTriggers[trigger.id] ? `0 0 8px ${trigger.color}` : "none", flexShrink: 0, marginTop: 2, transition: "all 0.2s" }} />
                  <div>
                    <div style={{ color: econTriggers[trigger.id] ? "#fff" : "#888" }}>{trigger.label}</div>
                    <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>{trigger.desc}</div>
                    <div style={{ color: trigger.color, fontSize: 10, marginTop: 3 }}>Collapse score +{trigger.collapseAdd}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={cardStyle}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>◈ COLLAPSE PROBABILITY BY ECONOMIC STATE</div>
              {ECON_THRESHOLDS.map((t) => (
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

            <div style={cardStyle}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>◈ RECOMMENDED REAL-TIME SOURCES</div>
              {[
                ["Kpler", "Real-time tanker movement — confirm Kharg Island halt", "#3498db"],
                ["Bonbast.com", "Iranian Rial black market exchange rate tracker", "#e74c3c"],
                ["NetBlocks", "Internet connectivity — regime losing digital kill-switch", "#0f0"],
                ["NCRI (ncr-iran.org)", "Council for Oil Contract Workers announcements", "#f5a623"],
                ["ISW Iran Update", "Daily control-of-terrain analysis", "#9b59b6"],
                ["ACLED", "Armed Conflict Location & Event Data", "#3498db"],
                ["Critical Threats Project", "CTP-ISW Iran regime instability indicators", "#e74c3c"],
              ].map(([src, desc, color]) => (
                <div key={src} style={{ borderBottom: "1px solid #111", padding: "8px 0" }}>
                  <span style={{ color }}>{src}</span>
                  <span style={{ color: "#555", marginLeft: 12, fontSize: 11 }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* NOTES */}
        {activeTab === "notes" && (
          <div>
            <div style={cardStyle}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>◈ ANALYST NOTES</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Record observations, source citations, time-stamped intelligence updates..."
                style={{ width: "100%", minHeight: 300, background: "#050505", color: "#0f0", border: "1px solid #0f04", borderRadius: 4, fontFamily: "monospace", fontSize: 12, padding: 12, resize: "vertical", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={cardStyle}>
              <div style={{ color: "#0f0", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>◈ CURRENT ASSESSMENT SUMMARY</div>
              {SCENARIOS.map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #111", padding: "6px 0" }}>
                  <span style={{ color: s.color }}>{s.label}</span>
                  <span style={{ color: s.color, fontWeight: 700 }}>{probabilities[s.id]}%</span>
                </div>
              ))}
              <div style={{ marginTop: 12, color: "#555", fontSize: 11 }}>
                Active indicators: {checkedCount}/{totalIndicators} ·
                Economic triggers: {Object.values(econTriggers).filter(Boolean).length} ·
                Military alerts: {Object.values(militaryRisk).filter((v) => v !== "nominal").length}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #050505; }
        ::-webkit-scrollbar-thumb { background: #0f0; }
      `}</style>
    </div>
  );
}
