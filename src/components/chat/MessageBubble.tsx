"use client";

import { Droplets, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/lib/chat-store";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""} mb-6`}>
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
        className={`max-w-[80%] ${
          isUser ? "text-right" : "text-left"
        }`}
      >
        <div
          className={`inline-block rounded-2xl px-4 py-3 text-sm ${
            isUser
              ? "bg-grundfos-blue text-white rounded-tr-md"
              : "bg-card border border-border rounded-tl-md"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none prose-headings:text-grundfos-dark prose-strong:text-foreground prose-p:text-foreground/90">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
