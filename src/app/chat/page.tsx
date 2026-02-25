"use client";

import { useState, useCallback, useEffect } from "react";
import { useChatStore } from "@/lib/chat-store";
import { ConversationSidebar } from "@/components/sidebar/ConversationSidebar";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { AuthModal } from "@/components/auth/AuthModal";
import { Button } from "@/components/ui/button";
import { Menu, Droplets, LogIn, LogOut } from "lucide-react";
import { getUser, getSession, signOut } from "@/lib/auth";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export default function Home() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    getUser().then(setUser);
  }, []);

  const handleAuthSuccess = async () => {
    const u = await getUser();
    setUser(u);
    bumpConversationsVersion();
  };

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
  };

  const {
    messages,
    isStreaming,
    currentConversationId,
    sessionId,
    sidebarOpen,
    addMessage,
    appendToLastMessage,
    replaceLastMessageContent,
    updateLastMessageMetadata,
    setIsStreaming,
    setCurrentConversationId,
    setSidebarOpen,
    bumpConversationsVersion,
    addConversation,
  } = useChatStore();

  const [pendingPrompt, setPendingPrompt] = useState<string>("");
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return;
      setPendingPrompt(""); // Clear pending prompt so input doesn't re-fill after send

      // Add user message
      const userMessage = {
        id: crypto.randomUUID(),
        role: "user" as const,
        content,
        created_at: new Date().toISOString(),
      };
      addMessage(userMessage);

      // Add empty assistant message
      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: "",
        created_at: new Date().toISOString(),
      };
      addMessage(assistantMessage);

      setIsStreaming(true);
      const controller = new AbortController();
      setAbortController(controller);

      // Build conversation history for the engine (it needs ALL messages for intent extraction)
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      // For guests (no Supabase): send the last assistant message's engineAction
      // AND whether any recommendation was ever shown — so the server stays in
      // post-rec mode even after a clarifying "ask" turn comes between a recommendation
      // and the next user message (e.g., "hmmm" → "Too expensive" chain).
      const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
      const lastEngineAction = lastAssistantMsg?.metadata?.engineAction as string | undefined;
      const hadRecommendation = messages.some((m) => m.metadata?.engineAction === "recommend");

      try {
        const session = await getSession();
        const fetchHeaders: Record<string, string> = { "Content-Type": "application/json" };
        if (session?.access_token) {
          fetchHeaders["Authorization"] = `Bearer ${session.access_token}`;
        }

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: fetchHeaders,
          body: JSON.stringify({
            message: content,
            conversationId: currentConversationId,
            sessionId,
            history,
            lastEngineAction,
            hadRecommendation,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to send message");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr);

              if (data.type === "conversation_id") {
                setCurrentConversationId(data.id);
                // Optimistic insert — show conversation in sidebar immediately
                // with placeholder title (like ChatGPT). Real title arrives after done.
                if (!currentConversationId) {
                  addConversation({ id: data.id, title: "New Chat", updated_at: new Date().toISOString() });
                }
              } else if (data.type === "token") {
                appendToLastMessage(data.content);
              } else if (data.type === "replace_content") {
                replaceLastMessageContent(data.content);
              } else if (data.type === "metadata") {
                updateLastMessageMetadata({
                  suggestions: data.suggestions,
                  requirements: data.requirements,
                  pumps: data.pumps,
                  engineAction: data.engineAction,
                });
              } else if (data.type === "done") {
                // Stream complete — reload sidebar so title is up to date
                bumpConversationsVersion();
              } else if (data.type === "error") {
                appendToLastMessage(
                  "\n\n*Error: " + data.message + "*"
                );
              }
            } catch {
              // Parse error, skip
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          appendToLastMessage(
            "\n\n*Sorry, an error occurred. Please try again.*"
          );
        }
      } finally {
        setIsStreaming(false);
        setAbortController(null);
      }
    },
    [
      messages,
      isStreaming,
      currentConversationId,
      sessionId,
      addMessage,
      appendToLastMessage,
      replaceLastMessageContent,
      updateLastMessageMetadata,
      setIsStreaming,
      setCurrentConversationId,
      bumpConversationsVersion,
      addConversation,
    ]
  );

  const handlePromptClick = useCallback(
    (prompt: string) => {
      if (messages.length > 0 && !isStreaming) {
        // Mid-conversation suggestion click → send immediately
        sendMessage(prompt);
      } else {
        // Empty state prompt click → fill input for user to customize
        setPendingPrompt(prompt);
      }
    },
    [messages.length, isStreaming, sendMessage]
  );

  const handleStop = () => {
    abortController?.abort();
    setIsStreaming(false);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <ConversationSidebar />

      {/* Main chat area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-grundfos-blue" />
            <div className="flex flex-col leading-tight">
              <h1 className="font-semibold text-grundfos-dark text-sm">
                Dewey
              </h1>
              <span className="text-[10px] text-muted-foreground">by GrundMatch</span>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground hidden sm:block">
              AI Pump Advisor
            </span>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden sm:block">
                  {user.email}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-grundfos-blue/30 text-grundfos-blue hover:bg-grundfos-light"
                onClick={() => setAuthModalOpen(true)}
              >
                <LogIn className="h-3.5 w-3.5 mr-1.5" />
                Sign in
              </Button>
            )}
          </div>
        </header>

        <AuthModal
          open={authModalOpen}
          onOpenChange={setAuthModalOpen}
          onAuthSuccess={handleAuthSuccess}
        />

        {/* Messages */}
        <ChatMessages
          messages={messages}
          isStreaming={isStreaming}
          onPromptClick={handlePromptClick}
        />

        {/* Input */}
        <ChatInput
          onSend={sendMessage}
          isStreaming={isStreaming}
          onStop={handleStop}
          value={pendingPrompt}
          onValueChange={setPendingPrompt}
        />
      </main>
    </div>
  );
}
