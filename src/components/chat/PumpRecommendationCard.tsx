"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Droplets,
  FileText,
  ExternalLink,
  Zap,
  Gauge,
  Activity,
  ThermometerSun,
  Award,
  DollarSign,
  Clock,
  Leaf,
  TrendingDown,
  Calendar,
  Loader2,
} from "lucide-react";

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

async function generatePDFReport(pump: CatalogPump) {
  const roi = pump.roi;
  if (!roi) return;

  const pumpCostPhp = parsePrice(pump.price_range_usd) * 56;
  const existingPowerEstimate = roi.old_annual_cost / (9.5 * 3500); // reverse from annual cost

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

export function PumpRecommendationCard({
  pump,
  rank = 1,
}: PumpRecommendationCardProps) {
  const [generating, setGenerating] = useState(false);
  const specs = pump.specs;
  const roi = pump.roi;

  const handleGenerateReport = async () => {
    setGenerating(true);
    try {
      await generatePDFReport(pump);
    } catch {
      // Silently fail — user sees loading stop
    } finally {
      setGenerating(false);
    }
  };

  const specItems = [
    {
      icon: Activity,
      label: "Max Flow",
      value: specs.max_flow_m3h ? `${specs.max_flow_m3h} m³/h` : null,
    },
    {
      icon: Gauge,
      label: "Max Head",
      value: specs.max_head_m ? `${specs.max_head_m} m` : null,
    },
    {
      icon: Zap,
      label: "Power",
      value: specs.power_kw ? `${specs.power_kw} kW` : null,
    },
    {
      icon: Award,
      label: "Energy Class",
      value: specs.energy_class as string | null,
    },
    {
      icon: ThermometerSun,
      label: "Temp Range",
      value: specs.temp_range_c as string | null,
    },
    {
      icon: Droplets,
      label: "Connection",
      value: specs.connection_dn ? `DN${specs.connection_dn}` : null,
    },
  ].filter((s) => s.value);

  return (
    <Card className="overflow-hidden my-3 border-border shadow-sm">
      {/* Dark header */}
      <div className="bg-grundfos-dark px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
            <Droplets className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">{pump.model}</h3>
            <p className="text-white/60 text-xs">{pump.type}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {pump.matchLabel && (
            <Badge className={`${
              pump.matchLabel === "Excellent Match" ? "bg-green-600" :
              pump.matchLabel === "Good Match" ? "bg-blue-600" :
              pump.matchLabel === "Fair Match" ? "bg-amber-600" :
              "bg-gray-500"
            } text-white border-0 text-[10px] px-2 py-0.5`}>
              {pump.matchLabel}
            </Badge>
          )}
        </div>
      </div>

      <div className="p-4">
        {/* Specs grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {specItems.slice(0, 6).map((spec) => (
            <div
              key={spec.label}
              className="bg-muted/50 rounded-lg px-2.5 py-2 text-center"
            >
              <spec.icon className="w-3.5 h-3.5 text-grundfos-blue mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground">{spec.label}</p>
              <p className="text-xs font-semibold text-foreground">
                {spec.value}
              </p>
            </div>
          ))}
        </div>

        {/* Engine-calculated ROI */}
        {roi && (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-3">
            <p className="text-[10px] font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-2">
              {pump.comparedTo
                ? `Savings vs. ${pump.comparedTo}`
                : "Energy Savings vs. Oversized Pump"}
            </p>
            <div className="grid grid-cols-3 gap-3 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                  <Calendar className="w-3.5 h-3.5 text-green-600" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Monthly</p>
                  <p className="text-sm font-bold text-green-600">
                    {formatCurrency(roi.annual_savings / 12)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                  <DollarSign className="w-3.5 h-3.5 text-green-600" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Annual</p>
                  <p className="text-sm font-bold text-green-600">
                    {formatCurrency(roi.annual_savings)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-grundfos-blue" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Payback</p>
                  <p className="text-sm font-bold text-grundfos-blue">
                    {roi.payback_months < 1
                      ? "< 1 mo"
                      : roi.payback_months === Infinity
                        ? "N/A"
                        : `~${Math.round(roi.payback_months)} mo`}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                  <Leaf className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">CO₂ Reduced</p>
                  <p className="text-sm font-bold text-emerald-600">
                    {roi.co2_reduction_tonnes.toFixed(1)} t/yr
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                  <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">10-Year</p>
                  <p className="text-sm font-bold text-amber-600">
                    {formatCurrency(roi.ten_year_savings)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Efficiency</p>
                  <p className="text-sm font-bold text-purple-600">
                    +{roi.efficiency_improvement_pct.toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>
            {/* Lifecycle cost insight on top match */}
            {rank === 1 && (
              <p className="text-[10px] text-green-700/70 dark:text-green-400/70 italic mt-2 border-t border-green-200/50 dark:border-green-800/50 pt-2">
                Purchase price is only ~10% of lifecycle cost. Energy is ~40%. Right-sizing saves the most.
              </p>
            )}
          </div>
        )}

        {/* Key features */}
        <div className="mb-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Key Features
          </p>
          <div className="flex flex-wrap gap-1">
            {pump.features.slice(0, 4).map((feature) => (
              <span
                key={feature}
                className="text-[10px] bg-grundfos-light text-grundfos-blue px-2 py-0.5 rounded-full"
              >
                {feature}
              </span>
            ))}
          </div>
        </div>

        {/* Price range */}
        <div className="flex items-center justify-between text-xs mb-3 px-1">
          <span className="text-muted-foreground">Price Range</span>
          <span className="font-semibold text-foreground">
            {pump.price_range_php || `$${pump.price_range_usd}`}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleGenerateReport}
            disabled={generating || !roi}
            className="flex-1 text-xs bg-grundfos-blue hover:bg-grundfos-blue/90 text-white h-8"
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5 mr-1.5" />
            )}
            {generating ? "Generating..." : "ROI Report"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs border-grundfos-blue/30 text-grundfos-blue hover:bg-grundfos-light h-8"
            onClick={() => {
              window.open(
                `https://product-selection.grundfos.com/search?q=${encodeURIComponent(pump.model)}`,
                "_blank"
              );
            }}
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            View Details
          </Button>
        </div>
      </div>
    </Card>
  );
}
