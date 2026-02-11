"use client";

import { Droplets, Wrench, Ruler, Camera, Zap } from "lucide-react";

interface EmptyStateProps {
  onPromptClick: (prompt: string) => void;
}

const SUGGESTED_PROMPTS = [
  {
    icon: Wrench,
    text: "My building's pump just broke down",
    description: "Get a replacement recommendation",
  },
  {
    icon: Ruler,
    text: "I need a pump for 25 m\u00B3/h at 45m head",
    description: "Find the right pump for your specs",
  },
  {
    icon: Camera,
    text: "I have a photo of my pump nameplate",
    description: "Upload and get an instant match",
  },
  {
    icon: Zap,
    text: "Help me right-size my pump to save energy",
    description: "Reduce oversizing and cut costs",
  },
];

export function EmptyState({ onPromptClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-12">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl bg-grundfos-blue flex items-center justify-center">
          <Droplets className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-grundfos-dark">GrundMatch</h1>
      </div>

      <p className="text-muted-foreground text-center mb-10 max-w-md">
        Your AI Pump Advisor — find the right Grundfos pump, prove the savings,
        and generate ROI business cases.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt.text}
            onClick={() => onPromptClick(prompt.text)}
            className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:bg-grundfos-light hover:border-grundfos-blue/30 transition-all text-left group"
          >
            <prompt.icon className="w-5 h-5 mt-0.5 text-grundfos-blue shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground group-hover:text-grundfos-dark">
                {prompt.text}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {prompt.description}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
