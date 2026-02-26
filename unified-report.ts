/**
 * Unified Eval Dashboard
 *
 * Reads all three eval reports and generates:
 *   challenge5_eval_kit/unified_report.json  — machine-readable combined output
 *   challenge5_eval_kit/unified_report.html  — single-page HTML dashboard
 *
 * Run after all three evals are complete:
 *   npx tsx --env-file .env.local hallucination-eval.ts
 *   npx tsx --env-file .env.local adversarial-eval.ts
 *   (optionally: npx promptfoo@latest eval  — from challenge5_eval_kit/)
 *
 * Then:
 *   npx tsx unified-report.ts
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const BASE = join(__dirname, "challenge5_eval_kit");

// ── Typed report shapes ───────────────────────────────────────────────
interface ScoreReport {
  instances: number;
  exact_at_1: number;
  valid_at_k: number;
  k: number;
  by_domain: Record<string, { count: number; exact_at_1: number; valid_at_k: number }>;
}

interface HallucinationReport {
  generated_at: string;
  model: string;
  summary: {
    total_cases: number;
    model_hallucination_rate: number;
    spec_hallucination_rate: number;
    any_hallucination_rate: number;
    correct_model_naming_rate: number;
    faithfulness_score: number;
  };
  cases: Array<{
    id: string;
    engine_top1: string;
    ghost_models: string[];
    spec_checks: Array<{ value: number; unit: string; matches_any_catalog: boolean }>;
    hallucination_detected: boolean;
  }>;
}

interface AdversarialReport {
  generated_at: string;
  summary: {
    total_tests: number;
    passed: number;
    failed: number;
    pass_rate: number;
    by_category: Record<string, { total: number; passed: number }>;
  };
  tests: Array<{
    id: string;
    category: string;
    description: string;
    pass: boolean;
    detail: string;
    llm_response?: string;
  }>;
}

// ── Safe JSON reader ──────────────────────────────────────────────────
function tryRead<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")) as T; }
  catch { return null; }
}

const scoreReport    = tryRead<ScoreReport>       (join(BASE, "score_report.json"));
const hallReport     = tryRead<HallucinationReport>(join(BASE, "hallucination_report.json"));
const adversReport   = tryRead<AdversarialReport>  (join(BASE, "adversarial_report.json"));

// ── Overall grade calculator ──────────────────────────────────────────
function computeGrade(
  score: ScoreReport | null,
  hall: HallucinationReport | null,
  adv: AdversarialReport | null
): { grade: string; score: number; maxScore: number } {
  let pts = 0, max = 0;
  if (score) { pts += score.exact_at_1 * 50;                              max += 50; }
  if (hall)  { pts += (1 - hall.summary.any_hallucination_rate)   * 30;   max += 30; }
  if (adv)   { pts += adv.summary.pass_rate                        * 20;   max += 20; }
  if (max === 0) return { grade: "N/A", score: 0, maxScore: 0 };
  const pct = (pts / max) * 100;
  const grade =
    pct >= 97 ? "A+" : pct >= 92 ? "A" : pct >= 87 ? "B+" :
    pct >= 82 ? "B"  : pct >= 77 ? "C+" : "C";
  return { grade, score: +pts.toFixed(2), maxScore: max };
}

const gradeInfo = computeGrade(scoreReport, hallReport, adversReport);

// ── Unified JSON ──────────────────────────────────────────────────────
const unified = {
  generated_at: new Date().toISOString(),
  overall_grade: gradeInfo.grade,
  overall_score: `${gradeInfo.score}/${gradeInfo.maxScore}`,

  engine_accuracy: scoreReport ? {
    exact_at_1:   scoreReport.exact_at_1,
    valid_at_3:   scoreReport.valid_at_k,
    instances:    scoreReport.instances,
    by_domain:    scoreReport.by_domain,
    note: "40-case hackathon eval kit — deterministic engine only",
  } : null,

  hallucination: hallReport ? {
    model: hallReport.model,
    tested_at: hallReport.generated_at,
    model_hallucination_rate:  hallReport.summary.model_hallucination_rate,
    spec_hallucination_rate:   hallReport.summary.spec_hallucination_rate,
    any_hallucination_rate:    hallReport.summary.any_hallucination_rate,
    correct_model_naming_rate: hallReport.summary.correct_model_naming_rate,
    faithfulness_score:        hallReport.summary.faithfulness_score,
    cases_tested:              hallReport.summary.total_cases,
    hallucinated_cases: hallReport.cases
      .filter((c) => c.hallucination_detected)
      .map((c) => ({ id: c.id, engine_top1: c.engine_top1, ghost_models: c.ghost_models })),
  } : null,

  adversarial: adversReport ? {
    tested_at:   adversReport.generated_at,
    pass_rate:   adversReport.summary.pass_rate,
    total_tests: adversReport.summary.total_tests,
    passed:      adversReport.summary.passed,
    failed:      adversReport.summary.failed,
    by_category: adversReport.summary.by_category,
    failed_tests: adversReport.tests
      .filter((t) => !t.pass)
      .map((t) => ({ id: t.id, category: t.category, description: t.description, detail: t.detail })),
  } : null,
};

writeFileSync(join(BASE, "unified_report.json"), JSON.stringify(unified, null, 2), "utf-8");

// ── HTML dashboard ────────────────────────────────────────────────────
function pct(rate: number) { return `${(rate * 100).toFixed(1)}%`; }
function bar(rate: number, color: string) {
  const w = Math.max(0, Math.min(100, rate * 100)).toFixed(1);
  return `<div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${color}"></div></div>`;
}
function badge(value: string, good: boolean) {
  return `<span class="badge ${good ? "badge-green" : "badge-red"}">${value}</span>`;
}
function domainTable(byDomain: ScoreReport["by_domain"]) {
  return Object.entries(byDomain).map(([domain, s]) =>
    `<tr>
       <td>${domain}</td>
       <td>${s.count}</td>
       <td>${badge(pct(s.exact_at_1), s.exact_at_1 >= 1)}  ${pct(s.exact_at_1)}</td>
       <td>${badge(pct(s.valid_at_k), s.valid_at_k >= 1)}  ${pct(s.valid_at_k)}</td>
     </tr>`
  ).join("");
}

const gradeColor =
  gradeInfo.grade.startsWith("A") ? "#22c55e" :
  gradeInfo.grade.startsWith("B") ? "#f59e0b" : "#ef4444";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GrundMatch — Unified Eval Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 2rem; }
    h1 { font-size: 1.6rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 1rem; }
    .subtitle { color: #64748b; font-size: 0.875rem; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; margin-bottom: 2rem; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1.5rem; }
    .card-title { font-size: 0.8rem; text-transform: uppercase; letter-spacing: .08em; color: #64748b; margin-bottom: 0.5rem; }
    .card-value { font-size: 2rem; font-weight: 700; color: #f8fafc; }
    .card-sub { font-size: 0.85rem; color: #64748b; margin-top: 0.25rem; }
    .grade-card { background: linear-gradient(135deg, #1e293b, #0f172a); border-color: ${gradeColor}44; }
    .grade-value { color: ${gradeColor}; font-size: 3rem; }
    .section { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.25rem; }
    .metric-row { display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid #1e293b; }
    .metric-row:last-child { border-bottom: none; }
    .metric-label { color: #94a3b8; font-size: 0.9rem; }
    .metric-value { font-weight: 600; color: #f8fafc; }
    .bar-track { width: 140px; height: 6px; background: #1e293b; border-radius: 3px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 3px; transition: width .3s; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge-green { background: #14532d; color: #4ade80; }
    .badge-red   { background: #450a0a; color: #f87171; }
    .badge-amber { background: #451a03; color: #fb923c; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { text-align: left; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: .06em; padding: 0.5rem 0.75rem; border-bottom: 1px solid #334155; }
    td { padding: 0.55rem 0.75rem; border-bottom: 1px solid #1e293b; color: #cbd5e1; }
    tr:last-child td { border-bottom: none; }
    .fail-item { padding: 0.75rem; background: #1e293b; border-left: 3px solid #ef4444; border-radius: 0 6px 6px 0; margin-bottom: 0.5rem; font-size: 0.85rem; }
    .fail-id { color: #f87171; font-weight: 600; }
    .fail-detail { color: #94a3b8; margin-top: 0.2rem; }
    .na-pill { display: inline-block; background: #1e293b; color: #475569; font-size: 0.8rem; padding: 0.25rem 0.75rem; border-radius: 6px; }
    .generated { color: #475569; font-size: 0.75rem; text-align: right; margin-top: 2rem; }
  </style>
</head>
<body>

<h1>GrundMatch — Eval Dashboard</h1>
<p class="subtitle">Generated ${new Date().toLocaleString()} &nbsp;·&nbsp; Hackathon Challenge 5</p>

<!-- Summary cards -->
<div class="grid">
  <div class="card grade-card">
    <div class="card-title">Overall Grade</div>
    <div class="card-value grade-value">${gradeInfo.grade}</div>
    <div class="card-sub">${gradeInfo.score} / ${gradeInfo.maxScore} weighted points</div>
  </div>

  <div class="card">
    <div class="card-title">Engine Accuracy · Exact@1</div>
    <div class="card-value">${scoreReport ? pct(scoreReport.exact_at_1) : "—"}</div>
    <div class="card-sub">${scoreReport ? `${scoreReport.instances} test cases` : "score_report.json not found"}</div>
  </div>

  <div class="card">
    <div class="card-title">Hallucination Rate</div>
    <div class="card-value" style="color:${hallReport && hallReport.summary.any_hallucination_rate < 0.05 ? "#4ade80" : "#f87171"}">
      ${hallReport ? pct(hallReport.summary.any_hallucination_rate) : "—"}
    </div>
    <div class="card-sub">${hallReport ? `Faithfulness: ${pct(hallReport.summary.faithfulness_score)}` : "Run hallucination-eval.ts"}</div>
  </div>

  <div class="card">
    <div class="card-title">Adversarial Pass Rate</div>
    <div class="card-value" style="color:${adversReport && adversReport.summary.pass_rate >= 0.9 ? "#4ade80" : "#fb923c"}">
      ${adversReport ? pct(adversReport.summary.pass_rate) : "—"}
    </div>
    <div class="card-sub">${adversReport ? `${adversReport.summary.passed}/${adversReport.summary.total_tests} tests passed` : "Run adversarial-eval.ts"}</div>
  </div>
</div>

<!-- Engine accuracy detail -->
<div class="section">
  <h2>Engine Accuracy</h2>
  ${scoreReport ? `
  <div class="metric-row">
    <span class="metric-label">Exact@1</span>
    <span class="metric-value">${pct(scoreReport.exact_at_1)}</span>
    ${bar(scoreReport.exact_at_1, "#4ade80")}
  </div>
  <div class="metric-row">
    <span class="metric-label">Valid@${scoreReport.k} (top-k match)</span>
    <span class="metric-value">${pct(scoreReport.valid_at_k)}</span>
    ${bar(scoreReport.valid_at_k, "#4ade80")}
  </div>

  <br>
  <table>
    <thead><tr><th>Domain</th><th>Cases</th><th>Exact@1</th><th>Valid@${scoreReport.k}</th></tr></thead>
    <tbody>${domainTable(scoreReport.by_domain)}</tbody>
  </table>
  ` : `<span class="na-pill">No data — run: cd challenge5_eval_kit &amp;&amp; python score.py --gold evaluation_dataset.csv --pred submission.jsonl</span>`}
</div>

<!-- Hallucination detail -->
<div class="section">
  <h2>Hallucination &amp; Faithfulness</h2>
  ${hallReport ? `
  <div class="metric-row">
    <span class="metric-label">Ghost model rate (invented pump names)</span>
    <span class="metric-value">${pct(hallReport.summary.model_hallucination_rate)}</span>
    ${bar(1 - hallReport.summary.model_hallucination_rate, "#4ade80")}
  </div>
  <div class="metric-row">
    <span class="metric-label">Spec hallucination rate (invented values)</span>
    <span class="metric-value">${pct(hallReport.summary.spec_hallucination_rate)}</span>
    ${bar(1 - hallReport.summary.spec_hallucination_rate, "#4ade80")}
  </div>
  <div class="metric-row">
    <span class="metric-label">Correct model naming</span>
    <span class="metric-value">${pct(hallReport.summary.correct_model_naming_rate)}</span>
    ${bar(hallReport.summary.correct_model_naming_rate, "#4ade80")}
  </div>
  <div class="metric-row">
    <span class="metric-label">Faithfulness score (composite)</span>
    <span class="metric-value">${pct(hallReport.summary.faithfulness_score)}</span>
    ${bar(hallReport.summary.faithfulness_score, "#4ade80")}
  </div>
  ${unified.hallucination?.hallucinated_cases?.length ? `
  <br><h2>Hallucinated Cases</h2>
  ${unified.hallucination.hallucinated_cases.map((c) =>
    `<div class="fail-item"><span class="fail-id">${c.id}</span> — engine top1: ${c.engine_top1} — ghost: ${c.ghost_models.join(", ")}</div>`
  ).join("")}` : ""}
  ` : `<span class="na-pill">No data — run: npx tsx --env-file .env.local hallucination-eval.ts</span>`}
</div>

<!-- Adversarial detail -->
<div class="section">
  <h2>Adversarial Robustness</h2>
  ${adversReport ? `
  <div class="metric-row">
    <span class="metric-label">Overall pass rate</span>
    <span class="metric-value">${pct(adversReport.summary.pass_rate)}</span>
    ${bar(adversReport.summary.pass_rate, adversReport.summary.pass_rate >= 0.9 ? "#4ade80" : "#fb923c")}
  </div>

  <br>
  <table>
    <thead><tr><th>Category</th><th>Passed</th><th>Total</th><th>Rate</th></tr></thead>
    <tbody>
      ${Object.entries(adversReport.summary.by_category).map(([cat, s]) =>
        `<tr>
          <td>${cat.replace(/_/g, " ")}</td>
          <td>${s.passed}</td>
          <td>${s.total}</td>
          <td>${badge(pct(s.passed / s.total), s.passed === s.total)}</td>
        </tr>`
      ).join("")}
    </tbody>
  </table>

  ${adversReport.tests.filter((t) => !t.pass).length > 0 ? `
  <br><h2>Failed Tests</h2>
  ${adversReport.tests.filter((t) => !t.pass).map((t) =>
    `<div class="fail-item">
       <span class="fail-id">[${t.id}]</span> ${t.description}
       <div class="fail-detail">${t.detail}</div>
     </div>`
  ).join("")}` : `<p style="color:#4ade80;margin-top:1rem;font-size:.9rem">✓ All adversarial tests passed</p>`}
  ` : `<span class="na-pill">No data — run: npx tsx --env-file .env.local adversarial-eval.ts</span>`}
</div>

<p class="generated">unified_report.json + unified_report.html · ${new Date().toISOString()}</p>
</body>
</html>`;

writeFileSync(join(BASE, "unified_report.html"), html, "utf-8");

// ── Console summary ───────────────────────────────────────────────────
console.log("\n=== Unified Eval Dashboard ===\n");
console.log(`  Overall Grade          : ${gradeInfo.grade}  (${gradeInfo.score}/${gradeInfo.maxScore})`);
if (scoreReport)
  console.log(`  Engine Exact@1         : ${pct(scoreReport.exact_at_1)}  (${scoreReport.instances} cases)`);
if (hallReport)
  console.log(`  Hallucination Rate     : ${pct(hallReport.summary.any_hallucination_rate)}  (faithfulness ${pct(hallReport.summary.faithfulness_score)})`);
if (adversReport)
  console.log(`  Adversarial Pass Rate  : ${pct(adversReport.summary.pass_rate)}  (${adversReport.summary.passed}/${adversReport.summary.total_tests})`);

console.log("\n  challenge5_eval_kit/unified_report.json  — machine-readable");
console.log("  challenge5_eval_kit/unified_report.html  — open in browser for dashboard");
