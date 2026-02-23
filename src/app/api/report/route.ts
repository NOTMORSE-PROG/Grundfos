import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";

interface ReportRequest {
  currentPump: {
    brand?: string;
    model?: string;
    power_kw?: number;
    year?: string;
  };
  recommendedPump: {
    model: string;
    type: string;
    power_kw: number;
    flow: string;
    head: string;
    energyClass: string;
    connection: string;
    price: number;
  };
  calculations: {
    annual_savings: number;
    payback_months: number;
    co2_reduction_tonnes: number;
    efficiency_improvement_pct: number;
    ten_year_savings: number;
    old_annual_cost: number;
    new_annual_cost: number;
  };
  buildingInfo?: {
    name?: string;
    type?: string;
    floors?: number;
  };
  currency?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function php(value: number): string {
  return "PHP " + Math.round(Math.abs(value)).toLocaleString("en-PH");
}

function phpCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `PHP ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `PHP ${(abs / 1_000).toFixed(1)}K`;
  return php(value);
}

export async function POST(request: NextRequest) {
  try {
    const body: ReportRequest = await request.json();
    const { currentPump, recommendedPump, calculations, buildingInfo } = body;

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();   // 210
    const PH = doc.internal.pageSize.getHeight();  // 297
    const ML = 15; // left margin
    const MR = 15; // right margin
    const CW = PW - ML - MR; // content width = 180

    // ── Palette ──────────────────────────────────────────────────────────
    const BLUE:       [number,number,number] = [17,  73, 123];
    const DARK_BLUE:  [number,number,number] = [0,   38,  73];
    const LIGHT_BLUE: [number,number,number] = [232, 242, 252];
    const GREEN:      [number,number,number] = [22, 163,  74];
    const LIGHT_GREEN:[number,number,number] = [220, 252, 231];
    const GRAY_BG:    [number,number,number] = [246, 248, 250];
    const GRAY_LINE:  [number,number,number] = [220, 225, 230];
    const TEXT_DARK:  [number,number,number] = [20,  40,  60];
    const TEXT_MID:   [number,number,number] = [80,  95, 115];
    const TEXT_LIGHT: [number,number,number] = [145, 160, 175];
    const WHITE:      [number,number,number] = [255, 255, 255];
    const RED_LIGHT:  [number,number,number] = [254, 242, 242];
    const RED:        [number,number,number] = [220,  38,  38];

    // ── Helpers ───────────────────────────────────────────────────────────
    const setFont = (style: "normal"|"bold", size: number, color: [number,number,number]) => {
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
      doc.setTextColor(...color);
    };

    const fillRect = (x: number, y: number, w: number, h: number, color: [number,number,number], r = 0) => {
      doc.setFillColor(...color);
      if (r > 0) { doc.roundedRect(x, y, w, h, r, r, "F"); } else { doc.rect(x, y, w, h, "F"); }
    };

    const strokeRect = (x: number, y: number, w: number, h: number, color: [number,number,number], lw = 0.4, r = 0) => {
      doc.setDrawColor(...color);
      doc.setLineWidth(lw);
      if (r > 0) { doc.roundedRect(x, y, w, h, r, r, "S"); } else { doc.rect(x, y, w, h, "S"); }
    };

    const hLine = (y: number, x1 = ML, x2 = PW - MR, color = GRAY_LINE, lw = 0.3) => {
      doc.setDrawColor(...color);
      doc.setLineWidth(lw);
      doc.line(x1, y, x2, y);
    };

    const kpiBox = (x: number, y: number, w: number, h: number,
                    label: string, value: string, sub: string,
                    bg: [number,number,number], valColor: [number,number,number]) => {
      fillRect(x, y, w, h, bg, 3);
      strokeRect(x, y, w, h, GRAY_LINE, 0.3, 3);
      setFont("normal", 7, TEXT_LIGHT);
      doc.text(label.toUpperCase(), x + 4, y + 6);
      setFont("bold", 13, valColor);
      doc.text(value, x + 4, y + 14, { maxWidth: w - 8 });
      if (sub) {
        setFont("normal", 6.5, TEXT_MID);
        doc.text(sub, x + 4, y + 20);
      }
    };

    // ═══════════════════════════════════════════════════════════════════
    // 1. HEADER
    // ═══════════════════════════════════════════════════════════════════
    fillRect(0, 0, PW, 36, BLUE);

    // Logo area
    setFont("bold", 18, WHITE);
    doc.text("GRUNDMATCH", ML, 14);
    setFont("normal", 8, [180, 210, 240]);
    doc.text("AI Pump Advisor", ML, 20);

    // Tagline divider
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.2);
    doc.line(ML + 47, 9, ML + 47, 24);

    setFont("bold", 11, WHITE);
    doc.text("Pump Upgrade Business Case", ML + 51, 15);
    setFont("normal", 8, [180, 210, 240]);
    doc.text("ROI & Energy Savings Report", ML + 51, 21);

    // Date + building
    const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
    setFont("normal", 7.5, [180, 210, 240]);
    doc.text(today, PW - MR, 14, { align: "right" });
    if (buildingInfo?.name) {
      setFont("bold", 8, WHITE);
      doc.text(buildingInfo.name, PW - MR, 21, { align: "right" });
    }

    // Grundfos blue accent bar at bottom of header
    fillRect(0, 33, PW, 3, DARK_BLUE);

    let y = 44;

    // ═══════════════════════════════════════════════════════════════════
    // 2. EXECUTIVE SUMMARY BANNER
    // ═══════════════════════════════════════════════════════════════════
    fillRect(ML, y, CW, 30, LIGHT_GREEN, 3);
    strokeRect(ML, y, CW, 30, GREEN, 0.5, 3);

    setFont("normal", 7.5, [21, 128, 61]);
    doc.text("ESTIMATED ANNUAL ENERGY SAVINGS", ML + 4, y + 6);

    setFont("bold", 22, GREEN);
    doc.text(php(calculations.annual_savings), ML + 4, y + 17);

    setFont("normal", 8, [21, 128, 61]);
    const paybackText = `Payback period: ~${Math.round(calculations.payback_months)} months  |  10-year savings: ${phpCompact(calculations.ten_year_savings)}`;
    doc.text(paybackText, ML + 4, y + 25);

    // Efficiency badge on the right
    fillRect(PW - MR - 38, y + 4, 34, 22, GREEN, 3);
    setFont("bold", 18, WHITE);
    doc.text(`${Math.round(calculations.efficiency_improvement_pct)}%`, PW - MR - 21, y + 14, { align: "center" });
    setFont("normal", 6.5, [180, 240, 200]);
    doc.text("efficiency", PW - MR - 21, y + 20, { align: "center" });
    doc.text("gain", PW - MR - 21, y + 24.5, { align: "center" });

    y += 36;

    // ═══════════════════════════════════════════════════════════════════
    // 3. PUMP COMPARISON
    // ═══════════════════════════════════════════════════════════════════
    setFont("bold", 10, DARK_BLUE);
    doc.text("PUMP COMPARISON", ML, y + 5);
    hLine(y + 7, ML, PW - MR, BLUE, 0.5);
    y += 11;

    const COL = (CW - 16) / 2;

    // ── Current pump (left) ──
    fillRect(ML, y, COL, 42, RED_LIGHT, 3);
    strokeRect(ML, y, COL, 42, RED, 0.5, 3);

    setFont("bold", 7, RED);
    doc.text("CURRENT PUMP  (to replace)", ML + 4, y + 6);

    doc.setDrawColor(...RED);
    doc.setLineWidth(0.2);
    doc.line(ML + 4, y + 8, ML + COL - 4, y + 8);

    setFont("bold", 10, TEXT_DARK);
    doc.text(currentPump.brand || "Existing Pump", ML + 4, y + 14);
    setFont("normal", 8.5, TEXT_DARK);
    doc.text(currentPump.model || "Current installation", ML + 4, y + 21, { maxWidth: COL - 8 });

    setFont("normal", 7.5, TEXT_MID);
    if (currentPump.power_kw) doc.text(`Motor: ${currentPump.power_kw} kW`, ML + 4, y + 30);
    if (currentPump.year) doc.text(`Installed: ${currentPump.year}`, ML + 4, y + 36);

    setFont("bold", 7, RED);
    const oldCostStr = `Running cost: ${php(calculations.old_annual_cost)}/yr`;
    doc.text(oldCostStr, ML + 4, y + 40);

    // ── Arrow in the middle ──
    const arrowX = ML + COL + 4;
    const arrowY = y + 18;
    setFont("bold", 14, BLUE);
    doc.text(">>", arrowX + 2.5, arrowY + 2);
    setFont("normal", 6, TEXT_MID);
    doc.text("UPGRADE", arrowX + 1, arrowY + 7);
    doc.text("TO", arrowX + 4, arrowY + 11);

    // ── Grundfos pump (right) ──
    const rx = ML + COL + 16;
    fillRect(rx, y, COL, 42, LIGHT_BLUE, 3);
    strokeRect(rx, y, COL, 42, BLUE, 0.7, 3);

    setFont("bold", 7, BLUE);
    doc.text("RECOMMENDED GRUNDFOS PUMP", rx + 4, y + 6);

    doc.setDrawColor(...BLUE);
    doc.setLineWidth(0.2);
    doc.line(rx + 4, y + 8, rx + COL - 4, y + 8);

    setFont("bold", 10, DARK_BLUE);
    doc.text(recommendedPump.model, rx + 4, y + 14, { maxWidth: COL - 8 });
    setFont("normal", 8, TEXT_DARK);
    doc.text(recommendedPump.type, rx + 4, y + 21, { maxWidth: COL - 8 });

    setFont("normal", 7.5, TEXT_MID);
    doc.text(`Flow: ${recommendedPump.flow}  |  Head: ${recommendedPump.head}`, rx + 4, y + 30);
    doc.text(`Power: ${recommendedPump.power_kw} kW  |  Class: ${recommendedPump.energyClass}`, rx + 4, y + 36);

    setFont("bold", 7, GREEN);
    doc.text(`Running cost: ${php(calculations.new_annual_cost)}/yr`, rx + 4, y + 40);

    y += 50;

    // ═══════════════════════════════════════════════════════════════════
    // 4. FINANCIAL KPIs  (4 boxes in a row)
    // ═══════════════════════════════════════════════════════════════════
    setFont("bold", 10, DARK_BLUE);
    doc.text("FINANCIAL ANALYSIS", ML, y + 5);
    hLine(y + 7, ML, PW - MR, BLUE, 0.5);
    y += 11;

    const KW = (CW - 9) / 4;
    const KH = 26;

    kpiBox(ML,                 y, KW, KH, "Annual Savings",   php(calculations.annual_savings),       "energy cost",       LIGHT_GREEN, GREEN);
    kpiBox(ML + KW + 3,        y, KW, KH, "10-Year Savings",  phpCompact(calculations.ten_year_savings), "net projection", LIGHT_BLUE,  BLUE);
    kpiBox(ML + 2*(KW + 3),    y, KW, KH, "Payback Period",   `~${Math.round(calculations.payback_months)} months`,  "simple",         GRAY_BG,     DARK_BLUE);
    kpiBox(ML + 3*(KW + 3),    y, KW, KH, "Pump Price (est.)", phpCompact(recommendedPump.price),      "installed cost",    GRAY_BG,     TEXT_DARK);

    y += KH + 8;

    // ═══════════════════════════════════════════════════════════════════
    // 5. ENERGY COST BAR CHART
    // ═══════════════════════════════════════════════════════════════════
    setFont("bold", 10, DARK_BLUE);
    doc.text("ANNUAL ENERGY COST COMPARISON", ML, y + 5);
    hLine(y + 7, ML, PW - MR, BLUE, 0.5);
    y += 13;

    fillRect(ML, y, CW, 30, GRAY_BG, 3);
    strokeRect(ML, y, CW, 30, GRAY_LINE, 0.3, 3);

    const maxCost = Math.max(calculations.old_annual_cost, calculations.new_annual_cost);
    const barMaxW = CW - 60;

    // Old cost bar
    const oldBarW = (calculations.old_annual_cost / maxCost) * barMaxW;
    setFont("normal", 7, TEXT_MID);
    doc.text("Current pump:", ML + 4, y + 8);
    fillRect(ML + 28, y + 4, oldBarW, 6, RED, 1);
    setFont("bold", 7, RED);
    doc.text(php(calculations.old_annual_cost) + " / yr", ML + 32 + oldBarW, y + 8.5);

    // New cost bar
    const newBarW = (calculations.new_annual_cost / maxCost) * barMaxW;
    setFont("normal", 7, TEXT_MID);
    doc.text("Grundfos pump:", ML + 4, y + 19);
    fillRect(ML + 28, y + 15, newBarW, 6, GREEN, 1);
    setFont("bold", 7, GREEN);
    doc.text(php(calculations.new_annual_cost) + " / yr", ML + 32 + newBarW, y + 19.5);

    // Savings callout
    setFont("bold", 7, [21, 128, 61]);
    const savingsPct = ((calculations.annual_savings / calculations.old_annual_cost) * 100).toFixed(0);
    doc.text(`You save ${savingsPct}% on energy costs`, PW - MR - 4, y + 26, { align: "right" });

    y += 38;

    // ═══════════════════════════════════════════════════════════════════
    // 6. SUSTAINABILITY
    // ═══════════════════════════════════════════════════════════════════
    setFont("bold", 10, DARK_BLUE);
    doc.text("SUSTAINABILITY IMPACT", ML, y + 5);
    hLine(y + 7, ML, PW - MR, BLUE, 0.5);
    y += 11;

    const SW = (CW - 6) / 3;
    const SH = 22;

    // CO2
    fillRect(ML, y, SW, SH, GRAY_BG, 3);
    strokeRect(ML, y, SW, SH, GRAY_LINE, 0.3, 3);
    setFont("normal", 6.5, TEXT_LIGHT);
    doc.text("CO2 REDUCTION", ML + 4, y + 6);
    setFont("bold", 14, DARK_BLUE);
    doc.text(`${calculations.co2_reduction_tonnes.toFixed(1)} t`, ML + 4, y + 15);
    setFont("normal", 6.5, TEXT_MID);
    doc.text("per year", ML + 4, y + 20);

    // Efficiency
    fillRect(ML + SW + 3, y, SW, SH, GRAY_BG, 3);
    strokeRect(ML + SW + 3, y, SW, SH, GRAY_LINE, 0.3, 3);
    setFont("normal", 6.5, TEXT_LIGHT);
    doc.text("EFFICIENCY GAIN", ML + SW + 7, y + 6);
    setFont("bold", 14, GREEN);
    doc.text(`${Math.round(calculations.efficiency_improvement_pct)}%`, ML + SW + 7, y + 15);
    setFont("normal", 6.5, TEXT_MID);
    doc.text("improvement", ML + SW + 7, y + 20);

    // Energy class
    fillRect(ML + 2*(SW + 3), y, SW, SH, GRAY_BG, 3);
    strokeRect(ML + 2*(SW + 3), y, SW, SH, GRAY_LINE, 0.3, 3);
    setFont("normal", 6.5, TEXT_LIGHT);
    doc.text("ENERGY CLASS", ML + 2*(SW + 3) + 4, y + 6);
    setFont("bold", 14, BLUE);
    doc.text(recommendedPump.energyClass, ML + 2*(SW + 3) + 4, y + 15);
    setFont("normal", 6.5, TEXT_MID);
    doc.text("EU ErP rated", ML + 2*(SW + 3) + 4, y + 20);

    y += SH + 8;

    // ═══════════════════════════════════════════════════════════════════
    // 7. TECHNICAL SPECIFICATIONS TABLE
    // ═══════════════════════════════════════════════════════════════════
    setFont("bold", 10, DARK_BLUE);
    doc.text("TECHNICAL SPECIFICATIONS", ML, y + 5);
    hLine(y + 7, ML, PW - MR, BLUE, 0.5);
    y += 11;

    const rows: [string, string, string][] = [
      ["Specification",               "Current Pump",                             "Grundfos " + recommendedPump.model],
      ["Flow Rate",                   "—",                                        recommendedPump.flow],
      ["Max Head",                    "—",                                        recommendedPump.head],
      ["Motor Power",                 currentPump.power_kw ? `${currentPump.power_kw} kW` : "—", `${recommendedPump.power_kw} kW`],
      ["Energy Class",                "—",                                        recommendedPump.energyClass],
      ["Annual Energy Cost",          php(calculations.old_annual_cost),          php(calculations.new_annual_cost)],
      ["Annual Savings",              "—",                                        php(calculations.annual_savings)],
      ["10-Year Savings",             "—",                                        phpCompact(calculations.ten_year_savings)],
    ];

    const colWidths = [55, (CW - 55) / 2, (CW - 55) / 2];
    const rowH = 7;

    rows.forEach((row, i) => {
      const rx0 = ML;
      const isHeader = i === 0;
      const isEven = i % 2 === 0;
      const rowY = y + i * rowH;

      // Row background
      if (isHeader) {
        fillRect(rx0, rowY, CW, rowH, BLUE);
      } else if (isEven) {
        fillRect(rx0, rowY, CW, rowH, GRAY_BG);
      }

      let cx = rx0;
      row.forEach((cell, ci) => {
        const isLastCol = ci === row.length - 1;
        const isSavings = i === rows.length - 2 || i === rows.length - 1;
        const textColor: [number,number,number] = isHeader ? WHITE
          : (isSavings && ci > 0) ? GREEN
          : ci === 0 ? TEXT_MID
          : TEXT_DARK;

        setFont(isHeader || ci === 0 ? "bold" : "normal", isHeader ? 8 : 7.5, textColor);
        doc.text(cell, cx + 3, rowY + 4.8, { maxWidth: colWidths[ci] - 6, align: ci > 0 && !isHeader ? "right" : "left",
          ...(ci > 0 && !isHeader && { x: cx + colWidths[ci] - 3 }) });

        // Column divider
        if (!isLastCol) {
          doc.setDrawColor(...(isHeader ? WHITE : GRAY_LINE));
          doc.setLineWidth(0.2);
          doc.line(cx + colWidths[ci], rowY, cx + colWidths[ci], rowY + rowH);
        }
        cx += colWidths[ci];
      });

      // Row bottom border
      hLine(rowY + rowH, ML, ML + CW, isHeader ? BLUE : GRAY_LINE, 0.2);
    });

    strokeRect(ML, y, CW, rows.length * rowH, GRAY_LINE, 0.4, 0);
    y += rows.length * rowH + 10;

    // ═══════════════════════════════════════════════════════════════════
    // 8. FOOTER
    // ═══════════════════════════════════════════════════════════════════
    const footerY = PH - 18;
    fillRect(0, footerY - 2, PW, 20, DARK_BLUE);
    setFont("bold", 8, WHITE);
    doc.text("GrundMatch  |  AI Pump Advisor powered by Grundfos", ML, footerY + 5);
    setFont("normal", 6.5, [150, 180, 210]);
    doc.text(
      "This report is for informational purposes. Actual savings may vary based on operating conditions and installation.",
      ML,
      footerY + 10,
      { maxWidth: CW - 30 }
    );
    setFont("normal", 6.5, [150, 180, 210]);
    doc.text(today, PW - MR, footerY + 5, { align: "right" });

    // ── Page border accent ──────────────────────────────────────────────
    doc.setDrawColor(...BLUE);
    doc.setLineWidth(1.5);
    doc.line(0, 0, 0, PH);    // left edge accent

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="GrundMatch_ROI_${new Date().toISOString().slice(0, 10)}.pdf"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate report", details: String(error) },
      { status: 500 }
    );
  }
}
