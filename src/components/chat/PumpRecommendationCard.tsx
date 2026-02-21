"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Star,
  FileText,
  ExternalLink,
  Zap,
  Gauge,
  Activity,
  ThermometerSun,
  DollarSign,
  Leaf,
  TrendingDown,
  Calendar,
  Loader2,
  Download,
  X,
  ChevronDown,
  ChevronUp,
  Droplets,
} from "lucide-react";
import { PdfProductImage } from "@/components/chat/PdfProductImage";

interface ROISummary {
  old_annual_cost: number;
  new_annual_cost: number;
  annual_savings: number;
  payback_months: number;
  co2_reduction_tonnes: number;
  ten_year_savings: number;
  efficiency_improvement_pct: number;
}

interface CatalogPump {
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
  price_range_php?: string;
  roi?: ROISummary;
  oversizingNote?: string;
  matchConfidence?: number;
  matchLabel?: string;
  comparedTo?: string;
}

interface PumpRecommendationCardProps {
  pump: CatalogPump;
  rank?: number;
}

function formatCurrency(value: number): string {
  return `₱${Math.round(value).toLocaleString()}`;
}

function parsePrice(priceRange: string): number {
  const parts = priceRange.replace(/[,$]/g, "").split("-").map(Number);
  if (parts.length === 2) return (parts[0] + parts[1]) / 2;
  return parts[0] || 500;
}

function matchBadgeStyle(confidence?: number): string {
  if (!confidence) return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
  if (confidence >= 85) return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400";
  if (confidence >= 65) return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400";
  return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400";
}

async function generatePDFReport(pump: CatalogPump) {
  const roi = pump.roi;
  if (!roi) return;

  const pumpCostPhp = parsePrice(pump.price_range_usd) * 56;
  const existingPowerEstimate = roi.old_annual_cost / (9.5 * 3500);

  const response = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      currentPump: {
        brand: pump.comparedTo || "Typical Oversized Pump",
        model: pump.comparedTo || "Industry Average",
        power_kw: Math.round(existingPowerEstimate * 100) / 100,
      },
      recommendedPump: {
        model: pump.model,
        type: pump.type,
        power_kw: pump.specs.power_kw,
        flow: `${pump.specs.max_flow_m3h} m³/h`,
        head: `${pump.specs.max_head_m} m`,
        energyClass: pump.specs.energy_class || "A",
        connection: pump.specs.connection_dn || "",
        price: pumpCostPhp,
      },
      calculations: {
        annual_savings: roi.annual_savings,
        payback_months: roi.payback_months,
        co2_reduction_tonnes: roi.co2_reduction_tonnes,
        efficiency_improvement_pct: roi.efficiency_improvement_pct,
        ten_year_savings: roi.ten_year_savings,
        old_annual_cost: roi.old_annual_cost,
        new_annual_cost: roi.new_annual_cost,
      },
      currency: "PHP",
    }),
  });

  if (!response.ok) throw new Error("Failed to generate report");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `GrundMatch_ROI_${pump.model.replace(/\s/g, "_")}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function PumpRecommendationCard({ pump, rank = 1 }: PumpRecommendationCardProps) {
  const [generating, setGenerating] = useState(false);
  const [datasheetOpen, setDatasheetOpen] = useState(false);
  const [roiExpanded, setRoiExpanded] = useState(false);
  const specs = pump.specs;
  const roi = pump.roi;
  const isBest = rank === 1;

  const handleGenerateReport = async () => {
    setGenerating(true);
    try { await generatePDFReport(pump); }
    catch { /* silent */ }
    finally { setGenerating(false); }
  };

  const specRows = [
    { icon: Activity,      label: "Flow Rate",   value: specs.max_flow_m3h ? `0–${specs.max_flow_m3h} m³/h` : null },
    { icon: Gauge,         label: "Max Head",    value: specs.max_head_m   ? `${specs.max_head_m} m`          : null },
    { icon: Zap,           label: "Motor Power", value: specs.power_kw     ? `${specs.power_kw} kW`            : null },
    { icon: ThermometerSun,label: "Temperature", value: specs.temp_range_c ? `${specs.temp_range_c}°C`         : null },
  ].filter((s) => s.value);

  return (
    <>
      {/* ── BEST MATCH label above the card ──────────────────────────── */}
      {isBest && (
        <div className="flex items-center gap-1.5 mb-1.5 ml-0.5">
          <div className="inline-flex items-center gap-1.5 bg-grundfos-blue text-white text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full shadow">
            <Star className="w-3 h-3 fill-white" />
            Best Match
          </div>
        </div>
      )}

      <Card className={`overflow-hidden my-1 transition-shadow ${
        isBest
          ? "border-grundfos-blue shadow-md shadow-grundfos-blue/20 ring-1 ring-grundfos-blue/25"
          : "border-border shadow-sm"
      }`}>

        {/* ── Thin blue accent bar (best match only) ────────────────── */}
        {isBest && <div className="h-[3px] bg-grundfos-blue" />}

        {/* ── Title row ─────────────────────────────────────────────── */}
        <div className={`px-3 pt-2.5 pb-2 flex items-start justify-between gap-2 ${isBest ? "bg-blue-50/40 dark:bg-blue-950/20" : ""}`}>
          <div className="min-w-0">
            <h3 className={`font-bold text-sm leading-tight ${isBest ? "text-grundfos-blue" : "text-foreground"}`}>
              Grundfos {pump.model}
            </h3>
            <p className="text-muted-foreground text-[11px] leading-snug mt-0.5 line-clamp-1">
              {pump.type}
            </p>
          </div>
          {pump.matchConfidence != null && (
            <span className={`flex-shrink-0 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${matchBadgeStyle(pump.matchConfidence)}`}>
              {pump.matchConfidence}% Match
            </span>
          )}
        </div>

        {/* ── Product image — PDF preview or branded placeholder ──── */}
        {pump.pdf_url ? (
          <PdfProductImage
            pdfUrl={pump.pdf_url}
            height={160}
            className="border-y border-border/50"
          />
        ) : (
          <div className="h-28 border-y border-border/50 bg-gradient-to-br from-grundfos-blue/8 via-grundfos-light/60 to-grundfos-blue/5 flex items-center justify-center gap-4 px-6">
            <Droplets className="w-10 h-10 text-grundfos-blue/30 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-grundfos-blue font-bold text-base leading-tight">{pump.model}</p>
              <p className="text-grundfos-blue/50 text-xs mt-0.5 line-clamp-2">{pump.type}</p>
            </div>
          </div>
        )}

        <div className="px-3 pb-3 pt-2.5">
          {/* ── 2-column spec grid ──────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3">
            {specRows.map((s) => (
              <div key={s.label} className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{s.label}</span>
                <span className="text-xs font-semibold text-foreground mt-0.5">{s.value}</span>
              </div>
            ))}
          </div>

          {/* ── Key Features ─────────────────────────────────────────── */}
          {pump.features.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Key Features
              </p>
              <div className="flex flex-wrap gap-1">
                {pump.features.slice(0, 3).map((f) => (
                  <span key={f} className="text-[10px] bg-grundfos-light text-grundfos-blue px-2 py-0.5 rounded-full">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── ROI strip (expandable) ───────────────────────────────── */}
          {roi && (
            <div className="mb-3">
              <button
                onClick={() => setRoiExpanded((p) => !p)}
                className="w-full flex items-center justify-between bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 text-left hover:bg-green-50/80 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                    Saves {formatCurrency(roi.annual_savings)}/yr
                  </span>
                  <span className="text-[10px] text-green-600/70 dark:text-green-500/70 hidden sm:inline">
                    · Payback ~{Math.round(roi.payback_months)} mo
                  </span>
                </div>
                {roiExpanded
                  ? <ChevronUp className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                  : <ChevronDown className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />}
              </button>

              {roiExpanded && (
                <div className="border border-t-0 border-green-200 dark:border-green-800 rounded-b-lg px-3 py-2.5 bg-green-50/50 dark:bg-green-950/20">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { icon: Calendar, label: "Monthly",  val: formatCurrency(roi.annual_savings / 12), color: "text-green-600",  bg: "bg-green-100 dark:bg-green-900/50" },
                      { icon: TrendingDown, label: "10-Year", val: formatCurrency(roi.ten_year_savings), color: "text-amber-600",  bg: "bg-amber-100 dark:bg-amber-900/50" },
                      { icon: Leaf,     label: "CO₂/yr",   val: `${roi.co2_reduction_tonnes.toFixed(1)} t`, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/50" },
                    ].map(({ icon: Icon, label, val, color, bg }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${bg}`}>
                          <Icon className={`w-3 h-3 ${color}`} />
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground">{label}</p>
                          <p className={`text-xs font-bold ${color}`}>{val}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {isBest && (
                    <p className="text-[9px] text-green-700/60 dark:text-green-400/60 italic mt-2 pt-1.5 border-t border-green-200/50 dark:border-green-800/50">
                      Energy accounts for ~40% of pump lifecycle cost. Right-sizing maximises savings.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Action buttons ───────────────────────────────────────── */}
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1 text-xs bg-grundfos-blue hover:bg-grundfos-blue/90 text-white h-8"
              onClick={() => pump.pdf_url
                ? setDatasheetOpen(true)
                : window.open(`https://product-selection.grundfos.com/search?q=${encodeURIComponent(pump.model)}`, "_blank")
              }
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              View Full Details
            </Button>

            {pump.pdf_url && (
              <Button variant="outline" size="sm" className="flex-1 text-xs h-8" asChild>
                <a href={pump.pdf_url} download>
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download Datasheet
                </a>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateReport}
              disabled={generating || !roi}
              className="text-xs h-8 px-2.5"
              title="Generate ROI Report"
            >
              {generating
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <FileText className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      </Card>

      {/* ── PDF Datasheet Modal ──────────────────────────────────────── */}
      {pump.pdf_url && (
        <Dialog open={datasheetOpen} onOpenChange={setDatasheetOpen}>
          <DialogContent className="max-w-4xl w-full h-[90vh] p-0 overflow-hidden flex flex-col">
            <div className="bg-grundfos-dark px-5 py-3 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-white font-semibold text-sm">Grundfos {pump.model} — Product Datasheet</p>
                <p className="text-white/50 text-xs">Technical specs, performance curves & dimensions</p>
              </div>
              <div className="flex items-center gap-2">
                <a href={pump.pdf_url} download className="text-white/70 hover:text-white text-xs flex items-center gap-1 px-2 py-1 rounded border border-white/20 hover:border-white/40 transition-colors">
                  <Download className="w-3 h-3" />
                  Download
                </a>
                <button onClick={() => setDatasheetOpen(false)} className="text-white/70 hover:text-white ml-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <embed src={`${pump.pdf_url}#toolbar=0&navpanes=0&scrollbar=1`} type="application/pdf" className="w-full h-full" />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
