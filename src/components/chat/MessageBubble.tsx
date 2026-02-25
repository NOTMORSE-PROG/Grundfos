"use client";

import { useMemo } from "react";
import { User, Droplets } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/lib/chat-store";
import { parseMessageMetadata } from "@/lib/parse-message-metadata";
import { SuggestionChips } from "./SuggestionChips";
import { RequirementsSummary } from "./RequirementsSummary";
import { PumpRecommendationCard } from "./PumpRecommendationCard";
import { PumpComparisonCard } from "./PumpComparisonCard";

interface MessageBubbleProps {
  message: Message;
  onSuggestionClick?: (value: string) => void;
  isLastMessage?: boolean;
  isStreaming?: boolean;
}

export function MessageBubble({
  message,
  onSuggestionClick,
  isLastMessage = false,
  isStreaming = false,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  const parsed = useMemo(() => {
    if (isUser) return { content: message.content };
    return parseMessageMetadata(message.content);
  }, [message.content, isUser]);

  const suggestions =
    (message.metadata?.suggestions as string[] | undefined) ??
    parsed.suggestions;
  const requirements =
    (message.metadata?.requirements as
      | Array<{ label: string; value: string }>
      | undefined) ?? parsed.requirements;
  const pumps = message.metadata?.pumps as
    | Array<Record<string, unknown>>
    | undefined;
  const isComparison = !!(message.metadata?.isComparison);

  const displayContent = isUser ? message.content : parsed.content;

  const textContent = useMemo(() => {
    if (!pumps || pumps.length === 0) return displayContent;
    let cleaned = displayContent;
    cleaned = cleaned.replace(
      /\*\*Recommended:\s*[^*]+\*\*[\s\S]*?(?=\*\*Recommended:|\n\n[^-*]|$)/g,
      ""
    );
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
    return cleaned;
  }, [displayContent, pumps]);

  const showSuggestions =
    isLastMessage && !isStreaming && suggestions && suggestions.length > 0;
  const hasPumps = pumps && pumps.length > 0;

  // ── User message — right-aligned bubble ─────────────────────────────────
  if (isUser) {
    return (
      <div className="flex gap-3 flex-row-reverse mb-6">
        <div className="w-8 h-8 rounded-full bg-grundfos-blue flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-white" />
        </div>
        <div className="max-w-[75%]">
          <div className="inline-block rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm bg-grundfos-blue text-white">
            <p className="whitespace-pre-wrap text-left">{displayContent}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Bot message — left-aligned with bubble + "Dewey" name ────────────────

  // While streaming and no content yet → show thinking dots inside this bubble
  const isThinking = isLastMessage && isStreaming && !textContent;

  return (
    <div className="flex gap-3 mb-6">
      <div className="w-8 h-8 rounded-full bg-grundfos-light border border-grundfos-blue/20 flex items-center justify-center shrink-0">
        <Droplets className="w-4 h-4 text-grundfos-blue" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-grundfos-blue mb-1">GrundMatch</p>

        {isThinking && (
          <div className="inline-block rounded-2xl rounded-tl-sm px-4 py-3 bg-card border border-border">
            <div className="flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-grundfos-blue/60 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-grundfos-blue/60 rounded-full animate-bounce [animation-delay:120ms]" />
              <span className="w-1.5 h-1.5 bg-grundfos-blue/60 rounded-full animate-bounce [animation-delay:240ms]" />
            </div>
          </div>
        )}

        {textContent && (
          <div className="inline-block rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm bg-card border border-border">
            <div className="prose prose-sm max-w-none prose-headings:text-grundfos-dark prose-strong:text-foreground prose-p:text-foreground/90 prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {textContent}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {requirements && requirements.length > 0 && (
          <RequirementsSummary requirements={requirements} />
        )}

        {hasPumps && isComparison && pumps.length >= 2 && (
          <PumpComparisonCard
            pump1={pumps[0] as never}
            pump2={pumps[1] as never}
          />
        )}

        {hasPumps && !isComparison &&
          pumps.map((pump, index) => (
            <PumpRecommendationCard
              key={(pump.id as string) || index}
              pump={pump as never}
              rank={index + 1}
            />
          ))}

        {showSuggestions && onSuggestionClick && (
          <SuggestionChips
            suggestions={suggestions}
            onSelect={onSuggestionClick}
          />
        )}
      </div>
    </div>
  );
}
