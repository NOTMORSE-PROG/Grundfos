"use client";

import { useMemo } from "react";
import { Droplets, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/lib/chat-store";
import { parseMessageMetadata } from "@/lib/parse-message-metadata";
import { SuggestionChips } from "./SuggestionChips";
import { RequirementsSummary } from "./RequirementsSummary";
import { PumpRecommendationCard } from "./PumpRecommendationCard";

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

  // Client-side parsing: always parse content to strip markers + extract metadata
  const parsed = useMemo(() => {
    if (isUser) return { content: message.content };
    return parseMessageMetadata(message.content);
  }, [message.content, isUser]);

  // Use metadata from backend if available, otherwise use client-side parsed
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

  // Use cleaned content (markers stripped)
  const displayContent = isUser ? message.content : parsed.content;

  // If we have pump cards, strip the markdown recommendation blocks from text
  const textContent = useMemo(() => {
    if (!pumps || pumps.length === 0) return displayContent;
    // Strip **Recommended: ...** blocks and the bullet points after them
    let cleaned = displayContent;
    // Remove "**Recommended: Model**" headers and following bullet list
    cleaned = cleaned.replace(
      /\*\*Recommended:\s*[^*]+\*\*[\s\S]*?(?=\*\*Recommended:|\n\n[^-*]|$)/g,
      ""
    );
    // Clean up excessive newlines
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
    return cleaned;
  }, [displayContent, pumps]);

  // Only show suggestions on the last assistant message and not while streaming
  const showSuggestions =
    isLastMessage && !isStreaming && suggestions && suggestions.length > 0;
  const hasPumps = pumps && pumps.length > 0 && !isStreaming;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""} mb-4`}>
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          isUser
            ? "bg-grundfos-blue"
            : "bg-grundfos-light border border-grundfos-blue/20"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Droplets className="w-4 h-4 text-grundfos-blue" />
        )}
      </div>

      <div
        className={`max-w-[80%] ${isUser ? "text-right" : "text-left"}`}
      >
        {isUser ? (
          <div className="inline-block rounded-2xl px-4 py-2.5 text-sm bg-grundfos-blue text-white rounded-tr-md">
            <p className="whitespace-pre-wrap">{displayContent}</p>
          </div>
        ) : (
          <>
            {/* Text content bubble */}
            {textContent && (
              <div className="inline-block rounded-2xl px-4 py-2.5 text-sm bg-card border border-border rounded-tl-md">
                <div className="prose prose-sm max-w-none prose-headings:text-grundfos-dark prose-strong:text-foreground prose-p:text-foreground/90 prose-p:my-2 prose-ul:my-2 prose-ol:my-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {textContent}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {/* Requirements summary — BEFORE pump cards */}
            {requirements && requirements.length > 0 && (
              <RequirementsSummary requirements={requirements} />
            )}

            {/* Pump recommendation cards */}
            {hasPumps &&
              pumps.map((pump, index) => (
                <PumpRecommendationCard
                  key={(pump.id as string) || index}
                  pump={pump as never}
                  rank={index + 1}
                  onGenerateReport={() => {
                    // TODO: wire up PDF generation
                  }}
                />
              ))}

            {/* Suggestion chips */}
            {showSuggestions && onSuggestionClick && (
              <SuggestionChips
                suggestions={suggestions}
                onSelect={onSuggestionClick}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
