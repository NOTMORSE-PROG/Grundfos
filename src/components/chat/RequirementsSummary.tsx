"use client";

import { Card } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

interface Requirement {
  label: string;
  value: string;
}

interface RequirementsSummaryProps {
  title?: string;
  requirements: Requirement[];
}

export function RequirementsSummary({
  title = "Gathered Requirements",
  requirements
}: RequirementsSummaryProps) {
  return (
    <Card className="bg-grundfos-light/50 border-grundfos-blue/20 my-3">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="w-4 h-4 text-grundfos-blue" />
          <h4 className="text-sm font-semibold text-grundfos-dark">{title}</h4>
        </div>
        <div className="space-y-2">
          {requirements.map((req, index) => (
            <div key={index} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{req.label}:</span>
              <span className="font-medium text-grundfos-dark">{req.value}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
