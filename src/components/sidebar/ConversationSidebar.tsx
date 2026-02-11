"use client";

import { useEffect } from "react";
import { useChatStore } from "@/lib/chat-store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  MessageSquare,
  Trash2,
  Droplets,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function ConversationSidebar() {
  const {
    conversations,
    currentConversationId,
    setConversations,
    setCurrentConversationId,
    setMessages,
    newChat,
    sidebarOpen,
    setSidebarOpen,
    sessionId,
  } = useChatStore();

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function loadConversations() {
    try {
      const res = await fetch(
        `/api/conversations?sessionId=${sessionId}`
      );
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch {
      // API not available yet
    }
  }

  async function loadConversation(id: string) {
    try {
      setCurrentConversationId(id);
      const res = await fetch(`/api/chat/${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
      setSidebarOpen(false);
    } catch {
      // Failed to load
    }
  }

  async function deleteConversation(
    e: React.MouseEvent,
    id: string
  ) {
    e.stopPropagation();
    try {
      await fetch(`/api/chat/${id}`, { method: "DELETE" });
      setConversations(
        conversations.filter((c) => c.id !== id)
      );
      if (currentConversationId === id) {
        newChat();
      }
    } catch {
      // Failed to delete
    }
  }

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-[280px] bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-sidebar-primary" />
            <span className="font-semibold text-sm">GrundMatch</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={() => {
                newChat();
                setSidebarOpen(false);
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Conversations list */}
        <ScrollArea className="flex-1 px-2 py-2">
          {conversations.length === 0 ? (
            <div className="text-center py-8 text-sidebar-foreground/50 text-xs">
              No conversations yet.
              <br />
              Start chatting to see history here.
            </div>
          ) : (
            <div className="space-y-0.5">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm transition-colors group ${
                    currentConversationId === conv.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80"
                  }`}
                >
                  <MessageSquare className="w-4 h-4 shrink-0 opacity-60" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm">{conv.title}</p>
                    <p className="text-xs opacity-50 mt-0.5">
                      {formatDistanceToNow(new Date(conv.updated_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteConversation(e, conv.id)}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="p-3 border-t border-sidebar-border text-xs text-sidebar-foreground/40 text-center">
          Powered by Grundfos AI
        </div>
      </aside>
    </>
  );
}
