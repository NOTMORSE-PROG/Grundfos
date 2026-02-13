"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { EmptyState } from "./EmptyState";
import type { Message } from "@/lib/chat-store";
import { Loader2 } from "lucide-react";

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <ScrollArea className="flex-1">
        <EmptyState onPromptClick={onPromptClick} />
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="flex-1">
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
    </ScrollArea>
  );
}
