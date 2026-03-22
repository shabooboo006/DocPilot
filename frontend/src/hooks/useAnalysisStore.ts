import { create } from 'zustand';
import type {
  AnalysisPanelTab,
  AnalysisRun,
  AnalysisStep,
  AnalysisStepEvent,
  TenderAnalysisSnapshot,
  TimelineViewMode,
} from '../types';

interface AnalysisStoreState {
  activeTab: AnalysisPanelTab;
  analysisStatus: string;
  activeRunId: string | null;
  runsById: Record<string, AnalysisRun>;
  threadIdByDocument: Record<string, string>;
  snapshot: TenderAnalysisSnapshot | null;
  timelineFilters: {
    lot: string | null;
    eventType: string | null;
    urgency: string | null;
    onlyConfirmed: boolean;
  };
  timelineViewMode: TimelineViewMode;
  autoScrollEnabled: boolean;
  setActiveTab: (tab: AnalysisPanelTab) => void;
  upsertRun: (run: AnalysisRun) => void;
  upsertStep: (runId: string, step: Omit<AnalysisStep, 'runId'>) => void;
  appendStepEvent: (runId: string, stepId: string, event: AnalysisStepEvent) => void;
  setSnapshot: (snapshot: TenderAnalysisSnapshot | null) => void;
  setThreadIdForDocument: (documentId: string, threadId: string) => void;
  setTimelineViewMode: (mode: TimelineViewMode) => void;
  setTimelineFilters: (filters: Partial<AnalysisStoreState['timelineFilters']>) => void;
  setAutoScrollEnabled: (enabled: boolean) => void;
  resetForDocument: () => void;
}

export const useAnalysisStore = create<AnalysisStoreState>((set) => ({
  activeTab: 'agent',
  analysisStatus: 'idle',
  activeRunId: null,
  runsById: {},
  threadIdByDocument: {},
  snapshot: null,
  timelineFilters: {
    lot: null,
    eventType: null,
    urgency: null,
    onlyConfirmed: false,
  },
  timelineViewMode: 'timeline',
  autoScrollEnabled: true,
  setActiveTab: (tab) => set({ activeTab: tab }),
  upsertRun: (run) =>
    set((state) => ({
      analysisStatus: run.status,
      activeRunId: run.id,
      runsById: {
        ...state.runsById,
        [run.id]: {
          ...(state.runsById[run.id] || {}),
          ...run,
          steps: run.steps || state.runsById[run.id]?.steps || [],
        },
      },
    })),
  upsertStep: (runId, step) =>
    set((state) => {
      const existingRun = state.runsById[runId];
      if (!existingRun) return state;
      const nextSteps = [...existingRun.steps];
      const index = nextSteps.findIndex((item) => item.id === step.id);
      const normalized: AnalysisStep = {
        ...nextSteps[index],
        ...step,
        runId,
        events: step.events || nextSteps[index]?.events || [],
      };
      if (index === -1) {
        nextSteps.push(normalized);
      } else {
        nextSteps[index] = normalized;
      }
      return {
        runsById: {
          ...state.runsById,
          [runId]: {
            ...existingRun,
            steps: nextSteps,
          },
        },
      };
    }),
  appendStepEvent: (runId, stepId, event) =>
    set((state) => {
      const existingRun = state.runsById[runId];
      if (!existingRun) return state;
      return {
        runsById: {
          ...state.runsById,
          [runId]: {
            ...existingRun,
            steps: existingRun.steps.map((step) =>
              step.id === stepId
                ? { ...step, events: [...step.events, event], updatedAt: event.timestamp }
                : step,
            ),
          },
        },
      };
    }),
  setSnapshot: (snapshot) => set({ snapshot, analysisStatus: snapshot ? 'ready' : 'idle' }),
  setThreadIdForDocument: (documentId, threadId) =>
    set((state) => ({
      threadIdByDocument: {
        ...state.threadIdByDocument,
        [documentId]: threadId,
      },
    })),
  setTimelineViewMode: (mode) => set({ timelineViewMode: mode }),
  setTimelineFilters: (filters) =>
    set((state) => ({
      timelineFilters: { ...state.timelineFilters, ...filters },
    })),
  setAutoScrollEnabled: (enabled) => set({ autoScrollEnabled: enabled }),
  resetForDocument: () =>
    set({
      analysisStatus: 'idle',
      activeRunId: null,
      runsById: {},
      snapshot: null,
      activeTab: 'agent',
    }),
}));
