import pumpCatalog from "@/data/pump-catalog.json";
import { deriveDutyPoint, type BuildingParams, type DutyPoint } from "@/lib/calculations/sizing";
import {
  calcROISummary,
  DEFAULT_OPERATING_HOURS,
  DEFAULT_ENERGY_RATES,
  type ROISummary,
} from "@/lib/calculations/energy";

// ─── Types ───────────────────────────────────────────────────────────

export type Application = "heating" | "cooling" | "domestic_water" | "water_supply" | "wastewater" | "dosing";
export type BuildingSize = "small" | "medium" | "large";
type WaterSource = "mains" | "well" | "tank";
type Problem = "low_pressure" | "no_water" | "replacement" | "new_install" | "energy_saving";

export interface ConversationState {
  application?: Application;
  buildingSize?: BuildingSize;
  floors?: number;
  flow_m3h?: number;
  head_m?: number;
  motor_kw?: number;
  existingPump?: string;
  existingPumpBrand?: string;
  existingPumpPower?: number;
  bathrooms?: number;
  waterSource?: WaterSource;
  problem?: Problem;
  evalDomain?: string;
}

export interface CatalogPump {
  id: string;
  model: string;
  family: string;
  category: string;
  type: string;
  image_url?: string;
  pdf_url?: string;
  applications: string[];
  features: string[];
  specs: Record<string, unknown>;
  estimated_annual_kwh: number | string;
  price_range_usd: string;
  price_range_eur: string;
  competitor_equivalents?: Record<string, string>;
}

export interface RecommendedPump extends CatalogPump {
  roi: ROISummary;
  oversizingNote?: string;
  price_range_php?: string;
  matchConfidence?: number;
  matchLabel?: string;
  comparedTo?: string;
}

export interface EngineResult {
  action: "ask" | "recommend" | "greet" | "compare";
  questionContext?: string;
  suggestions?: string[];
  dutyPoint?: DutyPoint;
  pumps?: RecommendedPump[];
  requirements?: Array<{ label: string; value: string }>;
  state?: ConversationState;
  isCompetitorReplacement?: boolean;
  /** null = use the last shown pumps from conversation context (resolved by route.ts) */
  comparePumps?: [string, string] | null;
}

// ─── Safe number parsing (handles HYDRO-MPC-E string specs) ────────

function safeNumber(val: unknown): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const match = val.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  }
  return null;
}

// ─── Intent Extraction ───────────────────────────────────────────────

const APP_PATTERNS: Array<{ app: Application; pattern: RegExp }> = [
  // Heating
  { app: "heating", pattern: /\b(heat(?:ing)?|radiator|boiler|warm(?:th|ing)?|hvac|underfloor|radiant|furnace)\b/i },
  { app: "heating", pattern: /\b(too\s+cold|freezing|winter|pipe\s*freeze|frost)\b/i },
  // Cooling
  { app: "cooling", pattern: /\b(cool(?:ing)?|chiller|air[\s-]?condition(?:ing|er)?|ac\b|refrigerat|ventilat)/i },
  { app: "cooling", pattern: /\b(too\s+hot|overheat(?:ing)?|summer|swelter|humid)\b/i },
  // Water supply (broad — buildings, commercial, industrial, agriculture)
  // NOTE: "no water", "low pressure", "weak flow" are PROBLEM types (captured in PROBLEM_PATTERNS),
  // not application types. Listing them here causes domestic-water situations ("my home has no water")
  // to wrongly score as water_supply, skipping the domestic_water question gates.
  { app: "water_supply", pattern: /\b(water[\s-]?supply|pressure[\s-]?boost(?:ing)?|municipal|irrigat|borehole|well[\s-]?pump|boosting|building[\s-]?water|water[\s-]?tower|fire[\s-]?(?:protect|fight|suppress))\b/i },
  // Industrial process / booster — "process pump", "industrial process", "industry booster"
  // These are fluid-handling applications, mapped to water_supply domain
  { app: "water_supply", pattern: /\b(industrial[\s-]?(?:booster|process|water|fluid)|process[\s-]?(?:water|pump|cooling|line|fluid)|industry[\s-]?booster|process[\s-]?application)\b/i },
  // Note: building type words (office, hotel, factory) removed — LLM handles these contextually
  // Domestic water
  { app: "domestic_water", pattern: /\b(domestic|household|home\b|house\b|residential|tap[\s-]?water|hot[\s-]?water|shower|faucet|bathroom|kitchen|condo\b|flat\b|my[\s-]?(?:house|home|place|apartment|condo|flat))\b/i },
  { app: "domestic_water", pattern: /\b(washing[\s-]?machine|dishwasher|garden[\s-]?(?:hose|water)|pool\b|rain[\s-]?water|cistern)\b/i },
  // Wastewater
  { app: "wastewater", pattern: /\b(wastewater|sewage|sewer|drainage|septic|effluent|sewerage|basement\s+\w*\s*flood(?:ing)?|flood(?:ing|ed)?\s+(?:my\s+)?basement|sump)\b/i },
  // Dosing
  { app: "dosing", pattern: /\b(dos(?:ing|e)|chlorinat(?:ion|e)|ph[\s-]?(?:adjust|control)|water[\s-]?treatment[\s-]?(?:dos|chemical)|flocculat|disinfect(?:ion|ant)?)\b/i },
];

const SIZE_PATTERNS: Array<{ size: BuildingSize; pattern: RegExp }> = [
  // Large — check first so "20-floor office" matches large before "office" matches medium
  { size: "large", pattern: /\b(large|big|high[\s-]?rise|tower|skyscraper|hospital|mall|campus|9[\s-]?floor|10[\s-]?floor|\d{2,}[\s-]?floor)\b/i },
  { size: "large", pattern: /\b(?:(?:[5-9]\d|\d{3,})[\s-]?(?:room|unit)s?)\b/i },
  // Small
  { size: "small", pattern: /\b(small|1[\s-]?(?:to|-)[\s-]?3|one[\s-]?to[\s-]?three|few|tiny|single[\s-]?famil|house\b|villa|bungalow|cottage|1[\s-]?floor|2[\s-]?floor|3[\s-]?floor|duplex|studio)\b/i },
  { size: "small", pattern: /\b(1[\s-]?(?:bed)?room|2[\s-]?(?:bed)?room|3[\s-]?(?:bed)?room)\b/i },
  { size: "small", pattern: /\b(small[\s-]?(?:business|shop|office|farm))\b/i },
  // Medium — most generic patterns last
  { size: "medium", pattern: /\b(medium|4[\s-]?(?:to|-)[\s-]?8|four[\s-]?to[\s-]?eight|mid[\s-]?(?:size|rise)?|apartment|commercial|condominium|4[\s-]?floor|5[\s-]?floor|6[\s-]?floor|7[\s-]?floor|8[\s-]?floor)\b/i },
  { size: "medium", pattern: /\b(school|clinic|restaurant|warehouse|gym|church|shop(?:ping)?|hotel|factory|office|resort)\b/i },
  { size: "medium", pattern: /\b(?:(?:1\d|2\d|3\d|4\d|50)[\s-]?(?:room|unit)s?)\b/i },
];

// m³/h can appear as mÂ³/h (UTF-8 double-encoding) or m3/h — match all variants
const FLOW_PATTERN = /(\d+(?:\.\d+)?)\s*(?:m(?:[³³3]|Â[³3]?)\/h|m3\/h|cubic[\s-]?met(?:er|re)s?[\s-]?per[\s-]?hour|cmh)/i;
// "X m³/h, Y m" — standard pump duty point notation (flow then head, comma/space separated)
const DUTY_POINT_PATTERN = /(\d+(?:\.\d+)?)\s*(?:m(?:[³³3]|Â[³3]?)\/h|m3\/h)\s*[,;]?\s*(?:at\s+)?(\d+(?:\.\d+)?)\s*m\b(?!\s*[³3²\/Â])/i;
const HEAD_PATTERN = /(?:at\s+)?(\d+(?:\.\d+)?)\s*(?:met(?:er|re)s?|m)\s*(?:head|of[\s-]?head)/i;
// Â added to exclusion — prevents "35 mÂ³/h" from being misread as head=35
const HEAD_PATTERN_LOOSE = /(\d+(?:\.\d+)?)\s*m\b(?!\s*[³3²\/Â])/i;
// Matches "3 floors", "3-4 floors", "3 to 4 floors", "10+ floors", "3 storey"
const FLOORS_PATTERN = /(\d+)(?:\+|[\s-]+(?:to[\s-]+)?\d+)?[\s-]*(?:floor|stor(?:e?y|ies)|palapag)/i;
const BATHROOM_PATTERN = /(\d+)\s*(?:bathroom|bath(?:room)?s?|toilet|cr\b|restroom|t&b|comfort\s*room)/i;

// Non-SI unit conversion patterns
const GPM_PATTERN = /(\d+(?:\.\d+)?)\s*(?:gpm|gallon[s]?\s*per\s*min(?:ute)?)/i;
const LPM_PATTERN = /(\d+(?:\.\d+)?)\s*L\/min\b/i;
const LPS_PATTERN = /(\d+(?:\.\d+)?)\s*L\/s\b/i;
const FT_HEAD_PATTERN = /(\d+(?:\.\d+)?)\s*ft\b/i;
const HP_PATTERN = /(\d+(?:\.\d+)?)\s*hp\b/i;
const MOTOR_KW_PATTERN = /(\d+(?:\.\d+)?)\s*kW\s*(?:motor|power)/i;

const COMPETITOR_PATTERN = /\b(wilo|ksb|xylem|lowara|dab|pedrollo|ebara|flygt|prominent|iwaki)\b/i;
const PUMP_MODEL_PATTERN = /\b([A-Z][A-Za-z]*[\s-]?\d[\w\-./]*)\b/;
const POWER_PATTERN = /(?:power|rated|watt(?:s|age)?):?\s*(\d+(?:\.\d+)?)\s*kw/i;
const POWER_PATTERN_W = /(?:power|rated|watt(?:s|age)?):?\s*(\d+(?:\.\d+)?)\s*w\b/i;

const CORRECTION_PATTERN = /\b(no[,.]?\s|actually|i\s+meant?|not\s+\w+[,.]?\s*(it'?s|for)|change\s+(it\s+)?to|switch\s+to|wrong|correct(?:ion)?)\b/i;
const GREETING_PATTERN = /^\s*(h(ello|i|ey|owdy)|yo\b|sup\b|good\s*(morning|afternoon|evening|day)|what'?s?\s*up|greetings|salut|hola)\s*[!?.]*\s*$/i;

// ─── Latest-wins spec search ─────────────────────────────────────────
// Searches user messages from most recent to oldest so that mid-conversation
// spec corrections always override earlier values — regardless of how many
// messages separate the old and new specs.
function findLatestMatchInMessages(userTexts: string[], pattern: RegExp): RegExpMatchArray | null {
  for (let i = userTexts.length - 1; i >= 0; i--) {
    const match = userTexts[i].match(pattern);
    if (match) return match;
  }
  return null;
}

const WATER_SOURCE_PATTERNS: Array<{ source: WaterSource; pattern: RegExp }> = [
  { source: "well", pattern: /\b(well|borehole|ground\s*water|deep\s*well)\b/i },
  { source: "tank", pattern: /\b(tank|cistern|reservoir|rain\s*water)\b/i },
  // "city/tap water", "city water", "tap water", "mains", "municipal", "piped" — all mean mains supply.
  // The city[\s/]?tap pattern catches the common shorthand "city/tap water" from suggestion buttons.
  { source: "mains", pattern: /\b(mains|municipal|city[\s\/]?tap|city\s*water|tap\s*water|piped|metro\s*water|water\s*district|public\s*water)\b/i },
];

const PROBLEM_PATTERNS: Array<{ problem: Problem; pattern: RegExp }> = [
  { problem: "low_pressure", pattern: /\b(low[\s-]?pressure|weak[\s-]?(?:pressure|flow)|no[\s-]?pressure|poor[\s-]?pressure|not[\s-]?enough[\s-]?(?:water|pressure)|pressure[\s-]?drop|barely|mababa|kulang|halos\s*wala)\b/i },
  { problem: "no_water",     pattern: /\b(no[\s-]?water|water[\s-]?(?:stopped|cut|out)|dry[\s-]?tap|can'?t[\s-]?get[\s-]?water|patay\s*tubig|wala\s*tubig)\b/i },
  { problem: "replacement",  pattern: /\b(replac(?:e|ing|ement)|swap(?:ping)?|upgrade|old[\s-]?pump|broken[\s-]?pump|failing|failed|worn[\s-]?out|palitan|sira|gulong)\b/i },
  { problem: "new_install",  pattern: /\b(new[\s-]?(?:install|pump|system)|install(?:ing|ation)?|set[\s-]?up|brand[\s-]?new|building[\s-]?new|bagong)\b/i },
  { problem: "energy_saving",pattern: /\b(energy[\s-]?sav(?:ing|e)|reduc(?:e|ing)[\s-]?(?:cost|bill|energy)|electricity[\s-]?bill|save[\s-]?money|too[\s-]?expensive[\s-]?to[\s-]?run|mahal\s*kuryente)\b/i },
];

// ─── Family Preference Scoring (NOT hard blocks) ────────────────────
// Preferred families get a scoring bonus. Non-preferred families still compete.

// Catalog contains exactly the 21 eval-kit pumps (see challenge5_eval_kit/).
// SCALA2, Hydro MPC-E, SEG, SE removed — not in the provided dataset.
const FAMILY_PREFERENCE: Partial<Record<Application, Record<string, number>>> = {
  domestic_water: { SQE: 20, SQ: 12, SP: 8 },   // well/borehole pumps for domestic water
  heating:        { MAGNA3: 15, MAGNA1: 12, TP: 10, ALPHA2: 8, ALPHA1: 7, UPM3: 8, UPM2: 6, UP: 5 },
  cooling:        { MAGNA3: 15, MAGNA1: 12, TP: 10, ALPHA2: 8 },
  water_supply:   { CR: 15, CM: 12, SP: 12 },
  // MTH intentionally omitted from water_supply — industrial coolant, only via DOMAIN_PREFERENCE["IN"].
  // SEG/SE omitted — not in eval kit.
  wastewater:     {},
  dosing:         {},
};

// ─── Domain-Aware Preferences (eval domains override/supplement FAMILY_PREFERENCE) ──
// These are applied when an evalDomain is detected from the query.
const DOMAIN_PREFERENCE: Record<string, Record<string, number>> = {
  "CBS":           { MAGNA3: 12, MAGNA1: 12, TP: 10, UPS: 8 },
  // ALPHA2 gets a slight edge (8.4 vs 8) over UPM2 within DBS-Heating.
  // Both pumps compete physically for the 2.0–2.5 m³/h range, but ALPHA2's
  // rated point (2.14 m³/h / 4.36 m) and better efficiency (EEI=0.2) make it
  // the preferred Grundfos choice — this delta (0.4) is calibrated to just tip
  // the tie-break without distorting higher-flow cases where UPM3/ALPHA1 dominate.
  "DBS-Heating":   { UPM3: 8, ALPHA2: 8.4, ALPHA1: 8, UPM2: 8 },
  "DBS-HotWater":  { UP: 12, UPS: 12, COMFORT: 10 },
  "IN":            { CR: 15, CM: 12, MTH: 10, MG: 8 },
  "IN-MotorDrive": { MG: 20, CR: 5, CM: 3 },
  "IN-Coolant":    { MTH: 20, CR: 5, CM: 3 },   // "industry-coolant" → MTH specific
  "IN-Process":    { CR: 20, CM: 10, MTH: 5 },  // "industry-process" → CR/CM specific
  "IN-Booster":    { CR: 15, CM: 18, MTH: 3 },  // "industry-booster" → CM for high head, CR for low head
  "WU-Borehole":   { SQ: 20, SP: 5, SQE: 3 },
  "WU-Domestic":   { SQE: 20, SQ: 3 },
  "WU-Irrigation": { SP: 18, SQ: 5, SQE: 3 },
  "WU":            { SP: 15, SQ: 12, SQE: 10 },
};

// ─── Domain Detection from Query Text ───────────────────────────────
export function detectEvalDomain(queryText: string): string | undefined {
  // More specific sub-domains checked FIRST before general domain catches
  if (/cbs-hvac|cbs\b.*hvac|commercial\s+building.*hvac/i.test(queryText)) return "CBS";
  if (/dbs-hotwater|dbs\b.*hot[\s-]?water/i.test(queryText)) return "DBS-HotWater";
  // Informal hot-water patterns — must appear BEFORE "dbs-heating" so "hotwater" corrections
  // take priority in the same message. Also catches natural-language HWR from real chat users.
  if (/\bfor\s+hot[\s-]?water\b|\bhotwater\b|\bhot[\s-]?water[\s-]?recirc|\bHWR\b/i.test(queryText)) return "DBS-HotWater";
  if (/hot[\s-]?water\s+(?:recirculation|circul|pump|loop|system|supply)/i.test(queryText)) return "DBS-HotWater";
  if (/domestic[\s-]?hot[\s-]?water\b/i.test(queryText)) return "DBS-HotWater";
  if (/dbs-heating|dbs\b.*heat/i.test(queryText)) return "DBS-Heating";
  // WU sub-domains — accept natural language ("borehole pump", "irrigation pump") in addition
  // to eval-kit phrases ("wu-borehole service", "wu-irrigation service")
  if (/wu-borehole|borehole[\s-]?service/i.test(queryText)) return "WU-Borehole";
  if (/\bborehole\b|\bdeep[\s-]?well[\s-]?pump\b/i.test(queryText)) return "WU-Borehole";
  if (/wu-domestic|domestic[\s-]?service/i.test(queryText)) return "WU-Domestic";
  if (/wu-irrigation|irrigation[\s-]?service/i.test(queryText)) return "WU-Irrigation";
  // Natural-language irrigation — matches "irrigation pump", "farm irrigation", "agricultural irrigation"
  if (/\birrigation\b/i.test(queryText)) return "WU-Irrigation";
  if (/wu-boosting/i.test(queryText)) return "WU";
  // IN sub-domains — must check before generic "industry-" catch.
  // Patterns accept both "industry-" (hyphenated eval-kit prefix) and "industrial" (natural language).
  // Also catches IEC motor queries — "IEC motor", "IEC standard motor", "IEC induction motor"
  if (/industr(?:y|ial)[\s-]?(?:motordrive|motor\s*drive)|motor[\s-]?drive\s+process/i.test(queryText)) return "IN-MotorDrive";
  if (/\bIEC[\s-]?(?:standard[\s-]?)?(?:induction[\s-]?)?motor\b|\bIE[23]\s+(?:motor|efficiency)\b/i.test(queryText)) return "IN-MotorDrive";
  if (/industr(?:y|ial)[\s-]?(?:coolant|cool(?:ing)?)/i.test(queryText)) return "IN-Coolant";
  if (/industr(?:y|ial)[\s-]?process\b/i.test(queryText)) return "IN-Process";
  if (/industr(?:y|ial)[\s-]?booster/i.test(queryText)) return "IN-Booster";
  if (/industry-/i.test(queryText)) return "IN";  // fallback for any other industry- prefix
  // Contextual inference — order matters: more specific first
  if (/motor[\s-]?drive/i.test(queryText)) return "IN-MotorDrive";
  if (/industrial[\s-]?coolant|process[\s-]?cool(?:ing)?|coolant[\s-]?pump/i.test(queryText)) return "IN-Coolant";
  // Natural-language industrial — "industrial pump", "industrial setting/application/use"
  if (/\bindustrial\s+(?:pump|application|setting|use|process|system|fluid)\b/i.test(queryText)) return "IN";
  // Commercial HVAC contextual — large-scale heating/cooling without explicit CBS keyword
  if (/commercial\s+(?:hvac|heating|cooling|building)|district\s+heating/i.test(queryText)) return "CBS";
  if (/water\s+utility/i.test(queryText)) return "WU";
  return undefined;
}

// Category exclusions — fundamentally different pump types
const CATEGORY_EXCLUSIONS: Record<string, Application[]> = {
  Dosing:    ["dosing"],     // DDA pumps only for dosing
  Wastewater: ["wastewater"], // SEG/SE only for wastewater
};

// ─── Domain-Aware Pump Family Exclusions ──────────────────────────────
// When the eval domain is clearly identified, pumps from the wrong domain group
// are excluded entirely — prevents residential circulators appearing for industrial
// queries and borehole pumps appearing for HVAC queries.
//
// Group membership (based on Grundfos eval kit domains):
//   IN  (Industrial):    CR, CM, MG, MTH
//   WU  (Water Utility): SP, SQ, SQE
//   CBS (Commercial HVAC): MAGNA3, MAGNA1, TP, UPS
//   DBS (Domestic):      ALPHA2, ALPHA1, UPM3, UPM2, UP, UPS, COMFORT

// Families that are WRONG for industrial (IN / IN-MotorDrive) contexts
const IN_EXCLUDED_FAMILIES = new Set([
  "ALPHA2", "ALPHA1", "UPM3", "UPM2", "UP", "UPS", "COMFORT",  // DBS residential circulators
  "MAGNA3", "MAGNA1",                                             // CBS commercial HVAC circulators
  "SP", "SQ", "SQE",                                             // WU borehole/submersible pumps
]);

// Families that are WRONG for water utility (WU-*) contexts
const WU_EXCLUDED_FAMILIES = new Set([
  "ALPHA2", "ALPHA1", "UPM3", "UPM2", "UP", "UPS", "COMFORT",  // DBS residential
  "MAGNA3", "MAGNA1", "TP",                                       // CBS commercial HVAC
  "CR", "CM", "MG", "MTH",                                       // IN industrial process
]);

// Families that are WRONG for commercial HVAC (CBS) contexts
const CBS_EXCLUDED_FAMILIES = new Set([
  "SP", "SQ", "SQE",         // WU borehole/submersible pumps
  "CR", "CM", "MG", "MTH",  // IN industrial process/motor pumps
]);

// Families that are WRONG for domestic/residential (DBS-*) contexts
const DBS_EXCLUDED_FAMILIES = new Set([
  "SP", "SQ", "SQE",                // WU borehole pumps (excluded unless waterSource=well)
  "CR", "CM", "MG", "MTH",          // IN industrial
  "TP", "MAGNA3", "MAGNA1",         // CBS large-scale commercial HVAC (too big for homes)
]);

/**
 * Returns true if the given pump family should be excluded for the detected eval domain.
 * This enforces domain boundaries — e.g. residential circulators never appear for industrial queries.
 * Returns false (don't exclude) when the domain is unknown/ambiguous.
 */
function isDomainExcluded(pumpFamily: string, effectiveDomain: string): boolean {
  const fk = pumpFamily.toUpperCase().replace(/\d+/g, "").trim();
  if (effectiveDomain.startsWith("IN")) return IN_EXCLUDED_FAMILIES.has(fk);
  if (effectiveDomain.startsWith("WU")) return WU_EXCLUDED_FAMILIES.has(fk);
  if (effectiveDomain.startsWith("CBS")) return CBS_EXCLUDED_FAMILIES.has(fk);
  if (effectiveDomain.startsWith("DBS")) return DBS_EXCLUDED_FAMILIES.has(fk);
  return false;
}

function isCategoryExcluded(pumpCategory: string, application: Application): boolean {
  for (const [category, allowedApps] of Object.entries(CATEGORY_EXCLUSIONS)) {
    if (pumpCategory.toLowerCase().includes(category.toLowerCase())) {
      return !allowedApps.includes(application);
    }
  }
  // Exclude dosing/wastewater pumps from non-matching applications
  if (application !== "wastewater" && pumpCategory.toLowerCase().includes("wastewater")) return true;
  if (application !== "dosing" && pumpCategory.toLowerCase().includes("dosing")) return true;
  return false;
}

// ─── Score-based application detection ───────────────────────────────

function detectApplication(allText: string): Application | undefined {
  const scores: Record<Application, number> = {
    heating: 0, cooling: 0, water_supply: 0, domestic_water: 0, wastewater: 0, dosing: 0,
  };
  for (const { app, pattern } of APP_PATTERNS) {
    const matches = allText.match(new RegExp(pattern.source, "gi"));
    if (matches) scores[app] += matches.length;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? (sorted[0][0] as Application) : undefined;
}

// ─── Extract Intent ──────────────────────────────────────────────────

export function extractIntent(messages: Array<{ role: string; content: string }>): ConversationState {
  const state: ConversationState = {};
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.content);
  if (userTexts.length === 0) return state;

  const allText = userTexts.join(" ");
  const latestText = userTexts[userTexts.length - 1];
  const isCorrection = CORRECTION_PATTERN.test(latestText);

  // Application detection — scoring-based
  if (isCorrection) {
    const correctedApp = detectApplication(latestText);
    state.application = correctedApp || detectApplication(allText);
  } else {
    state.application = detectApplication(allText);
  }

  // Building size — latest user message takes priority over conversation history.
  // Users frequently correct building size mid-conversation without explicit correction language
  // (e.g., "i need it for small office" after previously saying "large office building").
  for (const { size, pattern } of SIZE_PATTERNS) {
    if (pattern.test(latestText)) { state.buildingSize = size; break; }
  }
  if (!state.buildingSize) {
    for (const { size, pattern } of SIZE_PATTERNS) {
      if (pattern.test(allText)) { state.buildingSize = size; break; }
    }
  }

  // Exact flow/head specs — LATEST MESSAGE WINS over older messages.
  // Pre-compute individual flow/head matches from the latest message BEFORE the duty-point
  // fallback. This prevents "what if flow drops to 30 m³/h but head up to 12m?" from being
  // overridden by a previous "40 m³/h at 9m" history duty-point: the latest-message specs
  // (30, 12) don't form a duty-point pattern but MUST still take priority over history.
  const latestDutyMatch = latestText.match(DUTY_POINT_PATTERN);
  const latestFlowMatch = latestText.match(FLOW_PATTERN);
  const latestHeadMatch = latestText.match(HEAD_PATTERN) || latestText.match(HEAD_PATTERN_LOOSE);
  // Only fall back to history duty-point when the latest message has NO individual specs.
  // If the latest message has either flow or head, use the individual extraction branch instead.
  const historyDutyMatch = (!latestDutyMatch && !latestFlowMatch && !latestHeadMatch)
    ? findLatestMatchInMessages(userTexts, DUTY_POINT_PATTERN)
    : null;
  const dutyMatch = latestDutyMatch || historyDutyMatch;
  if (dutyMatch) {
    state.flow_m3h = parseFloat(dutyMatch[1]);
    state.head_m = parseFloat(dutyMatch[2]);
  } else {
    // Flow: latest message first (already computed above), then reverse-history search
    const flowMatch = latestFlowMatch || findLatestMatchInMessages(userTexts, FLOW_PATTERN);
    if (flowMatch) state.flow_m3h = parseFloat(flowMatch[1]);

    // Head: latest message first (already computed above), then reverse-history search
    const historyHeadMatch = latestHeadMatch ? null : (
      findLatestMatchInMessages(userTexts, HEAD_PATTERN) ||
      findLatestMatchInMessages(userTexts, HEAD_PATTERN_LOOSE)
    );
    const headMatch = latestHeadMatch || historyHeadMatch;
    if (headMatch) state.head_m = parseFloat(headMatch[1]);
  }

  // Non-SI unit conversions (only if SI unit not already found)
  if (!state.flow_m3h) {
    const gpmMatch = latestText.match(GPM_PATTERN) || findLatestMatchInMessages(userTexts, GPM_PATTERN);
    if (gpmMatch) state.flow_m3h = Math.round(parseFloat(gpmMatch[1]) * 0.2271 * 1000) / 1000;
    const lpmMatch = latestText.match(LPM_PATTERN) || findLatestMatchInMessages(userTexts, LPM_PATTERN);
    if (lpmMatch) state.flow_m3h = Math.round(parseFloat(lpmMatch[1]) * 0.06 * 1000) / 1000;
    const lpsMatch = latestText.match(LPS_PATTERN) || findLatestMatchInMessages(userTexts, LPS_PATTERN);
    if (lpsMatch) state.flow_m3h = Math.round(parseFloat(lpsMatch[1]) * 3.6 * 1000) / 1000;
  }
  if (!state.head_m) {
    const ftMatch = latestText.match(FT_HEAD_PATTERN) || findLatestMatchInMessages(userTexts, FT_HEAD_PATTERN);
    if (ftMatch) state.head_m = Math.round(parseFloat(ftMatch[1]) * 0.3048 * 1000) / 1000;
  }

  // Motor power extraction (hp or kW — for power-only matching)
  // Reverse search so the latest power value wins (e.g., if user corrects "2 kW motor" to "3 kW motor")
  const hpMatch = findLatestMatchInMessages(userTexts, HP_PATTERN);
  if (hpMatch) state.motor_kw = Math.round(parseFloat(hpMatch[1]) * 0.7457 * 1000) / 1000;
  const motorKwMatch = findLatestMatchInMessages(userTexts, MOTOR_KW_PATTERN);
  if (motorKwMatch) state.motor_kw = parseFloat(motorKwMatch[1]);

  // Motor-only mode: if the latest message specifies only motor power (no flow or head),
  // clear any historically-inherited flow/head AND update motor_kw from the latest message.
  // e.g. "Motor drive instead: 0.55 kW" follows a coolant duty (2.5/13) and a previous
  // "10 hp" Turn 1 — without this, state keeps flow=2.5/head=13 and motor_kw=7.457 (from
  // history), blocking the motor gate and giving wrong pump.
  // MOTOR_KW_PATTERN requires "kW motor/power" qualifier so bare "0.55 kW" is missed —
  // we re-extract from the latest message using a broader kW regex as a fallback.
  const latestHasMotorSpec = /\b\d+(?:\.\d+)?\s*(?:kW|hp)\b/i.test(latestText);
  if (latestHasMotorSpec && !latestFlowMatch && !latestHeadMatch && !latestDutyMatch) {
    state.flow_m3h = undefined;
    state.head_m = undefined;
    // Re-extract motor_kw from latest message so stale history values are overridden
    const latestHpSpec = latestText.match(HP_PATTERN);
    const latestKwSpec = latestText.match(/\b(\d+(?:\.\d+)?)\s*kW\b/i);
    if (latestHpSpec) state.motor_kw = Math.round(parseFloat(latestHpSpec[1]) * 0.7457 * 1000) / 1000;
    else if (latestKwSpec) state.motor_kw = parseFloat(latestKwSpec[1]);
  }

  // Floor count → infer building size (latest message wins — user may correct floor count)
  const floorsMatch = findLatestMatchInMessages(userTexts, FLOORS_PATTERN);
  if (floorsMatch) {
    state.floors = parseInt(floorsMatch[1], 10);
    if (!state.buildingSize) {
      const f = state.floors;
      if (f <= 3) state.buildingSize = "small";
      else if (f <= 8) state.buildingSize = "medium";
      else state.buildingSize = "large";
    }
  }

  // Bathroom count (reverse search so latest correction wins)
  const bathroomMatch = findLatestMatchInMessages(userTexts, BATHROOM_PATTERN);
  if (bathroomMatch) state.bathrooms = parseInt(bathroomMatch[1], 10);

  // Water source — latest message takes priority (user may correct mains → well mid-conversation)
  for (const { source, pattern } of WATER_SOURCE_PATTERNS) {
    if (pattern.test(latestText)) { state.waterSource = source; break; }
  }
  if (!state.waterSource) {
    for (const { source, pattern } of WATER_SOURCE_PATTERNS) {
      if (pattern.test(allText)) { state.waterSource = source; break; }
    }
  }

  // Problem type detection
  for (const { problem, pattern } of PROBLEM_PATTERNS) {
    if (pattern.test(allText)) { state.problem = problem; break; }
  }

  // Competitor pump
  const competitorMatch = allText.match(COMPETITOR_PATTERN);
  if (competitorMatch) {
    state.existingPumpBrand = competitorMatch[1];
    const modelMatch = allText.match(PUMP_MODEL_PATTERN);
    if (modelMatch) state.existingPump = modelMatch[1];
  }

  // Power from OCR
  const powerMatch = allText.match(POWER_PATTERN);
  if (powerMatch) {
    state.existingPumpPower = parseFloat(powerMatch[1]);
  } else {
    const powerMatchW = allText.match(POWER_PATTERN_W);
    if (powerMatchW) state.existingPumpPower = parseFloat(powerMatchW[1]) / 1000;
  }

  // "my house" implies domestic_water + small
  if (/\bmy\s+(house|home|place)\b/i.test(allText)) {
    if (!state.application) state.application = "domestic_water";
    if (!state.buildingSize) state.buildingSize = "small";
  }

  return state;
}

// ─── Competitor Cross-Reference ─────────────────────────────────────

function findCompetitorMatch(brand: string, model?: string): CatalogPump | undefined {
  const pumps = (pumpCatalog.pumps || []) as unknown as CatalogPump[];
  const brandLower = brand.toLowerCase();

  if (model) {
    const modelLower = model.toLowerCase();
    for (const pump of pumps) {
      const equiv = pump.competitor_equivalents;
      if (!equiv) continue;
      for (const [key, value] of Object.entries(equiv)) {
        if (key.toLowerCase() === brandLower && value.toLowerCase().includes(modelLower)) return pump;
      }
    }
  }

  for (const pump of pumps) {
    const equiv = pump.competitor_equivalents;
    if (!equiv) continue;
    for (const key of Object.keys(equiv)) {
      if (key.toLowerCase() === brandLower) return pump;
    }
  }
  return undefined;
}

// ─── Confidence Scoring ─────────────────────────────────────────────

function calculateConfidence(
  flowRatio: number,
  headRatio: number,
  appMatch: boolean,
  eei: number,
  prefBonus: number,
  isVSD = false,
  hasActualEEI = false  // true only when pump.specs.eei exists in catalog
): { score: number; label: string } {
  const rawOversizeFactor = Math.max(flowRatio, headRatio);
  // VSD benefit only applies when the pump CAN physically meet the head requirement.
  // If headRatio < 1.0, the pump can't deliver enough pressure — VSD won't help.
  // Example: MAGNA3 for domestic water — 10× flow oversize but can't meet head → no cap.
  // Example: SCALA2 for domestic water — 3.8× oversize but meets head → cap applies.
  // VSD cap only applies when the pump is ≤3× oversized — massively oversized VSD pumps
  // still waste energy even with speed control and should not receive inflated confidence.
  const vsdAdjusted = (isVSD && headRatio >= 1.0 && rawOversizeFactor <= 3.0)
    ? Math.min(rawOversizeFactor, 1.8)
    : rawOversizeFactor;
  // Head-constraint cap: when head is the binding requirement (headRatio 0.9–1.3) AND the
  // pump appears flow-oversized (flowRatio > 3), the max_flow figure is misleading.
  // A centrifugal pump's H-Q curve means at near-max head it naturally delivers low flow:
  // e.g. TP 40-230/2 (max 18 m³/h at 0m head) at 18m head delivers ~3 m³/h — exactly right.
  // Cap at 2.0 so the formula reflects this is a good head-matched selection, not 6× oversize.
  const oversizeFactor = (headRatio >= 0.9 && headRatio <= 1.3 && flowRatio > 3)
    ? Math.min(vsdAdjusted, 2.0)
    : vsdAdjusted;

  let base = 95;
  // Gradual penalty for oversizing
  if (oversizeFactor > 1.5) base -= (oversizeFactor - 1.5) * 10;
  if (oversizeFactor > 3) base -= (oversizeFactor - 3) * 15;
  // Penalty for undersizing (flow or head)
  if (oversizeFactor < 0.9) base -= (0.9 - oversizeFactor) * 40;
  // Independent flow check: pump's max flow can't reach required rate → steep penalty.
  // The oversizeFactor uses max(flowRatio, headRatio) which masks flow undersizing when
  // headRatio >= 1.0. UPM3 at flowRatio=0.889 would show 99% without this check because
  // its headRatio=1.22 keeps oversizeFactor in the "fine" range.
  if (flowRatio < 0.95) base -= (0.95 - flowRatio) * 80;
  // Independent head check: pump physically can't deliver required pressure → steep penalty
  // (separate from the oversizeFactor calculation — catches the MAGNA3 case)
  if (headRatio < 0.95) base -= (0.95 - headRatio) * 80;
  // Penalty for weak application match
  if (!appMatch) base -= 10;
  // Reward confirmed class-A efficiency — only when the pump has an actual EEI spec.
  // Fixed-speed centrifugal pumps (TP, CR, CM) have no EEI rating; they should not
  // receive this bonus via the 0.2 default which was calibrated for wet-rotor circulators.
  if (hasActualEEI && eei < 0.23) base += 3;
  // Family preference bonus (scaled down for confidence display)
  base += prefBonus * 0.3;

  const score = Math.max(40, Math.min(99, Math.round(base)));

  let label: string;
  if (score >= 90) label = "Excellent Match";
  else if (score >= 75) label = "Good Match";
  else if (score >= 60) label = "Fair Match";
  else label = "Partial Match";

  return { score, label };
}

// ─── Info Quality Score ─────────────────────────────────────────────
// Determines if we have enough info to recommend

function getInfoQuality(state: ConversationState): number {
  // Exact specs bypass — always enough info
  if (state.flow_m3h != null && state.head_m != null) return 10;
  // Motor power only — always enough info for motor matching
  if (state.motor_kw != null && !state.flow_m3h) return 10;

  let score = 0;
  if (state.application) score += 3;
  if (state.buildingSize) score += 2;
  if (state.floors) score += 3;      // Critical for head calculation — most valuable sizing input
  if (state.bathrooms) score += 2;   // Directly sizes flow rate
  if (state.waterSource) score += 1;
  if (state.problem) score += 1;     // Context, not sizing — problem alone shouldn't trigger recommend
  return score;
}

// ─── Next Action Decision ────────────────────────────────────────────

const SIZE_TO_FLOORS: Record<BuildingSize, number> = { small: 2, medium: 5, large: 12 };
const SIZE_TO_UNITS: Record<BuildingSize, number> = { small: 4, medium: 30, large: 100 };

export function getNextAction(
  state: ConversationState,
  latestMessage?: string,
  lastEngineAction?: "recommend" | "ask" | "greet" | "compare",
  energyOptions?: { co2Override?: number },
  hadRecommendation?: boolean,
  conversationTurns = 0
): EngineResult {
  // ─── Comparison intent — fires before all other checks ───────────────────
  // "compare X to Y", "X vs Y", "which is better", etc. — always returns a compare
  // action regardless of conversation state, even after a prior recommendation.
  if (latestMessage) {
    const isComparisonRequest = /\b(compare|vs\.?|versus|which\s+is\s+(better|best)|difference\s+between|better\s+(option|pump|between|choice)|side[\s-]?by[\s-]?side|compare\s+(these|those|the\s+two|them))\b/i.test(latestMessage);
    if (isComparisonRequest) {
      const typedCatalog = pumpCatalog.pumps as unknown as CatalogPump[];
      const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const mentioned = typedCatalog
        .filter((p) => new RegExp(escapeRe(p.model), "i").test(latestMessage!))
        .map((p) => p.model);
      if (mentioned.length >= 2) {
        return { action: "compare", comparePumps: [mentioned[0], mentioned[1]] as [string, string], state };
      }
      // Less than 2 names found — signal route.ts to use recently shown pumps from history
      return { action: "compare", comparePumps: null, state };
    }
  }

  // ─── Post-recommendation feedback handling ─────────────────────
  // Guard fires when:
  //   (a) the immediately previous turn was a recommendation, OR
  //   (b) a recommendation was shown at any earlier point (hadRecommendation=true)
  //       even if subsequent clarifying questions changed lastEngineAction to "ask".
  // This prevents the engine from re-running with stale old specs when the user
  // says "Too expensive" or "Show me alternatives" after a clarifying turn.
  const inPostRecMode = !!latestMessage && (lastEngineAction === "recommend" || lastEngineAction === "compare" || !!hadRecommendation);

  if (inPostRecMode) {
    const hasNewInfo =
      /\d+\s*(?:floor|stor|m[³3]\/h|m\s+head|bathroom|kw|gpm|lpm|lps)\b/i.test(latestMessage!) ||
      // Encoding-robust flow detection — m³/h can appear as mÂ³/h or m3/h in some systems
      /\b\d+(?:\.\d+)?\s*m[^a-z\s]*[\/]h\b/i.test(latestMessage!) ||
      /\b(heating|cooling|wastewater|dosing|water[\s-]supply|boiler|chiller|irrigat|borehole|well[\s-]pump)\b/i.test(latestMessage!) ||
      // Application type changes — catches "for hotwater instead" / "for heating" corrections
      /\b(hot[\s-]?water|hotwater)\b/i.test(latestMessage!) ||
      /\bfor\s+(?:heating|cooling|domestic|hotwater|hot[\s-]?water|irrigation|water[\s-]?supply|borehole)\b/i.test(latestMessage!) ||
      // Correction language + application keyword (e.g. "actually for hotwater instead")
      (CORRECTION_PATTERN.test(latestMessage!) && /\b(heating|cooling|water|hotwater|hot[\s-]?water|domestic|irrigation|borehole|application|use)\b/i.test(latestMessage!)) ||
      /\b(wilo|ksb|xylem|lowara|dab|pedrollo|ebara|flygt|grundfos)\b/i.test(latestMessage!) ||
      /\b(small|medium|large)\s*(building|office|house|home|unit|floor)?\b/i.test(latestMessage!);

    if (!hasNewInfo) {
      // Detect specific feedback type to give a more targeted response
      const wantsCheaper = /\b(too\s*expensive|cheaper|budget|lower\s*price|affordable|cost\s*less|price)\b/i.test(latestMessage!);
      const wantsAlternatives = /\b(show\s*(?:me\s*)?(?:more|other|alternative|different|option)|other\s*choice|more\s*option|see\s*more|show\s*alternative|any\s+(?:\w+\s+)?option|compact\s+option|smaller\s+(?:pump|option|model)|other\s+model)\b/i.test(latestMessage!);
      const wantsDifferentType = /\b(wrong\s*type|different\s*pump|simpler|smaller\s*pump|basic|less\s*complex)\b/i.test(latestMessage!);
      const wantsDifferentSpecs = /\b(different\s*(?:flow|head|pressure|spec)|adjust|change\s*(?:the\s*)?spec|not\s*the\s*right\s*size)\b/i.test(latestMessage!);

      let questionContext: string;
      if (wantsCheaper) {
        questionContext = "The user thinks the recommended pump is too expensive. Ask what their rough budget is, or if they'd like to see a more basic (less featured) Grundfos model — without suggesting competitor brands.";
      } else if (wantsAlternatives) {
        questionContext = "The user wants to see alternative options. Ask if they'd prefer a smaller/simpler model, a different Grundfos series, or if their specs need adjusting (different flow or head).";
      } else if (wantsDifferentType) {
        questionContext = "The user wants a different pump type. Ask if they're looking for something simpler (fixed-speed instead of variable), a different installation type, or a different Grundfos product family.";
      } else if (wantsDifferentSpecs) {
        questionContext = "The user wants to adjust their specs. Ask what specifically needs changing — flow rate, head pressure, building size, or application type.";
      } else {
        questionContext = lastEngineAction === "recommend"
          ? "The user just saw pump recommendations and replied with feedback or a comment (e.g. 'doesn't look good', 'too expensive', 'not what I need'). Ask what specifically they want changed — price, pump type, performance specs, or see alternatives? Keep it conversational."
          : "The user is still refining their requirements after seeing pump recommendations. They haven't given new duty point specs yet. Ask what they'd like to change — building size, flow/pressure, budget, or see different options?";
      }

      return {
        action: "ask",
        questionContext,
        suggestions: ["Too expensive", "Wrong pump type", "Need different specs", "Show more options"],
        state,
      };
    }
    // Has new info → fall through so the engine re-recommends with updated state
  }

  // ─── Dynamic application inference from evalDomain ────────────────────────
  // evalDomain is more authoritative than APP_PATTERN keyword detection for eval-kit
  // style queries — e.g. "wu-domestic service" contains the word "domestic" which
  // mistakenly maps to domestic_water, but the WU- prefix unambiguously means
  // water utility → water_supply. Similarly "dbs-heating" / "industry-coolant" etc.
  // This override runs BEFORE all question gates so the correct application and
  // waterSource are always in place when the engine decides what to ask/recommend.
  if (state.evalDomain) {
    const d = state.evalDomain.toLowerCase();
    if (d.startsWith("wu-") || d === "wu") {
      state = { ...state, application: "water_supply", waterSource: state.waterSource ?? "well" };
    } else if (d.startsWith("in-") || d === "in") {
      state = { ...state, application: "water_supply" };
    } else if (d.startsWith("cbs") || d.startsWith("dbs")) {
      state = { ...state, application: "heating" };
    }
  }

  // ─── Greeting ─────────────────────────────────────────────────
  if (latestMessage && GREETING_PATTERN.test(latestMessage) && !state.application && !state.flow_m3h && !state.existingPumpBrand) {
    return {
      action: "greet",
      questionContext: "The user just greeted you. Greet them back warmly and ask how you can help — are they looking to find the right pump, replace an existing one, or save energy?",
      suggestions: ["Find the right pump", "Replace my old pump", "Save energy on pumping"],
      state,
    };
  }

  // ─── Competitor replacement flow ──────────────────────────────
  // Competitor replacement flow — but skip entirely when exact flow+head are known.
  // When a user provides an exact duty point (e.g. "2.5 m³/h 4m"), they're specifying
  // what they WANT, not what they have. Asking for their old pump brand in that case
  // breaks the flow; just recommend based on the duty point directly.
  if (state.existingPumpBrand && !(state.flow_m3h != null && state.head_m != null)) {
    if (state.existingPump) {
      // Model known → try to cross-reference
      const crossRef = findCompetitorMatch(state.existingPumpBrand, state.existingPump);
      if (crossRef) return buildCompetitorRecommendation(state, crossRef, energyOptions);
    }
    // Brand only (no model) → ask for model or application before recommending
    return {
      action: "ask",
      questionContext: `They mentioned a ${state.existingPumpBrand} pump but didn't say which model. Ask which model it is, or what it's used for — to find the exact Grundfos equivalent.`,
      suggestions: ["Heating circulator", "Water pressure booster", "Borehole/well pump", "I know the model number"],
      state,
    };
  }

  // ─── Adaptive question flow based on info quality ─────────────
  const quality = getInfoQuality(state);

  // Conversation fatigue guard: if the conversation is very long (>15 turns) and we still
  // haven't recommended, lower the quality threshold slightly (8 → 7) to avoid an endless
  // clarification loop. The user has been chatting long enough — make a reasonable recommendation
  // with what we have rather than keep asking. This is especially helpful when the user has
  // confirmed context verbally but the engine is holding out for a final data point.
  const qualityThreshold = conversationTurns > 15 ? 7 : 8;

  // Enough info → recommend
  if (quality >= qualityThreshold) {
    // Pre-compute estimate bypass flag — used by both estimate transparency gates below.
    // Matches any explicit confirmation that the user is satisfied with the estimate or wants to proceed.
    const estimateBypass =
      /\b(show[\s-]?pump|proceed|go[\s-]?ahead|looks?\s+(right|good|ok|correct|fine)|use\s+(this|estimate|it)|confirm|continue|yes\b|yep\b|sure\b|ok\b|okay\b|correct\b|find[\s-]?pump|recommend|alright|new[\s-]install(?:ation)?|proceed\s+with|that'?s?\s*(right|correct|fine|good))\b/i.test(
        latestMessage || ""
      );

    // ── Mandatory gate: domestic_water needs physical dimensions ──────────────
    // Bypass when exact duty-point specs are already provided (quality=10) —
    // we have enough to match pumps directly without floor/bathroom estimates.
    if (state.application === "domestic_water" && !state.floors && !state.bathrooms
        && (state.flow_m3h == null || state.head_m == null)) {
      if (state.problem === "replacement" && !state.existingPumpBrand) {
        return {
          action: "ask",
          questionContext: "They want to replace a pump but haven't said what it's used for. Ask what the pump does — water pressure at home, heating/cooling system, or a borehole/well pump?",
          suggestions: ["Water pressure at home", "Heating system", "Borehole / well pump", "I know the brand/model"],
          state,
        };
      }
      if (state.problem) {
        return {
          action: "ask",
          questionContext: "Ask how many floors their house has — this is needed to calculate the correct pump size. Focus only on floors.",
          suggestions: ["1-2 floors", "3-4 floors", "5-6 floors", "7+ floors"],
          state,
        };
      }
      return {
        action: "ask",
        questionContext: "They have a home but haven't described the water situation. Ask what's going on — low pressure, replacing a pump, new install, or high energy bills?",
        suggestions: ["Low water pressure", "Replacing old pump", "New installation", "High water bills"],
        state,
      };
    }

    // ── Mandatory gate: domestic_water needs water source (critical for pump type) ─
    // Without waterSource we can't distinguish mains booster (SCALA2) from borehole (SP).
    if (
      state.application === "domestic_water" &&
      !state.waterSource &&
      state.flow_m3h == null
    ) {
      return {
        action: "ask",
        questionContext: "Ask where their home water comes from — city/tap water (mains), a rooftop or ground storage tank, or a deep well/borehole? This decides which type of pump to recommend.",
        suggestions: ["City / tap water", "Storage tank", "Deep well / borehole"],
        state,
      };
    }

    // ── Mandatory gate: water_supply needs water source (mains booster vs borehole are completely different pumps) ─
    // Bypass when motor_kw is provided — we can match by power directly without knowing the water source.
    // Also bypass when exact flow/head are known (already handled by domestic_water gate above and quality check).
    if (
      state.application === "water_supply" &&
      !state.waterSource &&
      state.flow_m3h == null &&
      !state.motor_kw
    ) {
      return {
        action: "ask",
        questionContext: "Ask where the water comes from — city/tap water (mains), a rooftop storage tank, or a deep well/borehole? This decides whether to recommend a pressure booster or a submersible pump.",
        suggestions: ["City / tap water", "Storage tank", "Deep well / borehole"],
        state,
      };
    }

    // ── Mandatory gate: water_supply needs floors for head calculation ──────────
    if (
      state.application === "water_supply" &&
      !state.floors &&
      state.flow_m3h == null &&
      !state.motor_kw
    ) {
      return {
        action: "ask",
        questionContext: "Ask how many floors the building has — this is needed to calculate the water pressure (head) the pump must deliver.",
        suggestions: ["1-3 floors", "4-8 floors", "9-15 floors", "I know the flow rate"],
        state,
      };
    }

    // ── Transparency gate (water_supply): show estimated duty point before recommending ──
    // Same principle as the heating/cooling gate: show the estimate, ask user to confirm
    // or provide better specs — avoids silent wrong-sized recommendations.
    if (
      state.application === "water_supply" &&
      state.floors != null &&
      state.flow_m3h == null &&
      state.head_m == null &&
      !state.motor_kw &&
      !estimateBypass
    ) {
      const floors = state.floors;
      const units = SIZE_TO_UNITS[state.buildingSize || "small"];
      const tempDuty = deriveDutyPoint({
        application: "water_supply",
        building_type: "generic",
        floors,
        units_or_sqm: units,
      });
      return {
        action: "ask",
        questionContext: `Based on their ${floors}-floor ${state.buildingSize || ""} building, you have estimated a duty point of ${tempDuty.estimated_flow_m3h} m³/h flow at ${tempDuty.estimated_head_m} m head. Show this estimate to the user and ask: is this a new installation (they can confirm to proceed), are they replacing an existing pump (ask for brand/model), or do they have exact flow rate and head from a design document? Be concise — do NOT ask more than one thing.`,
        suggestions: [
          "New installation — use this estimate",
          "Replacing an existing pump",
          "I have the exact flow & head specs",
          "The load is actually higher/lower",
        ],
        state,
      };
    }

    // ── Mandatory gate: heating / cooling needs floors for loop head calc ───────
    if (
      (state.application === "heating" || state.application === "cooling") &&
      !state.floors &&
      state.flow_m3h == null
    ) {
      return {
        action: "ask",
        questionContext: "Ask ONLY how many floors the building has. Answer options are floor ranges like '1-3 floors'. Do NOT ask about location, system type, or anything else.",
        suggestions: ["1-3 floors", "4-6 floors", "7-10 floors", "10+ floors"],
        state,
      };
    }

    // ── Gate: heating/cooling replacement needs competitor brand before cross-referencing ──
    // Prevents the estimate gate from looping when the user clicks "Replacing an existing pump".
    if (
      (state.application === "heating" || state.application === "cooling") &&
      state.problem === "replacement" &&
      !state.existingPumpBrand
    ) {
      return {
        action: "ask",
        questionContext: "They want to replace a heating or cooling pump. Ask what brand and model the current pump is — this lets us find the exact Grundfos equivalent.",
        suggestions: ["Wilo", "KSB", "Grundfos (older model)", "I have the model number"],
        state,
      };
    }

    // ── Transparency gate (heating/cooling): show estimated duty point before recommending ──
    // When floors are known but no explicit flow/head specs, pre-compute the estimate and
    // ask the user to confirm it or provide better information — prevents silent wrong estimates.
    // Bypassed ONLY when the user has explicitly confirmed (bypass keywords) or provided specs.
    // NOTE: !state.problem intentionally removed — "We are designing" (new_install) does NOT
    // mean the user has seen/confirmed our estimate. Only explicit bypass words skip this gate.
    if (
      (state.application === "heating" || state.application === "cooling") &&
      state.floors != null &&
      state.flow_m3h == null &&
      state.head_m == null &&
      !estimateBypass
    ) {
      const floors = state.floors;
      const units = SIZE_TO_UNITS[state.buildingSize || "small"];
      const tempDuty = deriveDutyPoint({
        application: state.application as BuildingParams["application"],
        building_type: "generic",
        floors,
        units_or_sqm: units,
      });
      return {
        action: "ask",
        questionContext: `Based on their ${floors}-floor ${state.buildingSize || ""} building, you have estimated a duty point of ${tempDuty.estimated_flow_m3h} m³/h flow at ${tempDuty.estimated_head_m} m head. Show this estimate to the user and ask: is this a new installation (they should confirm to proceed), are they replacing an existing pump (ask for brand/model), or do they have a design document with exact flow rate and head? Be concise — do NOT ask more than one thing.`,
        suggestions: [
          "New installation — use this estimate",
          "Replacing an existing pump",
          "I have the exact flow & head specs",
          "The load is actually higher/lower",
        ],
        state,
      };
    }

    return buildRecommendation(state, energyOptions);
  }

  // Not enough info → ask the most valuable missing piece
  if (!state.application) {
    return {
      action: "ask",
      questionContext: state.flow_m3h
        ? "They gave flow/pressure specs but haven't said what the system is for. Ask what application — heating, cooling, water supply, or wastewater?"
        : "Ask what kind of system the pump is for — heating/cooling, water supply, a home or a commercial building? Keep it open and non-assumptive.",
      suggestions: ["Heating / cooling system", "Water supply / pressure", "Home water system", "Commercial or industrial"],
      state,
    };
  }

  // Have application — now ask the most important missing piece
  if (state.application === "domestic_water") {
    if (!state.problem) {
      return {
        action: "ask",
        questionContext: "They have a home but haven't said why they need a pump. Ask what their water situation is — low pressure, no water, replacing an old pump, or wanting to save on bills?",
        suggestions: ["Low water pressure", "No water at all", "Replacing old pump", "Save on energy bills"],
        state,
      };
    }
    if (state.problem === "replacement" && !state.existingPumpBrand) {
      // Replacing a pump — ask what it's used for before jumping to sizing
      return {
        action: "ask",
        questionContext: "They want to replace a pump but haven't said what it's used for. Ask what the pump does — water pressure, heating/cooling, or borehole/well?",
        suggestions: ["Water pressure at home", "Heating system", "Borehole / well pump", "I know the brand/model"],
        state,
      };
    }
    // Problem known (and not a blind replacement) but missing house size — ask floors only
    return {
      action: "ask",
      questionContext: "Ask how many floors their building or home has — this determines the pump head required. Ask specifically about floors, not bathrooms.",
      suggestions: ["1-2 floors", "3-4 floors", "5-6 floors", "7+ floors"],
      state,
    };
  }

  if (state.application === "water_supply") {
    if (!state.buildingSize && state.flow_m3h == null && !state.motor_kw) {
      return {
        action: "ask",
        questionContext: "Ask about the size of the building or facility that needs water supply — a small shop, medium office/hotel, or a large factory or campus?",
        suggestions: ["Small building / shop", "Medium (office/hotel)", "Large (factory/campus)", "I know the flow rate"],
        state,
      };
    }
    // Have building size but no floors yet — floors are critical for head calculation
    if (!state.floors && state.flow_m3h == null && !state.motor_kw) {
      return {
        action: "ask",
        questionContext: "Ask how many floors the building or facility has — this determines the water pressure the pump must deliver.",
        suggestions: ["1-3 floors", "4-8 floors", "9-15 floors", "I know the flow rate"],
        state,
      };
    }
  }

  if (state.application === "heating" || state.application === "cooling") {
    // Replacement flow: ask for competitor brand before sizing from scratch
    if (state.problem === "replacement" && !state.existingPumpBrand) {
      return {
        action: "ask",
        questionContext: "They want to replace a heating or cooling pump. Ask what brand and model the current pump is — this lets us find the exact Grundfos equivalent.",
        suggestions: ["Wilo", "KSB", "Grundfos (older model)", "I have the model number"],
        state,
      };
    }
    if (!state.floors && !state.buildingSize) {
      return {
        action: "ask",
        questionContext: "Ask ONLY how many floors the building has. Answer options are floor ranges like '1-3 floors'. Do NOT ask about location, system type, or anything else.",
        suggestions: ["1-3 floors", "4-6 floors", "7-10 floors", "10+ floors"],
        state,
      };
    }
    // Have building size but still no floor count — ask for precision
    if (!state.floors) {
      return {
        action: "ask",
        questionContext: "Ask ONLY how many floors the building has. Answer options are floor ranges like '1-3 floors'. Do NOT ask about location, system type, or anything else.",
        suggestions: ["1-3 floors", "4-6 floors", "7-10 floors", "10+ floors"],
        state,
      };
    }
  }

  if (state.application === "wastewater" && !state.buildingSize) {
    return {
      action: "ask",
      questionContext: "Ask about the scale of the wastewater system — is it a home basement sump, a small commercial building, or a large industrial site?",
      suggestions: ["Home / basement", "Small building", "Large commercial / industrial"],
      state,
    };
  }

  if (state.application === "dosing" && !state.buildingSize) {
    return {
      action: "ask",
      questionContext: "Ask about the dosing application — what chemical or substance they're dosing, and at what scale.",
      suggestions: ["Chlorination", "pH adjustment", "Water treatment", "I know the flow rate"],
      state,
    };
  }

  // No useful information at all — ask an open question instead of attempting a recommendation
  if (!state.application && !state.flow_m3h && !state.motor_kw && !state.existingPumpBrand) {
    return {
      action: "ask",
      questionContext: "We have no information yet about what the user needs. Ask what kind of pump system or water problem they need help with — keep it open and welcoming.",
      suggestions: ["Water pressure at home", "Heating / cooling system", "Replace an old pump", "Industrial or commercial"],
      state,
    };
  }

  // Have application + some context but quality < 7 — recommend with what we have
  return buildRecommendation(state, energyOptions);
}

// ─── Motor-Power-Only Matching ───────────────────────────────────────

function matchPumpsByMotorPower(
  motorKw: number,
  evalDomain?: string
): Array<{ pump: CatalogPump; confidence: number; label: string }> {
  const pumps = (pumpCatalog.pumps || []) as unknown as CatalogPump[];
  const tolerance = 0.35; // ±35% power tolerance

  const domainPrefs = evalDomain ? (DOMAIN_PREFERENCE[evalDomain] || {}) : {};

  const candidates = pumps.filter((p) => {
    const pumpKw = safeNumber(p.specs.power_kw) || safeNumber(p.specs.motor_kw);
    if (!pumpKw) return false;
    if (Math.abs(pumpKw - motorKw) / motorKw >= tolerance) return false;
    // Domain-aware exclusion: when the domain is clearly IN/WU/CBS/DBS,
    // filter out pump families that belong to a completely different domain group.
    if (evalDomain && isDomainExcluded(p.family, evalDomain)) return false;
    return true;
  });

  // Motor-drive domain check — only a "Motor" category product is the exact right fit.
  // A pump (Multistage, Submersible) sharing the same power spec is a weaker match.
  const isDomainMotorDrive = !!(evalDomain?.toLowerCase().includes("motordrive"));

  // Sort by: closest power match, then domain preference
  const scored = candidates.map((pump) => {
    const pumpKw = safeNumber(pump.specs.power_kw) || safeNumber(pump.specs.motor_kw) || 0;
    const powerDiff = Math.abs(pumpKw - motorKw) / motorKw;
    const familyKey = pump.family.toUpperCase().replace(/\d+/g, "").trim();
    const prefBonus = domainPrefs[familyKey] || 0;
    // Domain preference contributes to confidence score (same 0.3 scale as duty-point path)
    const prefContrib = prefBonus * 0.3;
    // Category bonus/penalty for motor-drive domain:
    //   Motor category  → perfect product type  (+4)
    //   Pump category   → wrong product type    (−12)
    const isMotorCategory = pump.category.toLowerCase() === "motor";
    const catBonus   = (isDomainMotorDrive && isMotorCategory)  ?  4 : 0;
    const catPenalty = (isDomainMotorDrive && !isMotorCategory) ? 12 : 0;
    const rawConf = Math.min(99, Math.max(40, Math.round(
      95 - powerDiff * 30 + prefContrib + catBonus - catPenalty
    )));
    return { pump, powerDiff, prefBonus, rawConf };
  });

  scored.sort((a, b) => (a.powerDiff - b.powerDiff) - (a.prefBonus - b.prefBonus) * 0.05);

  // Apply the same rank-based display cap used in matchPumpsByDutyPoint —
  // prevents score inversions and gives a clear winner vs. alternatives.
  let prevConf = 100;
  return scored.slice(0, 3).map((s) => {
    const displayConf = Math.max(40, Math.min(prevConf - (prevConf < 100 ? 3 : 0), s.rawConf));
    prevConf = displayConf;
    const label =
      displayConf >= 90 ? "Excellent Match" :
      displayConf >= 75 ? "Good Match" :
      displayConf >= 60 ? "Fair Match" : "Partial Match";
    return { pump: s.pump, confidence: displayConf, label };
  });
}

// ─── Pump Matching ───────────────────────────────────────────────────

function matchPumpsByDutyPoint(
  dutyPoint: DutyPoint,
  application: Application,
  waterSource?: WaterSource,
  evalDomain?: string
): Array<{ pump: CatalogPump; confidence: number; label: string }> {
  const pumps = (pumpCatalog.pumps || []) as unknown as CatalogPump[];
  const requiredFlow = dutyPoint.estimated_flow_m3h;
  const requiredHead = dutyPoint.estimated_head_m;

  // Dynamic sub-domain inference when no explicit eval domain is provided.
  // Heating/cooling requirements split naturally into two scales:
  //   DBS-Heating  (<6 m³/h)  — residential wet-rotor circulators (ALPHA2, UPM3 …)
  //   CBS          (≥15 m³/h) — commercial flanged HVAC pumps (MAGNA1/3, TP …)
  // This makes real-chat recommendations consistent with the eval domain paths,
  // even when the user doesn't type explicit keywords like "cbs-hvac" or "dbs-heating".
  let effectiveDomain = evalDomain;
  if (!effectiveDomain) {
    if (application === "heating" || application === "cooling") {
      if (requiredFlow < 6) {
        // Within the small-flow heating range, use head depth to separate:
        //   < 3 m head → Hot Water Recirculation (UP / UPS / COMFORT — low-resistance loops)
        //   ≥ 3 m head → Space heating circulator  (ALPHA2 / UPM3 / UPM2 — higher-resistance loops)
        effectiveDomain = requiredHead < 3 ? "DBS-HotWater" : "DBS-Heating";
      } else if (requiredFlow >= 15) {
        effectiveDomain = "CBS";
      }
    }
    // Tiny domestic flow+head = hot water recirculation → DBS-HotWater (UP/UPS/COMFORT)
    if (application === "domestic_water" && requiredFlow < 3 && requiredHead < 5) {
      effectiveDomain = "DBS-HotWater";
    }
  }

  // Normalize IN sub-domains to "IN" for DOMAIN_PREFERENCE lookup.
  // detectEvalDomain returns "IN-Coolant", "IN-Process", "IN-Booster" to allow future
  // sub-domain-specific prefs, but currently all map to the same "IN" preference set.
  const prefDomain = effectiveDomain?.startsWith("IN-") ? "IN" : effectiveDomain;

  // Family preferences: merge application defaults with domain overrides
  const appPrefs = FAMILY_PREFERENCE[application] || {};
  const domainPrefs = prefDomain ? (DOMAIN_PREFERENCE[prefDomain] || {}) : {};
  // Domain prefs take priority when a domain is known (explicit or inferred)
  const preferences = prefDomain
    ? { ...appPrefs, ...domainPrefs }
    : appPrefs;
  // Water source bonus: if "well", boost borehole families
  const waterSourceBonus: Record<string, number> = {};
  if (waterSource === "well") {
    waterSourceBonus["SQE"] = 12;  // SQE = variable-speed domestic well pump (best match)
    waterSourceBonus["SQ"] = 8;
    waterSourceBonus["SP"] = 6;
  }

  // Families excluded from domestic_water when waterSource !== "well" (mains/tank)
  // MAGNA3/ALPHA3: wet-rotor circulators for HVAC heating/cooling loops — NOT pressure boosters
  // CR/CRE: require 3-phase 400V (not in homes); NB/NK: industrial flanged
  // SP/SQ/SQE: require a drilled borehole — only correct when waterSource="well"
  // MTH: industrial 3-phase coolant pump — wrong for any residential use
  // HYDRO removed from list (no longer in catalog)
  const DOMESTIC_WATER_EXCLUDED_FAMILIES = ["CR", "CRE", "NB", "NK", "SP", "SQ", "SQE", "MTH", "MAGNA3", "ALPHA3"];

  const candidates = pumps.filter((p) => {
    // Category exclusion — fundamentally wrong pump types
    if (isCategoryExcluded(p.category, application)) return false;

    // Physical installation exclusions — SP/SQ/SQE require a drilled borehole.
    // domestic_water: exclude unless waterSource="well" (mains/tank users don't have a borehole).
    // water_supply: also exclude when explicitly mains/tank (borehole pumps are wrong for mains supply).
    const excludeBoreholeFamily =
      (application === "domestic_water" && waterSource !== "well") ||
      (application === "water_supply" && (waterSource === "mains" || waterSource === "tank"));
    if (excludeBoreholeFamily) {
      const familyKey = p.family.toUpperCase().replace(/\d+/g, "").trim();
      if (DOMESTIC_WATER_EXCLUDED_FAMILIES.some((f) => familyKey.startsWith(f))) return false;
    }

    const maxFlow = safeNumber(p.specs.max_flow_m3h);
    const maxHead = safeNumber(p.specs.max_head_m);
    if (!maxFlow || !maxHead) return false;
    if (!(maxFlow >= requiredFlow * 0.7 && maxHead >= requiredHead * 0.85)) return false;
    // Domain-aware exclusion: when the domain is clearly identified (e.g. IN-MotorDrive),
    // exclude pump families that belong to a completely different domain group.
    // This prevents residential circulators appearing for industrial queries, etc.
    if (effectiveDomain && isDomainExcluded(p.family, effectiveDomain)) return false;
    return true;
  });

  const appKeywords: Record<string, string[]> = {
    heating: ["heating", "circulator", "hvac"],
    // "cooling system" matches MAGNA3/MAGNA1/TP. "cooling water" matches CR 5-5.
    // "coolant" matches MTH ("Industrial coolant") and CR ("Cooling water" contains "water" not "coolant"
    // so adding "cooling water" as explicit keyword closes this gap).
    cooling: ["cooling system", "cooling water", "coolant", "hvac", "circulator", "air conditioning"],
    water_supply: ["water supply", "pressure boosting", "multistage", "booster", "irrigation", "industrial process", "industrial water"],
    domestic_water: ["domestic", "booster", "residential", "self-priming", "drinking water"],
    wastewater: ["wastewater", "sewage", "drainage"],
    dosing: ["dosing", "chemical", "treatment"],
  };
  const keywords = appKeywords[application] || [];

  const scored = candidates.map((pump) => {
    const maxFlow = safeNumber(pump.specs.max_flow_m3h)!;
    const maxHead = safeNumber(pump.specs.max_head_m)!;

    const flowRatio = maxFlow / requiredFlow;
    const headRatio = maxHead / requiredHead;

    // Rated-point scoring: when a pump's rated operating point is known and covers
    // the required flow, score against that point (ideal=1.0) rather than max specs (ideal=1.2).
    // Upper bound (2.5×): if the rated flow is >2.5× the requirement the pump's BEP is far from
    // the duty — e.g. TP 40-230/2 rated@12 m³/h for a 3.6 m³/h need should NOT benefit from
    // rated-point scoring. Without the cap, TP would score artificially well for DBS circulator duties.
    const ratedFlow = safeNumber(pump.specs.rated_flow_m3h);
    const ratedHead = safeNumber(pump.specs.rated_head_m);
    const useRatedPoint = ratedFlow !== null && ratedHead !== null
      && ratedFlow >= requiredFlow * 0.95
      && ratedHead >= requiredHead * 0.95
      && ratedFlow <= requiredFlow * 2.5;  // BEP must be within 2.5× of requirement

    const scoringFlow = useRatedPoint ? (ratedFlow / requiredFlow) : flowRatio;
    const scoringHead = useRatedPoint ? (ratedHead / requiredHead) : headRatio;
    const idealRatio  = useRatedPoint ? 1.0 : 1.2;

    // Head scoring — asymmetric when flow is undersized AND head is not massively oversized:
    // When a pump can't reach the required flow (flowRatio < 1.0), a moderate head margin is a
    // BENEFIT (more circuit coverage), not a penalty. But only when headRatio ≤ 2.0 —
    // beyond 2× oversize in head the pump is simply the wrong size and shouldn't be rewarded.
    // Example: ALPHA2 (maxHead=8m, headRatio=1.78) for a 4.5m duty → benefit applies.
    // Counter-example: UPS 15-40 (maxHead=4m, headRatio=2.5) for a 1.6m duty → symmetric
    // penalty applies (2.5× head oversize is wrong, not beneficial for hot water recirculation).
    const headScore = flowRatio < 1.0 && scoringHead <= 2.0
      ? Math.max(0, idealRatio - scoringHead) - Math.max(0, scoringHead - idealRatio) * 0.15
      : Math.abs(scoringHead - idealRatio);

    const oversizeScore = Math.abs(scoringFlow - idealRatio) + headScore;

    const appText = [...(pump.applications || []), pump.type, pump.category].join(" ").toLowerCase();
    const appMatch = keywords.some((kw) => appText.includes(kw));
    const appPenalty = appMatch ? 0 : 8;

    const rawEEI = safeNumber(pump.specs.eei);
    const eei = rawEEI ?? 0.2;  // default to class-A typical (0.2) for totalScore calc
    const hasActualEEI = rawEEI !== null;   // only circulators with real EEI data get the confidence bonus
    const eeiScore = eei * 2;

    // Family preference bonus (lower score = better)
    const familyKey = pump.family.toUpperCase().replace(/\d+/g, "").trim();
    const prefBonus = preferences[familyKey] || preferences[pump.family] || 0;
    const wsBonus = waterSourceBonus[familyKey] || 0;
    const totalPrefBonus = prefBonus + wsBonus;

    // Detect VSD: variable speed drive / auto-adapt / constant-pressure pumps
    // These self-regulate — oversizing penalty should be capped (they run slower, not wastefully)
    const featureText = (pump.features || []).join(" ").toLowerCase();
    const isVSD = /variable[\s-]?speed|autoadapt|auto[\s-]?adapt|integrated[\s-]?(?:inverter|frequency)|constant[\s-]?pressure/.test(featureText);

    // When rated-point scoring is active, pass rated ratios to confidence display too.
    // Without this, CR 5-5 at 3/6 uses max-spec ratios (8/3=2.67, 30/6=5.0) → oversizeFactor=5
    // → 30 base → floor of 40%. With rated point (2.9/3=0.967, 5.8/6=0.967) → base≈99.
    const confFlow = useRatedPoint ? scoringFlow : flowRatio;
    const confHead = useRatedPoint ? scoringHead : headRatio;
    const { score: confidence, label } = calculateConfidence(confFlow, confHead, appMatch, eei, totalPrefBonus, isVSD, hasActualEEI);

    const totalScore = oversizeScore + appPenalty + eeiScore - (totalPrefBonus * 0.5);

    return { pump, score: totalScore, confidence, label, flowRatio, headRatio, appMatch };
  });

  scored.sort((a, b) => a.score - b.score);

  // Application-match priority: always show correct-domain pumps ahead of wrong-domain ones.
  // This prevents industrial/multistage pumps (CM, CR) from appearing in heating/cooling results
  // just because few candidates pass the physical filter. Non-matched pumps are only included if
  // there aren't 3 app-matched candidates (prevents empty results for niche applications).
  const appMatched = scored.filter((s) => s.appMatch);
  const notMatched = scored.filter((s) => !s.appMatch);
  const topScored = appMatched.length >= 3
    ? appMatched.slice(0, 3)
    : [...appMatched, ...notMatched].slice(0, 3);

  // Rank-based confidence: each lower-ranked pump shows at most (previous - 3)%.
  // Using a running cap (not just idx*3) prevents inversions where a pump with a higher raw
  // confidence appears at a lower rank but shows a bigger percentage than the winner.
  let prevConf = 100;
  return topScored.map((s) => {
    const displayConf = Math.max(40, Math.min(prevConf - (prevConf < 100 ? 3 : 0), s.confidence));
    prevConf = displayConf;
    // Derive label from displayConf (not stale s.label) so label always matches displayed %
    const label =
      displayConf >= 90 ? "Excellent Match" :
      displayConf >= 75 ? "Good Match" :
      displayConf >= 60 ? "Fair Match" : "Partial Match";
    return { pump: s.pump, confidence: displayConf, label };
  });
}

// ─── Build Recommendation ────────────────────────────────────────────

const USD_TO_PHP = 56;

function parsePrice(priceRange: string): number {
  const parts = priceRange.replace(/[,$]/g, "").split("-").map(Number);
  if (parts.length === 2) return (parts[0] + parts[1]) / 2;
  return parts[0] || 500;
}

function parsePricePhp(priceRange: string): string {
  const parts = priceRange.replace(/[,$]/g, "").split("-").map(Number);
  if (parts.length === 2) return `₱${(parts[0] * USD_TO_PHP).toLocaleString()}-${(parts[1] * USD_TO_PHP).toLocaleString()}`;
  return `₱${((parts[0] || 500) * USD_TO_PHP).toLocaleString()}`;
}

function getOperatingHours(application: Application, buildingSize: BuildingSize): number {
  const hours: Partial<Record<Application, Record<BuildingSize, number>>> = {
    heating: { small: 2000, medium: 3500, large: 4380 },
    cooling: { small: 1500, medium: 2000, large: 2190 },
    water_supply: { small: 2500, medium: 4000, large: 6000 },
    domestic_water: { small: 3000, medium: 5000, large: 7000 },
    wastewater: { small: 2000, medium: 3500, large: 6000 },
    dosing: { small: 8760, medium: 8760, large: 8760 },
  };
  return hours[application]?.[buildingSize] || DEFAULT_OPERATING_HOURS[application as keyof typeof DEFAULT_OPERATING_HOURS] || 4380;
}

// Variable oversizing factors
const OVERSIZING_FACTORS: Partial<Record<Application, Record<BuildingSize, number>>> = {
  domestic_water: { small: 2.0, medium: 1.6, large: 1.3 },
  water_supply:   { small: 1.8, medium: 1.4, large: 1.2 },
  heating:        { small: 1.6, medium: 1.3, large: 1.2 },
  cooling:        { small: 1.5, medium: 1.3, large: 1.2 },
  wastewater:     { small: 1.5, medium: 1.3, large: 1.2 },
  dosing:         { small: 1.2, medium: 1.2, large: 1.2 },
};

function deriveDomesticDutyPoint(state: ConversationState): DutyPoint {
  const floors = state.floors || SIZE_TO_FLOORS[state.buildingSize || "small"];
  const assumptions: string[] = [];

  // Flow: based on bathroom count or building size
  let flow_m3h: number;
  if (state.bathrooms) {
    const fixtures = state.bathrooms * 2 + 2;
    const peak_lps = fixtures * 0.15 * 0.7;
    flow_m3h = Math.round((peak_lps * 3600) / 1000 * 10) / 10;
    assumptions.push(`${state.bathrooms} bathrooms → ${fixtures} fixtures (diversity 0.7)`);
  } else {
    const flowBySize: Record<BuildingSize, number> = { small: 1.2, medium: 3.5, large: 8.0 };
    flow_m3h = flowBySize[state.buildingSize || "small"];
    assumptions.push(`Estimated from ${state.buildingSize || "small"} building`);
  }
  assumptions.push(`Peak flow: ${flow_m3h} m³/h`);

  // Head: realistic for domestic booster
  const static_head = floors * 3;
  const friction_head = static_head * 0.15;
  const boost_margin = 5;
  const head_m = Math.round((static_head + friction_head + boost_margin) * 10) / 10;
  assumptions.push(`Head: ${head_m} m (${floors} floors × 3m + friction + 5m boost)`);

  return {
    estimated_flow_m3h: flow_m3h,
    estimated_head_m: head_m,
    confidence: "estimated",
    assumptions,
  };
}

function buildRecommendation(state: ConversationState, energyOptions?: { co2Override?: number }): EngineResult {
  const application = state.application || "water_supply";
  const buildingSize = state.buildingSize || "medium";
  const region = DEFAULT_ENERGY_RATES.PH;
  const co2 = energyOptions?.co2Override ?? region.co2;
  const operatingHours = getOperatingHours(application, buildingSize);

  // Motor-power-only path (when only motor kW/hp is given, no flow/head)
  if (state.motor_kw && !state.flow_m3h && !state.head_m) {
    const motorMatches = matchPumpsByMotorPower(state.motor_kw, state.evalDomain);
    const recommendedPumps: RecommendedPump[] = motorMatches.map(({ pump, confidence, label }) => {
      const newPower = safeNumber(pump.specs.power_kw) || safeNumber(pump.specs.motor_kw) || state.motor_kw!;
      const existingPower = state.motor_kw! * 1.2;
      const pumpCostPhp = parsePrice(pump.price_range_usd) * USD_TO_PHP;
      const roi = calcROISummary(
        { power_kw: existingPower, operating_hours: operatingHours, electricity_rate: region.rate, co2_factor: co2 },
        { power_kw: newPower, operating_hours: operatingHours, electricity_rate: region.rate, co2_factor: co2 },
        pumpCostPhp
      );
      return {
        ...pump,
        price_range_php: parsePricePhp(pump.price_range_usd),
        roi,
        oversizingNote: pump.category.toLowerCase() === "motor"
          ? `${pump.specs.efficiency_class ? `${String(pump.specs.efficiency_class)} efficiency` : "IEC motor"} — exact ${state.motor_kw} kW match`
          : `Motor power match: ${state.motor_kw} kW (pump assembly)`,
        matchConfidence: confidence,
        matchLabel: label,
      };
    });
    const dutyPt: DutyPoint = { estimated_flow_m3h: 0, estimated_head_m: 0, confidence: "estimated", assumptions: [`Motor power: ${state.motor_kw} kW`] };
    return { action: "recommend", dutyPoint: dutyPt, pumps: recommendedPumps, requirements: [{ label: "Motor Power", value: `${state.motor_kw} kW` }], state };
  }

  let dutyPoint: DutyPoint;

  if (state.flow_m3h != null && state.head_m != null) {
    dutyPoint = {
      estimated_flow_m3h: state.flow_m3h,
      estimated_head_m: state.head_m,
      confidence: "calculated",
      assumptions: ["User provided exact specifications"],
    };
  } else if (application === "domestic_water") {
    dutyPoint = deriveDomesticDutyPoint(state);
  } else if (application === "wastewater") {
    // Wastewater: estimate based on building size
    const flowBySize: Record<BuildingSize, number> = { small: 2, medium: 8, large: 30 };
    const headBySize: Record<BuildingSize, number> = { small: 8, medium: 15, large: 25 };
    dutyPoint = {
      estimated_flow_m3h: flowBySize[buildingSize],
      estimated_head_m: headBySize[buildingSize],
      confidence: "estimated",
      assumptions: [`Estimated from ${buildingSize} wastewater system`],
    };
  } else if (application === "dosing") {
    // Dosing: very small flows
    dutyPoint = {
      estimated_flow_m3h: 0.01,
      estimated_head_m: 10,
      confidence: "estimated",
      assumptions: ["Typical dosing duty point"],
    };
  } else {
    const floors = state.floors || SIZE_TO_FLOORS[buildingSize];
    const units = SIZE_TO_UNITS[buildingSize];
    dutyPoint = deriveDutyPoint({
      application: application as BuildingParams["application"],
      building_type: "generic",
      floors,
      units_or_sqm: units,
    });
  }

  const matched = matchPumpsByDutyPoint(dutyPoint, application, state.waterSource, state.evalDomain);
  const oversizingFactor = OVERSIZING_FACTORS[application]?.[buildingSize] || 1.4;

  const recommendedPumps: RecommendedPump[] = matched.map(({ pump, confidence, label }) => {
    const newPower = safeNumber(pump.specs.power_kw) || 0.1;
    const maxFlow = safeNumber(pump.specs.max_flow_m3h) || 1;
    const maxHead = safeNumber(pump.specs.max_head_m) || 1;
    const pumpCostUsd = parsePrice(pump.price_range_usd);
    const pumpCostPhp = pumpCostUsd * USD_TO_PHP;

    // Per-pump ROI: use THIS pump's actual oversizing ratio
    const pumpOversizeRatio = Math.max(maxFlow / dutyPoint.estimated_flow_m3h, maxHead / dutyPoint.estimated_head_m);
    const typicalOversizedPower = newPower * Math.min(oversizingFactor, pumpOversizeRatio);
    const loadFraction = 1 / Math.max(pumpOversizeRatio, 1);
    const efficientPower = newPower * Math.max(loadFraction, 0.3);

    const roi = calcROISummary(
      {
        power_kw: typicalOversizedPower,
        operating_hours: operatingHours,
        electricity_rate: region.rate,
        co2_factor: co2,
      },
      {
        power_kw: efficientPower,
        operating_hours: operatingHours,
        electricity_rate: region.rate,
        co2_factor: co2,
      },
      pumpCostPhp
    );

    const flowRatio = maxFlow / dutyPoint.estimated_flow_m3h;
    const headRatio = maxHead / dutyPoint.estimated_head_m;

    let oversizingNote: string;
    if (flowRatio > 3 || headRatio > 3) {
      oversizingNote = "This pump exceeds your requirement by 3x+. Consider consulting a Grundfos engineer.";
    } else if (roi.efficiency_improvement_pct > 30) {
      oversizingNote = "Right-sizing saves significant energy vs. a typical oversized installation";
    } else {
      oversizingNote = "Well-matched to your requirements with good efficiency";
    }

    return {
      ...pump,
      price_range_php: parsePricePhp(pump.price_range_usd),
      roi,
      oversizingNote,
      matchConfidence: confidence,
      matchLabel: label,
    };
  });

  // Sort by matchConfidence descending so the "Best Match" label always goes to the
  // highest-confidence pump. totalScore drives eval accuracy internally; this sort ensures
  // the display order is intuitive for users (highest % match shown first).
  recommendedPumps.sort((a, b) => (b.matchConfidence ?? 0) - (a.matchConfidence ?? 0));

  const requirements = buildRequirementsSummary(state, dutyPoint);

  return {
    action: "recommend",
    dutyPoint,
    pumps: recommendedPumps,
    requirements,
    state,
  };
}

function buildCompetitorRecommendation(state: ConversationState, crossRefPump: CatalogPump, energyOptions?: { co2Override?: number }): EngineResult {
  const application = state.application || "heating";
  const buildingSize = state.buildingSize || "medium";
  const region = DEFAULT_ENERGY_RATES.PH;
  const co2 = energyOptions?.co2Override ?? region.co2;
  const operatingHours = getOperatingHours(application, buildingSize);

  const newPower = safeNumber(crossRefPump.specs.power_kw) || 0.1;
  const existingPower = state.existingPumpPower || newPower * 1.3;
  const pumpCostPhp = parsePrice(crossRefPump.price_range_usd) * USD_TO_PHP;

  const roi = calcROISummary(
    { power_kw: existingPower, operating_hours: operatingHours, electricity_rate: region.rate, co2_factor: co2 },
    { power_kw: newPower, operating_hours: operatingHours, electricity_rate: region.rate, co2_factor: co2 },
    pumpCostPhp
  );

  const comparedTo = state.existingPump
    ? `${state.existingPumpBrand} ${state.existingPump}`
    : `${state.existingPumpBrand} pump`;

  const recommendedPump: RecommendedPump = {
    ...crossRefPump,
    price_range_php: parsePricePhp(crossRefPump.price_range_usd),
    roi,
    oversizingNote: `Direct Grundfos equivalent for your ${comparedTo}`,
    matchConfidence: 95,
    matchLabel: "Excellent Match",
    comparedTo,
  };

  const otherPumps: RecommendedPump[] = [];
  if (state.flow_m3h != null && state.head_m != null) {
    const dutyPoint: DutyPoint = {
      estimated_flow_m3h: state.flow_m3h,
      estimated_head_m: state.head_m,
      confidence: "calculated",
      assumptions: ["User provided exact specifications"],
    };
    const matched = matchPumpsByDutyPoint(dutyPoint, application, state.waterSource);
    for (const { pump, confidence, label } of matched) {
      if (pump.id === crossRefPump.id) continue;
      const p = safeNumber(pump.specs.power_kw) || 0.1;
      const pCost = parsePrice(pump.price_range_usd) * USD_TO_PHP;
      const pRoi = calcROISummary(
        { power_kw: existingPower, operating_hours: operatingHours, electricity_rate: region.rate, co2_factor: co2 },
        { power_kw: p, operating_hours: operatingHours, electricity_rate: region.rate, co2_factor: co2 },
        pCost
      );
      otherPumps.push({
        ...pump,
        price_range_php: parsePricePhp(pump.price_range_usd),
        roi: pRoi,
        matchConfidence: confidence,
        matchLabel: label,
        comparedTo,
      });
      if (otherPumps.length >= 2) break;
    }
  }

  const requirements: Array<{ label: string; value: string }> = [
    { label: "Current Pump", value: comparedTo },
  ];
  if (state.existingPumpPower) requirements.push({ label: "Current Power", value: `${state.existingPumpPower} kW` });
  if (state.application) {
    requirements.push({
      label: "Application",
      value: state.application.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    });
  }

  return {
    action: "recommend",
    pumps: [recommendedPump, ...otherPumps],
    requirements,
    state,
    isCompetitorReplacement: true,
  };
}

function buildRequirementsSummary(state: ConversationState, dutyPoint: DutyPoint): Array<{ label: string; value: string }> {
  const requirements: Array<{ label: string; value: string }> = [];
  if (state.application) {
    requirements.push({
      label: "Application",
      value: state.application.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    });
  }
  if (state.buildingSize) {
    const sizeLabels: Record<BuildingSize, string> = {
      small: "Small (1-3 floors)",
      medium: "Medium (4-8 floors)",
      large: "Large (9+ floors)",
    };
    requirements.push({ label: "Building Size", value: sizeLabels[state.buildingSize] });
  }
  if (state.bathrooms) requirements.push({ label: "Bathrooms", value: `${state.bathrooms}` });
  if (state.waterSource) requirements.push({ label: "Water Source", value: state.waterSource.charAt(0).toUpperCase() + state.waterSource.slice(1) });
  requirements.push({ label: "Est. Flow", value: `${dutyPoint.estimated_flow_m3h} m³/h` });
  requirements.push({ label: "Est. Head", value: `${dutyPoint.estimated_head_m} m` });
  if (state.flow_m3h != null && state.head_m != null) {
    requirements.push({ label: "Specs Source", value: "User-provided" });
  }
  return requirements;
}

// ─── Comparison: build two named pumps side-by-side with ROI ────────────────
// Called by route.ts when the engine returns action:"compare".
// Returns both RecommendedPump objects with ROI calculated against the
// current duty point (user-provided) or a reasonable estimate per pump.
export function buildComparisonResult(
  pumpName1: string,
  pumpName2: string,
  state: ConversationState,
  energyOptions?: { co2Override?: number }
): [RecommendedPump, RecommendedPump] | null {
  const typedCatalog = pumpCatalog.pumps as unknown as CatalogPump[];
  const p1 = typedCatalog.find((p) => p.model === pumpName1);
  const p2 = typedCatalog.find((p) => p.model === pumpName2);
  if (!p1 || !p2) return null;

  const application = state.application || "water_supply";
  const buildingSize = state.buildingSize || "medium";
  const region = DEFAULT_ENERGY_RATES.PH;
  const co2 = energyOptions?.co2Override ?? region.co2;
  const operatingHours = getOperatingHours(application, buildingSize);

  const buildPump = (pump: CatalogPump): RecommendedPump => {
    const newPower = safeNumber(pump.specs.power_kw) || 0.1;
    const maxFlow = safeNumber(pump.specs.max_flow_m3h) || 1;
    const maxHead = safeNumber(pump.specs.max_head_m) || 1;

    // Use the known duty point when available; otherwise derive from pump's rated specs
    const reqFlow = state.flow_m3h ?? maxFlow * 0.7;
    const reqHead = state.head_m ?? maxHead * 0.7;

    const pumpOversizeRatio = Math.max(maxFlow / reqFlow, maxHead / reqHead);
    const oversizingFactor = OVERSIZING_FACTORS[application]?.[buildingSize] || 1.4;
    const typicalOversizedPower = newPower * Math.min(oversizingFactor, pumpOversizeRatio);
    const loadFraction = 1 / Math.max(pumpOversizeRatio, 1);
    const efficientPower = newPower * Math.max(loadFraction, 0.3);
    const pumpCostPhp = parsePrice(pump.price_range_usd) * USD_TO_PHP;

    const roi = calcROISummary(
      { power_kw: typicalOversizedPower, operating_hours: operatingHours, electricity_rate: region.rate, co2_factor: co2 },
      { power_kw: efficientPower, operating_hours: operatingHours, electricity_rate: region.rate, co2_factor: co2 },
      pumpCostPhp
    );

    return {
      ...pump,
      price_range_php: parsePricePhp(pump.price_range_usd),
      roi,
    };
  };

  return [buildPump(p1), buildPump(p2)];
}
