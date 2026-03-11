import { create } from 'zustand';
import type { Message, ToolCallInfo } from '../types';

interface ChatState {
  messages: Message[];
  isAIThinking: boolean;
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void;
  updateToolCallStatus: (toolName: string, status: string, result?: Record<string, unknown>) => void;
  appendToLastAIMessage: (content: string) => void;
  setAIThinking: (thinking: boolean) => void;
  clearMessages: () => void;
}

let _id = 0;

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isAIThinking: false,

  addMessage: (msg) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { ...msg, id: String(++_id), timestamp: Date.now() },
      ],
    })),

  updateToolCallStatus: (toolName, status, result) =>
    set((state) => {
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].toolCall?.tool === toolName && messages[i].toolCall?.status === 'executing') {
          messages[i] = {
            ...messages[i],
            toolCall: { ...messages[i].toolCall!, status: status as ToolCallInfo['status'], result },
          };
          break;
        }
      }
      return { messages };
    }),

  appendToLastAIMessage: (content) =>
    set((state) => {
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'ai' && !messages[i].toolCall) {
          messages[i] = { ...messages[i], content: messages[i].content + content };
          return { messages };
        }
      }
      // No existing AI message found, create a new one
      messages.push({ id: String(++_id), timestamp: Date.now(), role: 'ai', content });
      return { messages };
    }),

  setAIThinking: (thinking) => set({ isAIThinking: thinking }),
  clearMessages: () => set({ messages: [], isAIThinking: false }),
}));
