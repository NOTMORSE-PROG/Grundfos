"use client";

import { useState, useCallback, useEffect } from "react";
import { useChatStore } from "@/lib/chat-store";
import { ConversationSidebar } from "@/components/sidebar/ConversationSidebar";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { AuthModal } from "@/components/auth/AuthModal";
import { Button } from "@/components/ui/button";
import { Menu, Droplets, LogIn, LogOut } from "lucide-react";
import { getUser, signOut } from "@/lib/auth";
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
  } = useChatStore();

  const [pendingPrompt, setPendingPrompt] = useState<string>("");
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return;

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

      // Count user messages (including the one we just added)
      const userMsgCount = messages.filter((m) => m.role === "user").length + 1;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            conversationId: currentConversationId,
            sessionId,
            userMessageCount: userMsgCount,
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
              } else if (data.type === "token") {
                appendToLastMessage(data.content);
              } else if (data.type === "replace_content") {
                replaceLastMessageContent(data.content);
              } else if (data.type === "metadata") {
                updateLastMessageMetadata({
                  suggestions: data.suggestions,
                  requirements: data.requirements,
                });
              } else if (data.type === "done") {
                // Stream complete
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
    ]
  );

  const handlePromptClick = (prompt: string) => {
    if (messages.length > 0 && !isStreaming) {
      // Mid-conversation suggestion click → send immediately
      sendMessage(prompt);
    } else {
      // Empty state prompt click → fill input for user to customize
      setPendingPrompt(prompt);
    }
  };

  const handleStop = () => {
    abortController?.abort();
    setIsStreaming(false);
  };

  const handleImageProcessed = (result: {
    imageUrl: string;
    ocrText: string;
    parsedInfo: Record<string, string | null>;
  }) => {
    // Build a message with OCR results to send to the chat
    const parts: string[] = ["I uploaded a pump nameplate photo."];

    if (result.parsedInfo.brand) parts.push(`Brand: ${result.parsedInfo.brand}`);
    if (result.parsedInfo.model) parts.push(`Model: ${result.parsedInfo.model}`);
    if (result.parsedInfo.power) parts.push(`Power: ${result.parsedInfo.power}`);
    if (result.parsedInfo.voltage) parts.push(`Voltage: ${result.parsedInfo.voltage}`);
    if (result.parsedInfo.flow) parts.push(`Flow: ${result.parsedInfo.flow}`);
    if (result.parsedInfo.head) parts.push(`Head: ${result.parsedInfo.head}`);

    if (parts.length === 1) {
      parts.push(`OCR extracted text: "${result.ocrText.slice(0, 300)}"`);
    }

    parts.push("Please identify this pump and recommend a Grundfos replacement with energy savings analysis.");

    sendMessage(parts.join("\n"));
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
            <h1 className="font-semibold text-grundfos-dark text-sm">
              GrundMatch
            </h1>
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
          initialValue={pendingPrompt}
          onImageProcessed={handleImageProcessed}
        />
      </main>
    </div>
  );
}
