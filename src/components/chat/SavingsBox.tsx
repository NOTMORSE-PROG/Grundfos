"use client";

import { DollarSign, Leaf, Clock, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";

interface SavingsBoxProps {
  annualSavings: number;
  paybackMonths: number;
  co2Reduction: number;
  efficiencyImprovement: number;
  currency?: string;
}

export function SavingsBox({
  annualSavings,
  paybackMonths,
  co2Reduction,
  efficiencyImprovement,
  currency = "USD",
}: SavingsBoxProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <Card className="border-l-4 border-l-grundfos-blue bg-grundfos-light/50 p-4 my-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Annual Savings</p>
            <p className="text-lg font-bold text-green-600">
              {formatCurrency(annualSavings)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
            <Clock className="w-4 h-4 text-grundfos-blue" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Payback Period</p>
            <p className="text-lg font-bold text-grundfos-blue">
              {paybackMonths < 1
                ? "< 1 month"
                : `~${Math.round(paybackMonths)} months`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Leaf className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">CO2 Reduction</p>
            <p className="text-lg font-bold text-emerald-600">
              {co2Reduction.toFixed(1)} t/yr
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <Zap className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Efficiency Gain</p>
            <p className="text-lg font-bold text-amber-600">
              {efficiencyImprovement.toFixed(0)}%
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
