import { create } from "zustand";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
  pump_recommended?: string;
}

interface ChatState {
  messages: Message[];
  conversations: Conversation[];
  currentConversationId: string | null;
  isStreaming: boolean;
  sessionId: string;
  sidebarOpen: boolean;

  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  appendToLastMessage: (content: string) => void;
  replaceLastMessageContent: (content: string) => void;
  updateLastMessageMetadata: (metadata: Record<string, unknown>) => void;
  setConversations: (conversations: Conversation[]) => void;
  setCurrentConversationId: (id: string | null) => void;
  setIsStreaming: (streaming: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  newChat: () => void;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sessionId = localStorage.getItem("grundmatch_session_id");
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem("grundmatch_session_id", sessionId);
  }
  return sessionId;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  conversations: [],
  currentConversationId: null,
  isStreaming: false,
  sessionId: typeof window !== "undefined" ? getSessionId() : "",
  sidebarOpen: false,

  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  appendToLastMessage: (content) =>
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: last.content + content };
      }
      return { messages: msgs };
    }),
  replaceLastMessageContent: (content) =>
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content };
      }
      return { messages: msgs };
    }),
  updateLastMessageMetadata: (metadata) =>
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, metadata: { ...last.metadata, ...metadata } };
      }
      return { messages: msgs };
    }),
  setConversations: (conversations) => set({ conversations }),
  setCurrentConversationId: (id) => set({ currentConversationId: id }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  newChat: () =>
    set({ messages: [], currentConversationId: null }),
}));
