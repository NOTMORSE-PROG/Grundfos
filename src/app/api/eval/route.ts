import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  extractIntent,
  getNextAction,
  detectEvalDomain,
  type ConversationState,
  type Application,
} from "@/lib/recommendation-engine";

// ─── CSV Parser ────────────────────────────────────────────────────────────────

interface EvalRow {
  id: string;
  domain: string;
  user_query: string;
  original_units: string;
  flow_m3h: number;
  head_m: number;
  application: string;
  expected_model: string;
  expected_pdf: string;
}

function parseEvalCSV(csvPath: string): EvalRow[] {
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",");

  return lines.slice(1).map((line) => {
    // Handle quoted fields (e.g. user_query with commas)
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());

    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = fields[i] ?? "";
    });

    return {
      id: obj.id,
      domain: obj.domain,
      user_query: obj.user_query,
      original_units: obj.original_units,
      flow_m3h: parseFloat(obj.flow_m3h) || 0,
      head_m: parseFloat(obj.head_m) || 0,
      application: obj.application,
      expected_model: obj.expected_model,
      expected_pdf: obj.expected_pdf,
    };
  });
}

// ─── Application Mapping ───────────────────────────────────────────────────────

function mapApplicationToEngine(app: string): Application {
  if (app.includes("HVAC") || app.includes("HotWater") || app.includes("Heating")) return "heating";
  if (app.includes("Coolant")) return "cooling";
  if (app.includes("Process") || app.includes("Booster") || app.includes("MotorDrive")) return "water_supply";
  if (app.includes("Borehole") || app.includes("Irrigation") || app.includes("Boosting")) return "water_supply";
  if (app.includes("Domestic")) return "water_supply";
  return "water_supply";
}

// ─── Motor Power Extraction from original_units column ────────────────────────

function extractMotorKwFromUnits(originalUnits: string): number | undefined {
  // e.g. "0.55 kW motor power" → 0.55 kW
  const kwMatch = originalUnits.match(/(\d+(?:\.\d+)?)\s*kW/i);
  if (kwMatch) return parseFloat(kwMatch[1]);
  // e.g. "10 hp motor power" → 7.457 kW
  const hpMatch = originalUnits.match(/(\d+(?:\.\d+)?)\s*hp/i);
  if (hpMatch) return Math.round(parseFloat(hpMatch[1]) * 0.7457 * 1000) / 1000;
  return undefined;
}

// ─── GET /api/eval ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const csvPath = path.join(process.cwd(), "challenge5_eval_kit", "evaluation_dataset.csv");

    if (!fs.existsSync(csvPath)) {
      return NextResponse.json(
        { error: "Eval dataset not found at challenge5_eval_kit/evaluation_dataset.csv" },
        { status: 404 }
      );
    }

    const rows = parseEvalCSV(csvPath);
    const submissions: Array<{ id: string; top_k: string[]; prediction: string }> = [];

    for (const row of rows) {
      // Build state directly from CSV columns (bypass conversational engine)
      const evalDomain = detectEvalDomain(row.user_query) || detectEvalDomain(row.application);

      const state: ConversationState = {
        application: mapApplicationToEngine(row.application),
        evalDomain,
      };

      // Water source
      if (
        row.application.includes("Borehole") ||
        row.application.includes("Domestic") ||
        row.application.includes("Irrigation") ||
        row.application.includes("Boosting")
      ) {
        state.waterSource = "well";
      }

      // Use flow/head from CSV (already converted to SI)
      if (row.flow_m3h > 0) {
        state.flow_m3h = row.flow_m3h;
      }
      if (row.head_m > 0) {
        state.head_m = row.head_m;
      }

      // Power-only scenarios: flow_m3h = 0 means only motor power given
      if (row.flow_m3h === 0 && row.head_m === 0) {
        const motorKw = extractMotorKwFromUnits(row.original_units);
        if (motorKw) state.motor_kw = motorKw;
      }

      // Also try regex extraction from user_query for unit-converted cases
      // (The CSV already has converted values, so this is a fallback)
      if (!state.flow_m3h && !state.motor_kw) {
        const extracted = extractIntent([{ role: "user", content: row.user_query }]);
        if (extracted.flow_m3h) state.flow_m3h = extracted.flow_m3h;
        if (extracted.head_m) state.head_m = extracted.head_m;
        if (extracted.motor_kw) state.motor_kw = extracted.motor_kw;
      }

      const result = getNextAction(state);

      const topK =
        result.pumps?.slice(0, 3).map((p) => p.model) ?? [];

      submissions.push({
        id: row.id,
        top_k: topK,
        prediction: topK[0] ?? "",
      });
    }

    // Check query params for format
    const { searchParams } = new URL(request.url);
    const wantCsv = searchParams.get("csv") === "1";

    if (wantCsv) {
      const csvLines = ["id,prediction,top_k"];
      for (const s of submissions) {
        const topKStr = JSON.stringify(s.top_k).replace(/"/g, '""');
        csvLines.push(`${s.id},${s.prediction},"${topKStr}"`);
      }
      return new Response(csvLines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="submissions.csv"',
        },
      });
    }

    // Default: JSONL (compatible with score.py)
    const jsonl = submissions.map((s) => JSON.stringify(s)).join("\n");
    return new Response(jsonl, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": 'attachment; filename="submissions.jsonl"',
      },
    });
  } catch (err) {
    console.error("[/api/eval]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
