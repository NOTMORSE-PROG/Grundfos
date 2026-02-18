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
  existingPump?: string;
  existingPumpBrand?: string;
  existingPumpPower?: number;
  bathrooms?: number;
  waterSource?: WaterSource;
  problem?: Problem;
}

export interface CatalogPump {
  id: string;
  model: string;
  family: string;
  category: string;
  type: string;
  image_url?: string;
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
  action: "ask" | "recommend" | "greet";
  questionContext?: string;
  suggestions?: string[];
  dutyPoint?: DutyPoint;
  pumps?: RecommendedPump[];
  requirements?: Array<{ label: string; value: string }>;
  state?: ConversationState;
  isCompetitorReplacement?: boolean;
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
  { app: "water_supply", pattern: /\b(water[\s-]?supply|pressure[\s-]?boost(?:ing)?|municipal|irrigat|borehole|well[\s-]?pump|boosting|building[\s-]?water|fire[\s-]?(?:protect|fight|suppress))\b/i },
  { app: "water_supply", pattern: /\b(low[\s-]?(?:water\s+)?pressure|no[\s-]?water|weak[\s-]?flow|water[\s-]?tower)\b/i },
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

const FLOW_PATTERN = /(\d+(?:\.\d+)?)\s*(?:m[³³3]\/h|m3\/h|cubic[\s-]?met(?:er|re)s?[\s-]?per[\s-]?hour|cmh)/i;
const HEAD_PATTERN = /(?:at\s+)?(\d+(?:\.\d+)?)\s*(?:met(?:er|re)s?|m)\s*(?:head|of[\s-]?head)/i;
const HEAD_PATTERN_LOOSE = /(\d+(?:\.\d+)?)\s*m\b(?!\s*[³3²\/])/i;
const FLOORS_PATTERN = /(\d+)\s*(?:floor|stor(?:e?y|ies))/i;
const BATHROOM_PATTERN = /(\d+)\s*(?:bathroom|bath(?:room)?s?|toilet|cr\b|restroom|t&b|comfort\s*room)/i;

const COMPETITOR_PATTERN = /\b(wilo|ksb|xylem|lowara|dab|pedrollo|ebara|flygt|prominent|iwaki)\b/i;
const PUMP_MODEL_PATTERN = /\b([A-Z][A-Za-z]*[\s-]?\d[\w\-./]*)\b/;
const POWER_PATTERN = /(?:power|rated|watt(?:s|age)?):?\s*(\d+(?:\.\d+)?)\s*kw/i;
const POWER_PATTERN_W = /(?:power|rated|watt(?:s|age)?):?\s*(\d+(?:\.\d+)?)\s*w\b/i;

const CORRECTION_PATTERN = /\b(no[,.]?\s|actually|i\s+meant?|not\s+\w+[,.]?\s*(it'?s|for)|change\s+(it\s+)?to|switch\s+to|wrong|correct(?:ion)?)\b/i;
const GREETING_PATTERN = /^\s*(h(ello|i|ey|owdy)|yo\b|sup\b|good\s*(morning|afternoon|evening|day)|what'?s?\s*up|greetings|salut|hola)\s*[!?.]*\s*$/i;

const WATER_SOURCE_PATTERNS: Array<{ source: WaterSource; pattern: RegExp }> = [
  { source: "well", pattern: /\b(well|borehole|ground\s*water|deep\s*well)\b/i },
  { source: "tank", pattern: /\b(tank|cistern|reservoir|rain\s*water)\b/i },
  { source: "mains", pattern: /\b(mains|municipal|city\s*water|piped|metro\s*water|water\s*district)\b/i },
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

const FAMILY_PREFERENCE: Partial<Record<Application, Record<string, number>>> = {
  domestic_water: { SCALA: 15, ALPHA: 10 },
  heating:        { MAGNA3: 15, ALPHA: 12, NB: 5, NK: 5, CR: 3 },
  cooling:        { MAGNA3: 15, ALPHA: 12, NB: 5, NK: 5, CR: 3 },
  water_supply:   { CR: 15, CRE: 15, SP: 12, SCALA: 8, HYDRO: 10, NB: 10, NK: 10 },
  wastewater:     { SEG: 15, SE: 15 },
  dosing:         { DDA: 15 },
};

// Category exclusions — fundamentally different pump types
const CATEGORY_EXCLUSIONS: Record<string, Application[]> = {
  Dosing:    ["dosing"],     // DDA pumps only for dosing
  Wastewater: ["wastewater"], // SEG/SE only for wastewater
};

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

  // Building size detection
  for (const { size, pattern } of SIZE_PATTERNS) {
    if (isCorrection && pattern.test(latestText)) { state.buildingSize = size; break; }
    else if (pattern.test(allText)) { state.buildingSize = size; break; }
  }

  // Exact flow/head specs
  const flowMatch = allText.match(FLOW_PATTERN);
  if (flowMatch) state.flow_m3h = parseFloat(flowMatch[1]);

  const headMatch = allText.match(HEAD_PATTERN) || allText.match(HEAD_PATTERN_LOOSE);
  if (headMatch) state.head_m = parseFloat(headMatch[1]);

  // Floor count → infer building size
  const floorsMatch = allText.match(FLOORS_PATTERN);
  if (floorsMatch) {
    state.floors = parseInt(floorsMatch[1], 10);
    if (!state.buildingSize) {
      const f = state.floors;
      if (f <= 3) state.buildingSize = "small";
      else if (f <= 8) state.buildingSize = "medium";
      else state.buildingSize = "large";
    }
  }

  // Bathroom count
  const bathroomMatch = allText.match(BATHROOM_PATTERN);
  if (bathroomMatch) state.bathrooms = parseInt(bathroomMatch[1], 10);

  // Water source
  for (const { source, pattern } of WATER_SOURCE_PATTERNS) {
    if (pattern.test(allText)) { state.waterSource = source; break; }
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
  isVSD = false
): { score: number; label: string } {
  const rawOversizeFactor = Math.max(flowRatio, headRatio);
  // VSD benefit only applies when the pump CAN physically meet the head requirement.
  // If headRatio < 1.0, the pump can't deliver enough pressure — VSD won't help.
  // Example: MAGNA3 for domestic water — 10× flow oversize but can't meet head → no cap.
  // Example: SCALA2 for domestic water — 3.8× oversize but meets head → cap applies.
  const oversizeFactor = (isVSD && headRatio >= 1.0)
    ? Math.min(rawOversizeFactor, 1.8)
    : rawOversizeFactor;

  let base = 95;
  // Gradual penalty for oversizing
  if (oversizeFactor > 1.5) base -= (oversizeFactor - 1.5) * 10;
  if (oversizeFactor > 3) base -= (oversizeFactor - 3) * 15;
  // Penalty for undersizing (flow or head)
  if (oversizeFactor < 0.9) base -= (0.9 - oversizeFactor) * 40;
  // Independent head check: pump physically can't deliver required pressure → steep penalty
  // (separate from the oversizeFactor calculation — catches the MAGNA3 case)
  if (headRatio < 0.95) base -= (0.95 - headRatio) * 80;
  // Penalty for weak application match
  if (!appMatch) base -= 10;
  // Reward high efficiency
  if (eei < 0.23) base += 3;
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

  let score = 0;
  if (state.application) score += 3;
  if (state.buildingSize) score += 2;
  if (state.floors) score += 2;      // Raised from 1 — directly sets pump head
  if (state.bathrooms) score += 2;   // Raised from 1 — directly sets pump flow
  if (state.waterSource) score += 1;
  if (state.problem) score += 2;     // Problem type adds important context
  return score;
}

// ─── Next Action Decision ────────────────────────────────────────────

const SIZE_TO_FLOORS: Record<BuildingSize, number> = { small: 2, medium: 5, large: 12 };
const SIZE_TO_UNITS: Record<BuildingSize, number> = { small: 4, medium: 30, large: 100 };

export function getNextAction(state: ConversationState, latestMessage?: string): EngineResult {
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
  if (state.existingPumpBrand) {
    if (state.existingPump) {
      // Model known → try to cross-reference
      const crossRef = findCompetitorMatch(state.existingPumpBrand, state.existingPump);
      if (crossRef) return buildCompetitorRecommendation(state, crossRef);
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

  // Enough info → recommend (threshold raised from 5 → 7)
  if (quality >= 7) {
    // Hard gate: domestic_water MUST have physical dimensions before recommending.
    // Problem alone ("something's wrong") is not enough to size a pump.
    // A consultant always needs: what's wrong + how big is the house.
    if (state.application === "domestic_water" && !state.floors && !state.bathrooms) {
      if (state.problem) {
        return {
          action: "ask",
          questionContext: `They have ${state.problem.replace("_", " ")} in their home. Ask how many floors and/or bathrooms — needed to size the pump correctly.`,
          suggestions: ["1-2 floors", "3-4 floors", "1-2 bathrooms", "3-4 bathrooms"],
          state,
        };
      }
      return {
        action: "ask",
        questionContext: "They have a house but haven't described the water situation. Ask what's going on — low pressure, replacing a pump, or new install?",
        suggestions: ["Low water pressure", "Replacing old pump", "New installation", "High water bills"],
        state,
      };
    }
    return buildRecommendation(state);
  }

  // Not enough info → ask the most valuable missing piece
  if (!state.application) {
    return {
      action: "ask",
      questionContext: state.flow_m3h
        ? "They gave specs but didn't say what the system is for. Ask what application — heating, cooling, water supply, etc."
        : "Ask what kind of system or problem they're dealing with.",
      suggestions: ["Heating system", "Cooling/AC", "Water pressure", "Replace a pump"],
      state,
    };
  }

  // Have application — now ask the most important missing piece
  if (state.application === "domestic_water") {
    if (!state.problem) {
      // Ask what the issue is first — shapes everything else
      return {
        action: "ask",
        questionContext: "They have a house/home but haven't said why they need a pump. Ask what their water situation is — low pressure, replacing old pump, new install?",
        suggestions: ["Low water pressure", "Replacing old pump", "New installation", "High water bills"],
        state,
      };
    }
    // Problem known but missing size detail
    return {
      action: "ask",
      questionContext: `They have ${state.problem.replace("_", " ")} in their home. Ask how many floors and/or bathrooms — needed to size the pump correctly.`,
      suggestions: ["1-2 floors", "3-4 floors", "1-2 bathrooms", "3-4 bathrooms"],
      state,
    };
  }

  if (state.application === "water_supply") {
    if (!state.buildingSize && state.flow_m3h == null) {
      return {
        action: "ask",
        questionContext: "Ask about the scale of the facility — size and how much water they need.",
        suggestions: ["Small building/shop", "Medium (office/hotel)", "Large (factory/campus)", "I know the flow rate"],
        state,
      };
    }
  }

  if (state.application === "heating" || state.application === "cooling") {
    if (!state.floors && !state.buildingSize) {
      return {
        action: "ask",
        questionContext: "Ask how many floors the building has — critical for calculating pump head.",
        suggestions: ["1-3 floors", "4-6 floors", "7-10 floors", "10+ floors"],
        state,
      };
    }
  }

  if (state.application === "wastewater" && !state.buildingSize) {
    return {
      action: "ask",
      questionContext: "Ask about the scale of the wastewater system — domestic basement sump or commercial.",
      suggestions: ["Home/basement", "Small building", "Commercial/industrial"],
      state,
    };
  }

  if (state.application === "dosing" && !state.buildingSize) {
    return {
      action: "ask",
      questionContext: "Ask about the dosing application — what they're dosing and the rough scale.",
      suggestions: ["Chlorination", "pH adjustment", "Water treatment", "I know the flow rate"],
      state,
    };
  }

  // Have application + some context but quality < 7 — recommend with what we have
  return buildRecommendation(state);
}

// ─── Pump Matching ───────────────────────────────────────────────────

function matchPumpsByDutyPoint(
  dutyPoint: DutyPoint,
  application: Application,
  waterSource?: WaterSource
): Array<{ pump: CatalogPump; confidence: number; label: string }> {
  const pumps = (pumpCatalog.pumps || []) as unknown as CatalogPump[];
  const requiredFlow = dutyPoint.estimated_flow_m3h;
  const requiredHead = dutyPoint.estimated_head_m;

  // Family preferences for this application
  const preferences = FAMILY_PREFERENCE[application] || {};
  // Water source bonus: if "well", boost SP family
  const waterSourceBonus: Record<string, number> = {};
  if (waterSource === "well") waterSourceBonus["SP"] = 8;

  // Families that require special physical infrastructure or are wrong pump type for domestic water
  // MAGNA3/ALPHA3: wet-rotor circulators for HVAC heating/cooling loops — NOT pressure boosters
  // CR/CRE: require 3-phase 400V (not in homes); NB/NK: industrial flanged; HYDRO: large station
  // SP: requires drilled borehole (allowed for waterSource="well")
  const DOMESTIC_WATER_EXCLUDED_FAMILIES = ["CR", "CRE", "NB", "NK", "HYDRO", "SP", "MAGNA3", "ALPHA3"];

  const candidates = pumps.filter((p) => {
    // Category exclusion — fundamentally wrong pump types
    if (isCategoryExcluded(p.category, application)) return false;

    // Physical installation exclusions for domestic water on mains
    // CR/CRE: require 3-phase 400V power (not available in homes)
    // SP: require a drilled borehole (not applicable for household mains water)
    // NB/NK: industrial flanged pumps (wrong installation type)
    // HYDRO-MPC-E: large booster station (wrong scale)
    if (application === "domestic_water" && waterSource !== "well") {
      const familyKey = p.family.toUpperCase().replace(/\d+/g, "").trim();
      if (DOMESTIC_WATER_EXCLUDED_FAMILIES.some((f) => familyKey.startsWith(f))) return false;
    }

    const maxFlow = safeNumber(p.specs.max_flow_m3h);
    const maxHead = safeNumber(p.specs.max_head_m);
    if (!maxFlow || !maxHead) return false;
    return maxFlow >= requiredFlow * 0.7 && maxHead >= requiredHead * 0.7;
  });

  const appKeywords: Record<string, string[]> = {
    heating: ["heating", "circulator", "hvac"],
    cooling: ["cooling", "circulator", "hvac", "air conditioning"],
    water_supply: ["water supply", "pressure boosting", "multistage", "booster", "irrigation"],
    domestic_water: ["domestic", "booster", "residential", "self-priming"],
    wastewater: ["wastewater", "sewage", "drainage"],
    dosing: ["dosing", "chemical", "treatment"],
  };
  const keywords = appKeywords[application] || [];

  const scored = candidates.map((pump) => {
    const maxFlow = safeNumber(pump.specs.max_flow_m3h)!;
    const maxHead = safeNumber(pump.specs.max_head_m)!;

    const flowRatio = maxFlow / requiredFlow;
    const headRatio = maxHead / requiredHead;
    const oversizeScore = Math.abs(flowRatio - 1.2) + Math.abs(headRatio - 1.2);

    const appText = [...(pump.applications || []), pump.type, pump.category].join(" ").toLowerCase();
    const appMatch = keywords.some((kw) => appText.includes(kw));
    const appPenalty = appMatch ? 0 : 8;

    const eei = (safeNumber(pump.specs.eei)) || 0.5;
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

    const { score: confidence, label } = calculateConfidence(flowRatio, headRatio, appMatch, eei, totalPrefBonus, isVSD);

    const totalScore = oversizeScore + appPenalty + eeiScore - (totalPrefBonus * 0.5);

    return { pump, score: totalScore, confidence, label, flowRatio, headRatio };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 3).map((s) => ({ pump: s.pump, confidence: s.confidence, label: s.label }));
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

function buildRecommendation(state: ConversationState): EngineResult {
  const application = state.application || "water_supply";
  const buildingSize = state.buildingSize || "medium";
  const region = DEFAULT_ENERGY_RATES.PH;
  const operatingHours = getOperatingHours(application, buildingSize);

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

  const matched = matchPumpsByDutyPoint(dutyPoint, application, state.waterSource);
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
        co2_factor: region.co2,
      },
      {
        power_kw: efficientPower,
        operating_hours: operatingHours,
        electricity_rate: region.rate,
        co2_factor: region.co2,
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

  const requirements = buildRequirementsSummary(state, dutyPoint);

  return {
    action: "recommend",
    dutyPoint,
    pumps: recommendedPumps,
    requirements,
    state,
  };
}

function buildCompetitorRecommendation(state: ConversationState, crossRefPump: CatalogPump): EngineResult {
  const application = state.application || "heating";
  const buildingSize = state.buildingSize || "medium";
  const region = DEFAULT_ENERGY_RATES.PH;
  const operatingHours = getOperatingHours(application, buildingSize);

  const newPower = safeNumber(crossRefPump.specs.power_kw) || 0.1;
  const existingPower = state.existingPumpPower || newPower * 1.3;
  const pumpCostPhp = parsePrice(crossRefPump.price_range_usd) * USD_TO_PHP;

  const roi = calcROISummary(
    { power_kw: existingPower, operating_hours: operatingHours, electricity_rate: region.rate, co2_factor: region.co2 },
    { power_kw: newPower, operating_hours: operatingHours, electricity_rate: region.rate, co2_factor: region.co2 },
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
        { power_kw: existingPower, operating_hours: operatingHours, electricity_rate: region.rate, co2_factor: region.co2 },
        { power_kw: p, operating_hours: operatingHours, electricity_rate: region.rate, co2_factor: region.co2 },
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
