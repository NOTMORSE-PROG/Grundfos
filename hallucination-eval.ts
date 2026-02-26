/**
 * Hallucination Evaluator — Layer 2 on top of the 40/40 engine accuracy baseline.
 *
 * For each eval scenario:
 *   1. Runs getNextAction() to get the recommended pump (deterministic engine — same as eval-runner.ts)
 *   2. Calls Groq LLM with an explanation prompt (same model as production)
 *   3. Checks the LLM response for:
 *      - Model hallucination  : LLM mentions a pump name NOT in the 21-pump catalog
 *      - Spec accuracy        : quoted numeric values (flow/head/power) within ±25% of catalog
 *      - Model naming integrity: LLM correctly names the recommended pump
 *
 * Outputs: challenge5_eval_kit/hallucination_report.json
 *
 * Run:  npx tsx --env-file .env.local hallucination-eval.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import Groq from "groq-sdk";
import {
  getNextAction,
  detectEvalDomain,
  type ConversationState,
} from "./src/lib/recommendation-engine";

// ── Env fallback: read .env.local if GROQ_API_KEY not already set ─────
if (!process.env.GROQ_API_KEY) {
  try {
    const raw = readFileSync(join(__dirname, ".env.local"), "utf-8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env.local absent — GROQ_API_KEY must be set in the shell environment
  }
}

if (!process.env.GROQ_API_KEY) {
  console.error("ERROR: GROQ_API_KEY is not set. Run: npx tsx --env-file .env.local hallucination-eval.ts");
  process.exit(1);
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Catalog types & loaders ───────────────────────────────────────────
interface CatalogPump {
  model: string;
  specs: {
    max_flow_m3h?: number | null;
    max_head_m?: number | null;
    rated_flow_m3h?: number | null;
    rated_head_m?: number | null;
    power_kw?: number | null;
  };
}

const catalog = JSON.parse(
  readFileSync(join(__dirname, "src/data/pump-catalog.json"), "utf-8")
) as { pumps: CatalogPump[] };

const CATALOG_MODELS = new Set(catalog.pumps.map((p) => p.model));
const CATALOG_MAP = new Map<string, CatalogPump>(catalog.pumps.map((p) => [p.model, p]));

// ── Shared CSV parser ─────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      result.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  result.push(field);
  return result;
}

// ── Hallucination detection helpers ──────────────────────────────────

/** Scans text for catalog model names and Grundfos-pattern tokens not in catalog. */
function extractModelTokens(text: string): { validModels: string[]; ghostModels: string[] } {
  const valid = new Set<string>();

  // Pass 1: exact catalog name match (case-insensitive)
  for (const model of CATALOG_MODELS) {
    const escaped = model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) valid.add(model);
  }

  // Pass 2: scan for Grundfos-pattern tokens not matched above.
  // Uses case-SENSITIVE uppercase matching (no /i flag) to avoid capturing
  // lowercase words like "is"/"meets" that follow model names in sentences.
  // After extraction, a token is only a ghost if it is NOT a prefix or
  // extension of a known catalog name — filtering partial matches like
  // "SP 2A" (prefix of "SP 2A-13") and "CR 5-5 is" (catalog name + word).
  const tokenRe = /\b(?:MAGNA[0-9]?|ALPHA[0-9]?|COMFORT|UPS|UPM[0-9]?|UP|CM|CR|TP|SP|SQ[E]?|MTH|MG)\s+[A-Z0-9][A-Z0-9\s/.-]*/g;
  const ghosts = new Set<string>();
  for (const raw of text.match(tokenRe) ?? []) {
    const norm = raw.trim().replace(/\s+/g, " ");
    // Not a ghost if it exactly matches a catalog model,
    // or if it is a sub-string / extension of a catalog model name
    const relatedToCatalog = CATALOG_MODELS.has(norm) ||
      [...CATALOG_MODELS].some((m) => norm.startsWith(m) || m.startsWith(norm));
    if (!relatedToCatalog) ghosts.add(norm);
  }

  return { validModels: [...valid], ghostModels: [...ghosts] };
}

/** Extracts numeric spec mentions with their unit and surrounding context. */
function extractSpecMentions(text: string): Array<{ value: number; unit: "m3h" | "m_head" | "kw"; context: string }> {
  const results: Array<{ value: number; unit: "m3h" | "m_head" | "kw"; context: string }> = [];
  const ctx = (idx: number) => text.slice(Math.max(0, idx - 40), idx + 40).replace(/\s+/g, " ").trim();

  let m: RegExpExecArray | null;
  const flowRe = /(\d+(?:\.\d+)?)\s*m[³3]?\/h/gi;
  while ((m = flowRe.exec(text)) !== null)
    results.push({ value: parseFloat(m[1]), unit: "m3h", context: ctx(m.index) });

  const headRe = /(\d+(?:\.\d+)?)\s*m\s+head/gi;
  while ((m = headRe.exec(text)) !== null)
    results.push({ value: parseFloat(m[1]), unit: "m_head", context: ctx(m.index) });

  const kwRe = /(\d+(?:\.\d+)?)\s*kW(?!h)/gi;
  while ((m = kwRe.exec(text)) !== null)
    results.push({ value: parseFloat(m[1]), unit: "kw", context: ctx(m.index) });

  return results;
}

/** Returns true if value±tolerance matches any spec field in pump. */
function matchesPump(pump: CatalogPump, unit: "m3h" | "m_head" | "kw", value: number, tolerance = 0.25): boolean {
  const s = pump.specs;
  const candidates =
    unit === "m3h"    ? [s.max_flow_m3h,  s.rated_flow_m3h] :
    unit === "m_head" ? [s.max_head_m,     s.rated_head_m]   :
                        [s.power_kw];
  for (const c of candidates) {
    if (c == null || c === 0) continue;
    if (value >= c * (1 - tolerance) && value <= c * (1 + tolerance)) return true;
  }
  return false;
}

// ── CSV loading (same as eval-runner.ts) ─────────────────────────────
interface CsvRow {
  id: string;
  domain: string;
  user_query: string;
  original_units: string;
  flow_m3h: number;
  head_m: number;
  application: string;
  expected_model: string;
}

const csvText = readFileSync(join(__dirname, "challenge5_eval_kit/evaluation_dataset.csv"), "utf-8");
const csvLines = csvText.trim().split(/\r?\n/);
const csvHeaders = parseCSVLine(csvLines[0]);
const rows: CsvRow[] = csvLines.slice(1).filter(Boolean).map((line) => {
  const cols = parseCSVLine(line);
  const row: Record<string, string> = {};
  csvHeaders.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });
  return {
    id: row.id, domain: row.domain, user_query: row.user_query,
    original_units: row.original_units,
    flow_m3h: parseFloat(row.flow_m3h) || 0, head_m: parseFloat(row.head_m) || 0,
    application: row.application, expected_model: row.expected_model,
  };
});

function parseMotorKw(original_units: string): number | null {
  const hp = original_units.match(/(\d+(?:\.\d+)?)\s*hp/i);
  if (hp) return Math.round(parseFloat(hp[1]) * 0.7457 * 1000) / 1000;
  const kw = original_units.match(/(\d+(?:\.\d+)?)\s*kw/i);
  if (kw) return parseFloat(kw[1]);
  return null;
}

// ── Result type ───────────────────────────────────────────────────────
interface SpecCheck {
  value: number; unit: string;
  matches_recommended: boolean;
  matches_any_catalog: boolean;
  context: string;
}

interface HallucinationCase {
  id: string; expected_model: string; engine_top1: string;
  llm_response: string; valid_models_found: string[]; ghost_models: string[];
  spec_checks: SpecCheck[]; names_recommended_correctly: boolean;
  ghost_model_detected: boolean; spec_hallucination_detected: boolean;
  hallucination_detected: boolean;
}

// ── Async main (top-level await not supported in CJS output) ──────────
void (async () => {
  const results: HallucinationCase[] = [];
  console.log("\n=== GrundMatch Hallucination Evaluator ===");
  console.log(`Calling Groq for ${rows.length} scenarios (llama-3.1-8b-instant)...\n`);
  console.log("ID".padEnd(18), "Engine Top-1".padEnd(26), "Status");
  console.log("─".repeat(72));

  for (const row of rows) {
    // Step 1: engine recommendation (deterministic)
    const evalDomain = detectEvalDomain(row.user_query);
    const state: ConversationState = { evalDomain };
    const motorKw = parseMotorKw(row.original_units);
    const isMotorOnly = row.flow_m3h === 0 && row.head_m === 0;

    if (isMotorOnly && motorKw !== null) {
      state.motor_kw = motorKw;
    } else {
      state.flow_m3h = row.flow_m3h;
      state.head_m = row.head_m;
      if (evalDomain === "WU-Domestic") state.waterSource = "well";
    }

    const engineResult = getNextAction(state);
    const top1 = engineResult.pumps?.[0]?.model ?? "—";
    const topPump = CATALOG_MAP.get(top1);

    // Step 2: build explanation prompt
    const specsStr = topPump
      ? `max_flow=${topPump.specs.max_flow_m3h ?? "N/A"} m³/h, max_head=${topPump.specs.max_head_m ?? "N/A"} m, rated_flow=${topPump.specs.rated_flow_m3h ?? "N/A"} m³/h, rated_head=${topPump.specs.rated_head_m ?? "N/A"} m, power=${topPump.specs.power_kw ?? "N/A"} kW`
      : "specs not available";

    const systemPrompt =
      `You are GrundMatch's AI pump advisor. Write exactly 2 sentences explaining why the ${top1} is the best fit for this scenario.
STRICT RULES:
- Use ONLY the catalog specs listed below — never invent, estimate, or round values.
- Reference the pump by its EXACT model name: "${top1}" — never shorten, alter, or drop any part.
- Do not mention any other pump model or brand.
CATALOG SPECS for ${top1}: ${specsStr}
APPLICATION: ${row.application}`;

    // Step 3: call Groq
    let llmText = "";
    try {
      const resp = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Explain why ${top1} is the right choice for: "${row.user_query}"` },
        ],
        temperature: 0.2,
        max_tokens: 120,
      });
      llmText = resp.choices[0]?.message?.content?.trim() ?? "";
    } catch (err) {
      llmText = `[GROQ_ERROR: ${String(err)}]`;
    }

    // Step 4: analyse response
    const { validModels, ghostModels } = extractModelTokens(llmText);
    const specMentions = extractSpecMentions(llmText);

    const specChecks: SpecCheck[] = specMentions.map((sm) => ({
      value: sm.value, unit: sm.unit, context: sm.context,
      matches_recommended: topPump ? matchesPump(topPump, sm.unit, sm.value) : false,
      matches_any_catalog: catalog.pumps.some((p) => matchesPump(p, sm.unit, sm.value)),
    }));

    const ghostModelDetected = ghostModels.length > 0;
    const specHallucinationDetected = specChecks.some((s) => !s.matches_any_catalog);
    const hallucinationDetected = ghostModelDetected || specHallucinationDetected;
    const namesCorrectly = top1 !== "—" && llmText.toLowerCase().includes(top1.toLowerCase());

    // Step 5: console output
    const statusIcon = hallucinationDetected ? "❌ HALLUCINATION" : "✓  OK";
    console.log(row.id.padEnd(18), top1.padEnd(26), statusIcon);
    if (ghostModels.length > 0)
      console.log(`   ├─ Ghost models  : ${ghostModels.join(", ")}`);
    if (specHallucinationDetected)
      console.log(`   ├─ Spec invented : ${specChecks.filter((s) => !s.matches_any_catalog).map((s) => `${s.value} ${s.unit}`).join(", ")}`);

    results.push({
      id: row.id, expected_model: row.expected_model, engine_top1: top1,
      llm_response: llmText, valid_models_found: validModels, ghost_models: ghostModels,
      spec_checks: specChecks, names_recommended_correctly: namesCorrectly,
      ghost_model_detected: ghostModelDetected,
      spec_hallucination_detected: specHallucinationDetected,
      hallucination_detected: hallucinationDetected,
    });

    await new Promise((r) => setTimeout(r, 150)); // respect Groq rate limit
  }

  // ── Aggregate scoring ───────────────────────────────────────────────
  const n = results.length;
  const ghostCount   = results.filter((r) => r.ghost_model_detected).length;
  const specErrCount = results.filter((r) => r.spec_hallucination_detected).length;
  const namedOK      = results.filter((r) => r.names_recommended_correctly).length;
  const anyHalluc    = results.filter((r) => r.hallucination_detected).length;

  const report = {
    generated_at: new Date().toISOString(),
    model: "llama-3.1-8b-instant",
    summary: {
      total_cases: n,
      model_hallucination_rate:  +(ghostCount   / n).toFixed(4),
      spec_hallucination_rate:   +(specErrCount / n).toFixed(4),
      any_hallucination_rate:    +(anyHalluc    / n).toFixed(4),
      correct_model_naming_rate: +(namedOK      / n).toFixed(4),
      faithfulness_score: +((1 - ghostCount / n) * (1 - specErrCount / n)).toFixed(4),
    },
    cases: results,
  };

  const outPath = join(__dirname, "challenge5_eval_kit/hallucination_report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");

  console.log("\n" + "─".repeat(72));
  console.log("\n📊  HALLUCINATION EVAL SUMMARY");
  console.log(`  Ghost model rate    : ${(report.summary.model_hallucination_rate * 100).toFixed(1)}%  (${ghostCount}/${n} cases)`);
  console.log(`  Spec halluc. rate   : ${(report.summary.spec_hallucination_rate * 100).toFixed(1)}%  (${specErrCount}/${n} cases)`);
  console.log(`  Any hallucination   : ${(report.summary.any_hallucination_rate  * 100).toFixed(1)}%  (${anyHalluc}/${n} cases)`);
  console.log(`  Correct model naming: ${(report.summary.correct_model_naming_rate * 100).toFixed(1)}%  (${namedOK}/${n} cases)`);
  console.log(`  Faithfulness score  : ${(report.summary.faithfulness_score * 100).toFixed(1)}%`);
  console.log(`\nReport → challenge5_eval_kit/hallucination_report.json`);
})();
