"use client";

import { Button } from "@/components/ui/button";

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (value: string) => void;
}

export function SuggestionChips({ suggestions, onSelect }: SuggestionChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {suggestions.map((suggestion, index) => (
        <Button
          key={index}
          variant="outline"
          size="sm"
          onClick={() => onSelect(suggestion)}
          className="text-xs rounded-full border-grundfos-blue/30 text-grundfos-dark hover:bg-grundfos-light hover:border-grundfos-blue"
        >
          {suggestion}
        </Button>
      ))}
    </div>
  );
}
