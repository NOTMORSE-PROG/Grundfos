"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  GitCompare,
  Zap,
  Gauge,
  Activity,
  DollarSign,
  Leaf,
  CheckCircle2,
  ExternalLink,
  Download,
  X,
  ChevronDown,
  ChevronUp,
  Droplets,
} from "lucide-react";
import { PdfProductImage } from "@/components/chat/PdfProductImage";

interface ROISummary {
  annual_savings: number;
  co2_reduction_tonnes: number;
  ten_year_savings: number;
  payback_months: number;
}

interface ComparedPump {
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
  price_range_usd: string;
  price_range_php?: string;
  roi?: ROISummary;
}

interface PumpComparisonCardProps {
  pump1: ComparedPump;
  pump2: ComparedPump;
}

function formatCurrency(value: number): string {
  return `₱${Math.round(value).toLocaleString()}`;
}

function parsePrice(priceRange: string): number {
  const parts = priceRange.replace(/[,$]/g, "").split("-").map(Number);
  if (parts.length === 2) return (parts[0] + parts[1]) / 2;
  return parts[0] || 500;
}

// Returns "a" | "b" | "tie" for a given numeric metric (higher = better unless lowerBetter)
function winner(a: number | null, b: number | null, lowerBetter = false): "a" | "b" | "tie" {
  if (a === null || b === null) return "tie";
  if (Math.abs(a - b) < 0.001) return "tie";
  const aWins = lowerBetter ? a < b : a > b;
  return aWins ? "a" : "b";
}

function WinBadge({ side, which }: { side: "a" | "b"; which: "a" | "b" | "tie" }) {
  if (which === "tie") return null;
  const isWinner = side === which;
  if (!isWinner) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-green-600 bg-green-100 dark:bg-green-900/40 dark:text-green-400 px-1.5 py-0.5 rounded-full ml-1">
      <CheckCircle2 className="w-2.5 h-2.5" />
      Better
    </span>
  );
}

interface PumpColumnProps {
  pump: ComparedPump;
  side: "a" | "b";
  wins: { flow: "a" | "b" | "tie"; head: "a" | "b" | "tie"; savings: "a" | "b" | "tie"; price: "a" | "b" | "tie" };
  isPrimary: boolean;
}

function PumpColumn({ pump, side, wins, isPrimary }: PumpColumnProps) {
  const [datasheetOpen, setDatasheetOpen] = useState(false);
  const specs = pump.specs;
  const roi = pump.roi;

  return (
    <>
      <div className={`flex-1 min-w-0 flex flex-col rounded-xl overflow-hidden border ${isPrimary ? "border-grundfos-blue shadow-sm shadow-grundfos-blue/15 ring-1 ring-grundfos-blue/20" : "border-border"}`}>

        {/* Accent bar */}
        {isPrimary && <div className="h-[3px] bg-grundfos-blue flex-shrink-0" />}

        {/* Header */}
        <div className={`px-3 pt-2.5 pb-2 flex-shrink-0 ${isPrimary ? "bg-blue-50/40 dark:bg-blue-950/20" : ""}`}>
          <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${isPrimary ? "text-grundfos-blue" : "text-muted-foreground"}`}>
            {isPrimary ? "Option A" : "Option B"}
          </p>
          <h3 className={`font-bold text-sm leading-tight ${isPrimary ? "text-grundfos-blue" : "text-foreground"}`}>
            Grundfos {pump.model}
          </h3>
          <p className="text-muted-foreground text-[11px] leading-snug mt-0.5 line-clamp-2">
            {pump.type}
          </p>
        </div>

        {/* Product image */}
        <div className="flex-shrink-0">
          {pump.pdf_url ? (
            <PdfProductImage pdfUrl={pump.pdf_url} height={120} className="border-y border-border/50" />
          ) : (
            <div className="h-20 border-y border-border/50 bg-gradient-to-br from-grundfos-blue/8 via-grundfos-light/60 to-grundfos-blue/5 flex items-center justify-center gap-3 px-4">
              <Droplets className="w-8 h-8 text-grundfos-blue/30 flex-shrink-0" />
              <p className="text-grundfos-blue font-bold text-sm leading-tight">{pump.model}</p>
            </div>
          )}
        </div>

        {/* Specs */}
        <div className="px-3 pt-2 pb-0 flex-1">
          <div className="space-y-1.5">
            {/* Flow */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Activity className="w-3 h-3" />
                <span>Max Flow</span>
              </div>
              <div className="flex items-center">
                <span className="text-xs font-semibold">
                  {specs.max_flow_m3h ? `${specs.max_flow_m3h} m³/h` : "—"}
                </span>
                <WinBadge side={side} which={wins.flow} />
              </div>
            </div>

            {/* Head */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Gauge className="w-3 h-3" />
                <span>Max Head</span>
              </div>
              <div className="flex items-center">
                <span className="text-xs font-semibold">
                  {specs.max_head_m ? `${specs.max_head_m} m` : "—"}
                </span>
                <WinBadge side={side} which={wins.head} />
              </div>
            </div>

            {/* Power */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Zap className="w-3 h-3" />
                <span>Motor Power</span>
              </div>
              <span className="text-xs font-semibold">
                {specs.power_kw ? `${specs.power_kw} kW` : "—"}
              </span>
            </div>

            {/* Energy class */}
            {!!specs.energy_class && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Leaf className="w-3 h-3" />
                  <span>Energy Class</span>
                </div>
                <span className="text-xs font-semibold text-green-600">{String(specs.energy_class)}</span>
              </div>
            )}

            {/* Price */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <DollarSign className="w-3 h-3" />
                <span>Price</span>
              </div>
              <div className="flex items-center">
                <span className="text-xs font-semibold text-right">
                  {pump.price_range_php || `$${pump.price_range_usd}`}
                </span>
                <WinBadge side={side} which={wins.price} />
              </div>
            </div>

            {/* Savings */}
            {roi && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <DollarSign className="w-3 h-3 text-green-600" />
                  <span>Annual Savings</span>
                </div>
                <div className="flex items-center">
                  <span className="text-xs font-semibold text-green-600">
                    {formatCurrency(roi.annual_savings)}/yr
                  </span>
                  <WinBadge side={side} which={wins.savings} />
                </div>
              </div>
            )}
          </div>

          {/* Key features — top 2 only for space */}
          {pump.features.length > 0 && (
            <div className="mt-2.5 mb-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Key Features
              </p>
              <div className="flex flex-wrap gap-1">
                {pump.features.slice(0, 2).map((f) => (
                  <span key={f} className="text-[10px] bg-grundfos-light text-grundfos-blue px-1.5 py-0.5 rounded-full">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-3 pb-3 pt-1 flex gap-1.5 flex-shrink-0">
          <Button
            variant={isPrimary ? "default" : "outline"}
            size="sm"
            className={`flex-1 text-[11px] h-7 ${isPrimary ? "bg-grundfos-blue hover:bg-grundfos-blue/90 text-white" : ""}`}
            onClick={() =>
              pump.pdf_url
                ? setDatasheetOpen(true)
                : window.open(`https://product-selection.grundfos.com/search?q=${encodeURIComponent(pump.model)}`, "_blank")
            }
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Details
          </Button>
          {pump.pdf_url && (
            <Button variant="outline" size="sm" className="text-[11px] h-7 px-2" asChild>
              <a href={pump.pdf_url} download>
                <Download className="w-3 h-3" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* PDF Modal */}
      {pump.pdf_url && (
        <Dialog open={datasheetOpen} onOpenChange={setDatasheetOpen}>
          <DialogContent className="max-w-4xl w-full h-[90vh] p-0 overflow-hidden flex flex-col">
            <DialogTitle className="sr-only">Grundfos {pump.model} — Product Datasheet</DialogTitle>
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

export function PumpComparisonCard({ pump1, pump2 }: PumpComparisonCardProps) {
  const [expanded, setExpanded] = useState(false);

  const flow1 = (pump1.specs.max_flow_m3h as number) ?? null;
  const flow2 = (pump2.specs.max_flow_m3h as number) ?? null;
  const head1 = (pump1.specs.max_head_m as number) ?? null;
  const head2 = (pump2.specs.max_head_m as number) ?? null;
  const savings1 = pump1.roi?.annual_savings ?? null;
  const savings2 = pump2.roi?.annual_savings ?? null;
  const price1 = parsePrice(pump1.price_range_usd);
  const price2 = parsePrice(pump2.price_range_usd);

  const wins = {
    flow: winner(flow1, flow2),
    head: winner(head1, head2),
    savings: winner(savings1, savings2),
    price: winner(price1, price2, true), // lower price = better
  };

  return (
    <div className="my-2">
      {/* Header */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-2 mb-2 group"
      >
        <div className="flex items-center gap-1.5 bg-grundfos-blue/10 text-grundfos-blue text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full">
          <GitCompare className="w-3 h-3" />
          Side-by-Side Comparison
        </div>
        <div className="flex-1 h-px bg-border" />
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />}
      </button>

      {/* Two-column layout */}
      {expanded && (
        <div className="flex flex-col sm:flex-row gap-2">
          <PumpColumn pump={pump1} side="a" wins={wins} isPrimary={true} />
          <PumpColumn pump={pump2} side="b" wins={wins} isPrimary={false} />
        </div>
      )}

      {/* Collapsed summary */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-between bg-card border border-border rounded-xl px-4 py-2.5 hover:bg-accent/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="text-left">
              <p className="text-xs font-semibold text-grundfos-blue">{pump1.model}</p>
              {flow1 && <p className="text-[10px] text-muted-foreground">{flow1} m³/h · {head1} m</p>}
            </div>
            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">VS</span>
            <div className="text-left">
              <p className="text-xs font-semibold">{pump2.model}</p>
              {flow2 && <p className="text-[10px] text-muted-foreground">{flow2} m³/h · {head2} m</p>}
            </div>
          </div>
          <span className="text-[10px] text-grundfos-blue font-medium">Expand</span>
        </button>
      )}
    </div>
  );
}
