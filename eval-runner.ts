/**
 * Eval runner — feeds all 40 eval dataset rows through the recommendation engine
 * and generates a submission JSONL for scoring with score.py.
 *
 * Run:  npx tsx eval-runner.ts
 * Then: cd challenge5_eval_kit && python score.py --gold evaluation_dataset.csv --pred submission.jsonl
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  getNextAction,
  detectEvalDomain,
  type ConversationState,
} from "./src/lib/recommendation-engine";

// ── Proper CSV parser (handles quoted fields with embedded commas) ────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      // Escaped quote inside quoted field
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

const csvPath = join(__dirname, "challenge5_eval_kit/evaluation_dataset.csv");
const csvText = readFileSync(csvPath, "utf-8");
const lines = csvText.trim().split(/\r?\n/);
const headers = parseCSVLine(lines[0]);

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

const rows: CsvRow[] = lines.slice(1).filter(Boolean).map((line) => {
  const cols = parseCSVLine(line);
  const row: Record<string, string> = {};
  headers.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });
  return {
    id: row.id,
    domain: row.domain,
    user_query: row.user_query,
    original_units: row.original_units,
    flow_m3h: parseFloat(row.flow_m3h) || 0,
    head_m: parseFloat(row.head_m) || 0,
    application: row.application,
    expected_model: row.expected_model,
  };
});

// ── Motor-power helper ───────────────────────────────────────────────
function parseMotorKw(original_units: string): number | null {
  const hp = original_units.match(/(\d+(?:\.\d+)?)\s*hp/i);
  if (hp) return Math.round(parseFloat(hp[1]) * 0.7457 * 1000) / 1000;
  const kw = original_units.match(/(\d+(?:\.\d+)?)\s*kw/i);
  if (kw) return parseFloat(kw[1]);
  return null;
}

// ── Run each eval case ───────────────────────────────────────────────
type Prediction = { id: string; top_k: string[]; expected: string; pass1: boolean; pass3: boolean };
const predictions: Prediction[] = [];

for (const row of rows) {
  const evalDomain = detectEvalDomain(row.user_query);

  // Minimal state — evalDomain override inside getNextAction sets application correctly:
  //   wu-* / wu  → water_supply
  //   in-* / in  → water_supply
  //   cbs / dbs  → heating
  const state: ConversationState = { evalDomain };

  const motorKw = parseMotorKw(row.original_units);
  const isMotorOnly = row.flow_m3h === 0 && row.head_m === 0;

  if (isMotorOnly && motorKw !== null) {
    state.motor_kw = motorKw;
  } else {
    state.flow_m3h = row.flow_m3h;
    state.head_m = row.head_m;
    // WU-Domestic: well source so SQE gets its waterSourceBonus + domain pref
    if (evalDomain === "WU-Domestic") {
      state.waterSource = "well";
    }
  }

  const result = getNextAction(state);

  let top_k: string[] = [];
  if (result.action === "recommend" && result.pumps) {
    top_k = result.pumps.slice(0, 3).map((p) => p.model);
  } else {
    console.warn(`⚠  ${row.id}: engine returned action="${result.action}" (expected "recommend")`);
  }

  const pass1 = top_k[0]?.toLowerCase() === row.expected_model.toLowerCase();
  const pass3 = top_k.some((m) => m.toLowerCase() === row.expected_model.toLowerCase());

  predictions.push({ id: row.id, top_k, expected: row.expected_model, pass1, pass3 });
}

// ── Print per-case results ───────────────────────────────────────────
console.log("\n=== Per-case results ===");
console.log(
  "ID".padEnd(18),
  "Expected".padEnd(24),
  "Got #1".padEnd(24),
  "E@1  V@3"
);
console.log("─".repeat(82));

let exact1 = 0, valid3 = 0;
const failedCases: Prediction[] = [];

for (const p of predictions) {
  const e1 = p.pass1 ? "✓" : "✗";
  const v3 = p.pass3 ? "✓" : "✗";
  console.log(
    p.id.padEnd(18),
    p.expected.padEnd(24),
    (p.top_k[0] ?? "—").padEnd(24),
    ` ${e1}    ${v3}`
  );
  if (p.pass1) exact1++;
  if (p.pass3) valid3++;
  if (!p.pass1) failedCases.push(p);
}

console.log("─".repeat(82));
console.log(`\nExact@1 = ${exact1}/${predictions.length} (${(exact1/predictions.length*100).toFixed(1)}%)`);
console.log(`Valid@3 = ${valid3}/${predictions.length} (${(valid3/predictions.length*100).toFixed(1)}%)`);

if (failedCases.length > 0) {
  console.log(`\n=== Failed cases (${failedCases.length}) ===`);
  for (const p of failedCases) {
    const v3note = p.pass3 ? "[Valid@3 ✓]" : "[MISS — not in top3]";
    console.log(`  ${p.id}: expected "${p.expected}" | got ${JSON.stringify(p.top_k)}  ${v3note}`);
  }
}

// ── Write JSONL submission ───────────────────────────────────────────
const jsonlPath = join(__dirname, "challenge5_eval_kit/submission.jsonl");
const jsonl = predictions.map((p) => JSON.stringify({ id: p.id, top_k: p.top_k })).join("\n");
writeFileSync(jsonlPath, jsonl, "utf-8");
console.log(`\nSubmission written → challenge5_eval_kit/submission.jsonl`);
