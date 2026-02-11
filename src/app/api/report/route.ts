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

export async function POST(request: NextRequest) {
  try {
    const body: ReportRequest = await request.json();
    const { currentPump, recommendedPump, calculations, buildingInfo, currency = "USD" } = body;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Colors
    const grundfosBlue: [number, number, number] = [17, 73, 123];
    const darkBlue: [number, number, number] = [0, 48, 73];
    const white: [number, number, number] = [255, 255, 255];
    const lightGray: [number, number, number] = [245, 247, 250];
    const green: [number, number, number] = [22, 163, 74];

    // Header bar
    doc.setFillColor(...grundfosBlue);
    doc.rect(0, 0, pageWidth, 35, "F");

    doc.setTextColor(...white);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("GrundMatch", 15, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Pump Upgrade Business Case", 15, 27);

    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - 15, 18, { align: "right" });
    if (buildingInfo?.name) {
      doc.text(`For: ${buildingInfo.name}`, pageWidth - 15, 25, { align: "right" });
    }

    let y = 45;

    // Current vs Proposed section
    doc.setTextColor(...darkBlue);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Current vs. Proposed Pump", 15, y);
    y += 10;

    // Two-column layout
    const colWidth = (pageWidth - 40) / 2;

    // Current pump box
    doc.setFillColor(...lightGray);
    doc.roundedRect(15, y, colWidth, 45, 3, 3, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text("CURRENT PUMP", 20, y + 8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.text(currentPump.brand || "Unknown Brand", 20, y + 18);
    doc.text(currentPump.model || "Unknown Model", 20, y + 26);
    if (currentPump.power_kw) doc.text(`Power: ${currentPump.power_kw} kW`, 20, y + 34);
    if (currentPump.year) doc.text(`Installed: ${currentPump.year}`, 20, y + 42);

    // Recommended pump box
    doc.setFillColor(232, 240, 246);
    doc.roundedRect(15 + colWidth + 10, y, colWidth, 45, 3, 3, "F");
    doc.setDrawColor(...grundfosBlue);
    doc.setLineWidth(0.5);
    doc.roundedRect(15 + colWidth + 10, y, colWidth, 45, 3, 3, "S");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...grundfosBlue);
    doc.text("RECOMMENDED GRUNDFOS", 25 + colWidth, y + 8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.text(recommendedPump.model, 25 + colWidth, y + 18);
    doc.text(`${recommendedPump.type}`, 25 + colWidth, y + 26);
    doc.text(`Flow: ${recommendedPump.flow} | Head: ${recommendedPump.head}`, 25 + colWidth, y + 34);
    doc.text(`${recommendedPump.energyClass} | DN${recommendedPump.connection}`, 25 + colWidth, y + 42);

    y += 55;

    // Financial Summary
    doc.setTextColor(...darkBlue);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Financial Summary", 15, y);
    y += 10;

    doc.setFillColor(...green);
    doc.roundedRect(15, y, pageWidth - 30, 50, 3, 3, "F");

    doc.setTextColor(...white);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");

    const formatCurr = (val: number) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(val);

    // Row 1
    doc.text("Annual Energy Savings", 25, y + 12);
    doc.setFontSize(18);
    doc.text(formatCurr(calculations.annual_savings), 25, y + 22);

    doc.setFontSize(10);
    doc.text("Payback Period", pageWidth / 2 + 10, y + 12);
    doc.setFontSize(18);
    doc.text(`~${Math.round(calculations.payback_months)} months`, pageWidth / 2 + 10, y + 22);

    // Row 2
    doc.setFontSize(10);
    doc.text("10-Year Net Savings", 25, y + 35);
    doc.setFontSize(18);
    doc.text(formatCurr(calculations.ten_year_savings), 25, y + 45);

    doc.setFontSize(10);
    doc.text("Purchase Cost", pageWidth / 2 + 10, y + 35);
    doc.setFontSize(18);
    doc.text(formatCurr(recommendedPump.price), pageWidth / 2 + 10, y + 45);

    y += 60;

    // Sustainability Impact
    doc.setTextColor(...darkBlue);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Sustainability Impact", 15, y);
    y += 10;

    doc.setFillColor(...lightGray);
    doc.roundedRect(15, y, pageWidth - 30, 30, 3, 3, "F");

    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const thirdW = (pageWidth - 30) / 3;
    doc.text("CO\u2082 Reduction", 25, y + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`${calculations.co2_reduction_tonnes.toFixed(1)} t/yr`, 25, y + 22);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Efficiency Gain", 15 + thirdW + 10, y + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`${calculations.efficiency_improvement_pct.toFixed(0)}%`, 15 + thirdW + 10, y + 22);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Energy Class", 15 + 2 * thirdW + 10, y + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(recommendedPump.energyClass, 15 + 2 * thirdW + 10, y + 22);

    y += 40;

    // Annual cost comparison
    doc.setTextColor(...darkBlue);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Annual Energy Cost Comparison", 15, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Current: ${formatCurr(calculations.old_annual_cost)}/year`, 25, y + 5);

    doc.setTextColor(...green);
    doc.text(`Proposed: ${formatCurr(calculations.new_annual_cost)}/year`, 25, y + 13);

    y += 25;

    // Footer
    doc.setDrawColor(200, 200, 200);
    doc.line(15, y, pageWidth - 15, y);
    y += 8;

    doc.setTextColor(150, 150, 150);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(
      "This report is generated by GrundMatch AI for informational purposes. Actual savings may vary based on operating conditions.",
      15,
      y
    );
    doc.text(
      "Verify all specifications with official Grundfos documentation before purchase decisions.",
      15,
      y + 5
    );
    doc.text("Generated by GrundMatch - AI Pump Advisor for Grundfos", 15, y + 12);

    // Output as buffer
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="GrundMatch_ROI_Report_${new Date().toISOString().slice(0, 10)}.pdf"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate report", details: String(error) },
      { status: 500 }
    );
  }
}
