"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { EmptyState } from "./EmptyState";
import type { Message } from "@/lib/chat-store";
import { Loader2, ArrowUp, ArrowDown } from "lucide-react";

interface ChatMessagesProps {
  messages: Message[];
  isStreaming: boolean;
  onPromptClick: (prompt: string) => void;
}

export function ChatMessages({
  messages,
  isStreaming,
  onPromptClick,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Ref tracks the live value without re-triggering the auto-scroll effect
  const isNearBottomRef = useRef(true);
  // State drives the button visibility
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distanceFromBottom < 120;
    isNearBottomRef.current = near;
    setIsNearBottom(near);
    setShowScrollTop(el.scrollTop > 200);
  }, []);

  // Auto-scroll to bottom only when the user is already near the bottom.
  // Uses a ref so the effect doesn't re-run just because scroll position changed.
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming]);

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToBottom = () => {
    isNearBottomRef.current = true;
    setIsNearBottom(true);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  if (messages.length === 0) {
    return (
      <ScrollArea className="flex-1">
        <EmptyState onPromptClick={onPromptClick} />
      </ScrollArea>
    );
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Plain scrollable div for full ref + event access */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto"
      >
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              onSuggestionClick={onPromptClick}
              isLastMessage={index === messages.length - 1}
              isStreaming={isStreaming}
            />
          ))}

          {isStreaming &&
            messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-grundfos-light border border-grundfos-blue/20">
                  <Loader2 className="w-4 h-4 text-grundfos-blue animate-spin" />
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-tl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-grundfos-blue/40 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-grundfos-blue/40 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-grundfos-blue/40 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Scroll to bottom — visible when user has scrolled up */}
      {!isNearBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 z-10 w-9 h-9 rounded-full bg-grundfos-blue text-white shadow-lg flex items-center justify-center hover:bg-grundfos-dark transition-colors"
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Scroll to top — visible when user has scrolled more than 200px down */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className={`absolute right-4 z-10 w-9 h-9 rounded-full bg-white border border-grundfos-blue/30 text-grundfos-blue shadow-lg flex items-center justify-center hover:bg-grundfos-light transition-colors ${!isNearBottom ? "bottom-14" : "bottom-4"}`}
          aria-label="Scroll to top"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
