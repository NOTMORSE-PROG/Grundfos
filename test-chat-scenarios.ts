import { getNextAction, detectEvalDomain } from "./src/lib/recommendation-engine";

// Each test mimics real-chat state: application from LLM/regex + evalDomain from detectEvalDomain
// application is set explicitly (as extractIntent would set it) — evalDomain is optional
const tests = [
  // HWR — "hot water" triggers DBS-HotWater via detectEvalDomain pattern
  { label: "HWR: hot water pump 1.6/2",   flow: 1.6,  head: 2.0,  app: "heating" as const, query: "hot water pump 1.6 m3/h 2m", expected: "UPS 15-40 130" },
  { label: "HWR: domestic hot water 0.45/1", flow: 0.45, head: 1.0, app: "domestic_water" as const, query: "domestic hot water 0.45 m3/h 1m", expected: "COMFORT 15-14 M" },
  { label: "HWR: hot water recirc 2.3/1.6", flow: 2.3, head: 1.6, app: "heating" as const, query: "hot water recirculation pump 2.3 m3/h 1.6m", expected: "UP 15-29 SU" },
  // HWR via flow-based inference (no hot-water keyword → head < 3m rule fires)
  { label: "HWR inferred by head<3: 1.6/2", flow: 1.6, head: 2.0, app: "heating" as const, query: "circulator 1.6 m3/h 2m", expected: "UPS 15-40 130" },
  // DBS-Heating — application="heating" + flow<6 + head≥3 → DBS-Heating inference
  { label: "DBS-Heating: 1.8/3.5",  flow: 1.8, head: 3.5, app: "heating" as const, query: "heating circulator 1.8 m3/h 3.5m", expected: "UPM2 K 15-40 130" },
  { label: "DBS-Heating: 2.5/4",    flow: 2.5, head: 4.0, app: "heating" as const, query: "home heating circulator 2.5 m3/h 4m", expected: "UPM3 AUTO 15-50 130" },
  { label: "DBS-Heating: 3.6/4.5",  flow: 3.6, head: 4.5, app: "heating" as const, query: "heating circulator 3.6 m3/h 4.5m", expected: "ALPHA2 32-80 180" },
  // WU — detectEvalDomain picks up natural language
  { label: "Borehole: 2/130",       flow: 2.0, head: 130, app: "water_supply" as const, query: "borehole pump 2 m3/h 130m", expected: "SQ 2-130 N" },
  { label: "Irrigation: 2/50",      flow: 2.0, head: 50,  app: "water_supply" as const, query: "irrigation pump 2 m3/h 50m for my farm", expected: "SP 2A-13" },
  // IN — detectEvalDomain picks up "industrial"
  { label: "Industrial: 3/6 (CR)",  flow: 3.0, head: 6.0, app: "water_supply" as const, query: "industrial pump 3 m3/h 6m", expected: "CR 5-5" },
  { label: "Industrial coolant: 2.5/13", flow: 2.5, head: 13.0, app: "water_supply" as const, query: "industrial coolant pump 2.5 m3/h 13m", expected: "MTH 2-4/2" },
  // CBS — application="heating" + flow≥15 → CBS inference (even without "commercial HVAC" keyword)
  { label: "CBS inferred by flow≥15: 35/10", flow: 35.0, head: 10.0, app: "heating" as const, query: "HVAC pump 35 m3/h 10m", expected: "MAGNA3 100-120 F" },
  { label: "CBS inferred: 30/12",    flow: 30.0, head: 12.0, app: "heating" as const, query: "HVAC pump 30 m3/h 12m", expected: "MAGNA1 100-120 F" },
  { label: "CBS via keyword: 35/10", flow: 35.0, head: 10.0, app: "heating" as const, query: "commercial HVAC pump 35 m3/h 10m", expected: "MAGNA3 100-120 F" },
];

let pass = 0, fail = 0;
for (const t of tests) {
  const domain = detectEvalDomain(t.query);
  const result = getNextAction({ evalDomain: domain, application: t.app, flow_m3h: t.flow, head_m: t.head });
  const top1 = result.pumps?.[0]?.model ?? "NO REC";
  const top3 = result.pumps?.slice(0, 3).map((p) => p.model) ?? [];
  const ok = top1 === t.expected;
  if (ok) pass++; else fail++;
  const mark = ok ? "✓" : "✗";
  console.log(`${mark} ${t.label.padEnd(44)} domain:${(domain ?? "none").padEnd(16)} → ${top1}${!ok ? `  (expected: ${t.expected})` : ""}`);
  if (!ok) console.log(`    top3: ${top3.join(", ")}`);
}
console.log(`\n${pass}/${pass+fail} passed`);
