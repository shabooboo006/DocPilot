import { create } from 'zustand';
import type { AgentPhase, AgentPlan, AgentTask, Message, ToolCallInfo } from '../types';

interface ChatState {
  messages: Message[];
  isAIThinking: boolean;
  planModeEnabled: boolean;
  currentPhase: AgentPhase;
  currentPlan: AgentPlan | null;
  activePlanMessageId: string | null;
  agentTasks: AgentTask[];
  agentSummary: string;
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void;
  updateToolCallStatus: (
    toolName: string,
    status: string,
    result?: Record<string, unknown>,
    meta?: { taskId?: string; agentId?: string; phase?: string; summary?: string }
  ) => void;
  appendToLastAIMessage: (content: string) => void;
  setAIThinking: (thinking: boolean) => void;
  setPlanModeEnabled: (enabled: boolean) => void;
  setCurrentPhase: (phase: AgentPhase) => void;
  setCurrentPlan: (plan: AgentPlan | null) => void;
  upsertPlanMessage: (plan: AgentPlan) => void;
  upsertAgentTask: (task: AgentTask) => void;
  setAgentSummary: (summary: string) => void;
  resetRuntimeState: () => void;
  clearMessages: () => void;
}

let _id = 0;

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isAIThinking: false,
  planModeEnabled: false,
  currentPhase: 'idle',
  currentPlan: null,
  activePlanMessageId: null,
  agentTasks: [],
  agentSummary: '',

  addMessage: (msg) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { ...msg, id: String(++_id), timestamp: Date.now() },
      ],
    })),

  updateToolCallStatus: (toolName, status, result, meta) =>
    set((state) => {
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].toolCall?.tool === toolName && messages[i].toolCall?.status === 'executing') {
          messages[i] = {
            ...messages[i],
            toolCall: {
              ...messages[i].toolCall!,
              status: status as ToolCallInfo['status'],
              result,
              taskId: meta?.taskId ?? messages[i].toolCall?.taskId,
              agentId: meta?.agentId ?? messages[i].toolCall?.agentId,
              phase: meta?.phase ?? messages[i].toolCall?.phase,
              summary: meta?.summary ?? messages[i].toolCall?.summary,
            },
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
  setPlanModeEnabled: (enabled) => set({ planModeEnabled: enabled }),
  setCurrentPhase: (phase) => set({ currentPhase: phase }),
  setCurrentPlan: (plan) => set({ currentPlan: plan }),
  upsertPlanMessage: (plan) =>
    set((state) => {
      if (state.activePlanMessageId) {
        const messages = state.messages.map((message) =>
          message.id === state.activePlanMessageId
            ? { ...message, agentPlan: plan }
            : message,
        );
        return { messages, currentPlan: plan };
      }

      const id = String(++_id);
      return {
        messages: [
          ...state.messages,
          {
            id,
            timestamp: Date.now(),
            role: 'system',
            agentPlan: plan,
          },
        ],
        currentPlan: plan,
        activePlanMessageId: id,
      };
    }),
  upsertAgentTask: (task) =>
    set((state) => {
      const index = state.agentTasks.findIndex((item) => item.task_id === task.task_id);
      if (index === -1) {
        return { agentTasks: [...state.agentTasks, task] };
      }
      const agentTasks = [...state.agentTasks];
      agentTasks[index] = { ...agentTasks[index], ...task };
      return { agentTasks };
    }),
  setAgentSummary: (summary) => set({ agentSummary: summary }),
  resetRuntimeState: () =>
    set({
      currentPhase: 'idle',
      currentPlan: null,
      activePlanMessageId: null,
      agentTasks: [],
      agentSummary: '',
    }),
  clearMessages: () =>
    set({
      messages: [],
      isAIThinking: false,
      currentPhase: 'idle',
      currentPlan: null,
      activePlanMessageId: null,
      agentTasks: [],
      agentSummary: '',
    }),
}));
