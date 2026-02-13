"use client";

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
} from "lucide-react";

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
  calculatedSavings?: {
    annualEnergyCost?: string;
    annualSavings?: string;
    co2Reduction?: string;
    paybackPeriod?: string;
  } | null;
}

interface PumpRecommendationCardProps {
  pump: CatalogPump;
  rank?: number;
  onGenerateReport?: () => void;
}

export function PumpRecommendationCard({
  pump,
  rank = 1,
  onGenerateReport,
}: PumpRecommendationCardProps) {
  const specs = pump.specs;

  // Build specs display
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
      {/* Dark header with pump name */}
      <div className="bg-grundfos-dark px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
            <Droplets className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">
              {pump.model}
            </h3>
            <p className="text-white/60 text-xs">{pump.type}</p>
          </div>
        </div>
        {rank === 1 && (
          <Badge className="bg-grundfos-blue text-white border-0 text-[10px] px-2 py-0.5">
            Best Match
          </Badge>
        )}
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

        {/* AI-calculated savings */}
        {pump.calculatedSavings && (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-3">
            <p className="text-[10px] font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-2">
              Energy Savings Analysis
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {pump.calculatedSavings.annualEnergyCost && (
                <div>
                  <span className="text-muted-foreground">Annual Cost: </span>
                  <span className="font-medium">
                    {pump.calculatedSavings.annualEnergyCost}
                  </span>
                </div>
              )}
              {pump.calculatedSavings.annualSavings && (
                <div>
                  <span className="text-muted-foreground">Savings: </span>
                  <span className="font-semibold text-green-600">
                    {pump.calculatedSavings.annualSavings}
                  </span>
                </div>
              )}
              {pump.calculatedSavings.co2Reduction && (
                <div>
                  <span className="text-muted-foreground">CO₂ Reduced: </span>
                  <span className="font-medium">
                    {pump.calculatedSavings.co2Reduction}
                  </span>
                </div>
              )}
              {pump.calculatedSavings.paybackPeriod && (
                <div>
                  <span className="text-muted-foreground">Payback: </span>
                  <span className="font-medium">
                    {pump.calculatedSavings.paybackPeriod}
                  </span>
                </div>
              )}
            </div>
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
            ${pump.price_range_usd}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {onGenerateReport && (
            <Button
              variant="default"
              size="sm"
              onClick={onGenerateReport}
              className="flex-1 text-xs bg-grundfos-blue hover:bg-grundfos-blue/90 text-white h-8"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              ROI Report
            </Button>
          )}
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
