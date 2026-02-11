"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Square } from "lucide-react";
import { ImageUpload } from "./ImageUpload";

interface ChatInputProps {
  onSend: (message: string) => void;
  isStreaming: boolean;
  onStop?: () => void;
  initialValue?: string;
  onImageProcessed?: (result: {
    imageUrl: string;
    ocrText: string;
    parsedInfo: Record<string, string | null>;
  }) => void;
}

export function ChatInput({
  onSend,
  isStreaming,
  onStop,
  initialValue,
  onImageProcessed,
}: ChatInputProps) {
  const [input, setInput] = useState(initialValue || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialValue) {
      setInput(initialValue);
      textareaRef.current?.focus();
    }
  }, [initialValue]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
  };

  return (
    <div className="border-t border-border bg-background px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end gap-2 bg-card border border-border rounded-2xl px-4 py-2 focus-within:border-grundfos-blue/50 focus-within:ring-1 focus-within:ring-grundfos-blue/20 transition-all">
          <ImageUpload
            onImageProcessed={(result) => onImageProcessed?.(result)}
            disabled={isStreaming}
          />

          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about Grundfos pumps..."
            className="min-h-[24px] max-h-[200px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 p-0 text-sm"
            rows={1}
            disabled={isStreaming}
          />

          {isStreaming ? (
            <Button
              onClick={onStop}
              size="icon"
              variant="outline"
              className="shrink-0 h-8 w-8 rounded-lg border-grundfos-blue/30"
            >
              <Square className="h-3 w-3 fill-grundfos-blue text-grundfos-blue" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              size="icon"
              disabled={!input.trim()}
              className="shrink-0 h-8 w-8 rounded-lg bg-grundfos-blue hover:bg-grundfos-dark disabled:opacity-30"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          GrundMatch may make mistakes. Verify pump specifications with official
          Grundfos documentation.
        </p>
      </div>
    </div>
  );
}
