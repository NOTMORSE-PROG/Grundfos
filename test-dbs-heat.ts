import { extractIntent, getNextAction, detectEvalDomain } from "./src/lib/recommendation-engine";

const msg = "Residential heating circulator, dbs-heating. 2.5 m³/h 4m. Quiet/compact.";
const msgs = [{ role: "user", content: msg }];
const s = extractIntent(msgs);
const domain = detectEvalDomain(msg);

console.log("Extracted state:", {
  flow: s.flow_m3h,
  head: s.head_m,
  application: s.application,
  waterSource: s.waterSource,
  existingPumpBrand: s.existingPumpBrand,
  existingPump: s.existingPump,
  motor_kw: s.motor_kw,
});
console.log("Detected domain:", domain);

const result = getNextAction({ ...s, evalDomain: domain || undefined }, msg, undefined, {}, false, 1);
console.log("Action:", result.action);
console.log("questionContext:", result.questionContext);
console.log("Top pump:", result.pumps?.[0]?.model);
