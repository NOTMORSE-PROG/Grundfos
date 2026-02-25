"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { EmptyState } from "./EmptyState";
import type { Message } from "@/lib/chat-store";
import { ArrowUp, ArrowDown } from "lucide-react";

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
  // Track message count to distinguish "new message added" from "streaming token"
  const prevMessageCountRef = useRef(messages.length);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distanceFromBottom < 120;
    isNearBottomRef.current = near;
    setIsNearBottom(near);
    setShowScrollTop(el.scrollTop > 200);
  }, []);

  // Auto-scroll logic:
  //  • New message added  → smooth scroll once (feels intentional)
  //  • Streaming token    → instant snap (avoids dozens of competing animations)
  //  • User scrolled up   → never force scroll in either case
  useEffect(() => {
    if (!isNearBottomRef.current) return;

    const el = scrollContainerRef.current;
    const newMessageAdded = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (newMessageAdded) {
      // A new message bubble appeared — one smooth scroll is fine
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (el) {
      // Streaming token update — instant snap, no animation, no jank
      el.scrollTop = el.scrollHeight;
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
