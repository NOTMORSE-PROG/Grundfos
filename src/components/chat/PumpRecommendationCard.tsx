"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SavingsBox } from "./SavingsBox";
import { FileText, Droplets } from "lucide-react";

interface PumpRecommendation {
  model: string;
  type: string;
  specs: {
    flow: string;
    head: string;
    power: string;
    energyClass: string;
    connection: string;
  };
  savings?: {
    annualSavings: number;
    paybackMonths: number;
    co2Reduction: number;
    efficiencyImprovement: number;
    currency?: string;
  };
}

interface PumpRecommendationCardProps {
  recommendation: PumpRecommendation;
  onGenerateReport?: () => void;
}

export function PumpRecommendationCard({
  recommendation,
  onGenerateReport,
}: PumpRecommendationCardProps) {
  return (
    <Card className="border-l-4 border-l-grundfos-blue overflow-hidden my-3">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-grundfos-blue flex items-center justify-center">
            <Droplets className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-grundfos-dark">
              Recommended: {recommendation.model}
            </h3>
            <p className="text-xs text-muted-foreground">
              {recommendation.type}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs mb-3">
          <div className="bg-muted rounded-lg px-3 py-2">
            <span className="text-muted-foreground">Flow:</span>{" "}
            <span className="font-medium">{recommendation.specs.flow}</span>
          </div>
          <div className="bg-muted rounded-lg px-3 py-2">
            <span className="text-muted-foreground">Head:</span>{" "}
            <span className="font-medium">{recommendation.specs.head}</span>
          </div>
          <div className="bg-muted rounded-lg px-3 py-2">
            <span className="text-muted-foreground">Power:</span>{" "}
            <span className="font-medium">{recommendation.specs.power}</span>
          </div>
          <div className="bg-muted rounded-lg px-3 py-2">
            <span className="text-muted-foreground">Energy:</span>{" "}
            <span className="font-medium">
              {recommendation.specs.energyClass}
            </span>
          </div>
          <div className="bg-muted rounded-lg px-3 py-2">
            <span className="text-muted-foreground">DN:</span>{" "}
            <span className="font-medium">
              {recommendation.specs.connection}
            </span>
          </div>
        </div>

        {recommendation.savings && (
          <SavingsBox {...recommendation.savings} />
        )}

        <div className="flex gap-2 mt-3">
          {onGenerateReport && (
            <Button
              variant="outline"
              size="sm"
              onClick={onGenerateReport}
              className="text-xs border-grundfos-blue/30 text-grundfos-blue hover:bg-grundfos-light"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Generate ROI Report
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
