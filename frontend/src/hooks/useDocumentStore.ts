import { create } from 'zustand';
import type { EditorLocateRequest, EditorLocateStatus } from '../types';

type ConnectionStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

interface DocumentState {
  documentId: string | null;
  documentName: string;
  suggestMode: boolean;
  analysisReadOnly: boolean;
  connectionStatus: ConnectionStatus;
  editorRefreshKey: number;
  pendingLocateRequest: EditorLocateRequest | null;
  locateStatus: EditorLocateStatus;
  locateMessage: string;
  setDocument: (id: string, name: string) => void;
  setSuggestMode: (mode: boolean) => void;
  setAnalysisReadOnly: (enabled: boolean) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  requestEditorRefresh: () => void;
  requestEditorLocate: (payload: Omit<EditorLocateRequest, 'requestId'>) => void;
  finishEditorLocate: (requestId: string, status: Exclude<EditorLocateStatus, 'idle'>, message: string) => void;
  clearLocateFeedback: () => void;
  clearDocument: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  documentId: null,
  documentName: '',
  suggestMode: true,
  analysisReadOnly: false,
  connectionStatus: 'idle',
  editorRefreshKey: 0,
  pendingLocateRequest: null,
  locateStatus: 'idle',
  locateMessage: '',
  setDocument: (id, name) =>
    set((state) => ({
      documentId: id,
      documentName: name,
      analysisReadOnly: false,
      connectionStatus: 'loading',
      editorRefreshKey: state.editorRefreshKey + 1,
      pendingLocateRequest: null,
      locateStatus: 'idle',
      locateMessage: '',
    })),
  setSuggestMode: (mode) => set({ suggestMode: mode }),
  setAnalysisReadOnly: (enabled) => set({ analysisReadOnly: enabled }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  requestEditorRefresh: () =>
    set((state) => ({
      editorRefreshKey: state.editorRefreshKey + 1,
    })),
  requestEditorLocate: (payload) =>
    set({
      pendingLocateRequest: {
        ...payload,
        requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      },
      locateStatus: 'locating',
      locateMessage: `正在定位：${payload.evidenceTitle}`,
    }),
  finishEditorLocate: (requestId, status, message) =>
    set((state) =>
      state.pendingLocateRequest?.requestId !== requestId
        ? state
        : {
            pendingLocateRequest: null,
            locateStatus: status,
            locateMessage: message,
          },
    ),
  clearLocateFeedback: () => set({ locateStatus: 'idle', locateMessage: '' }),
  clearDocument: () =>
    set({
      documentId: null,
      documentName: '',
      analysisReadOnly: false,
      connectionStatus: 'idle',
      pendingLocateRequest: null,
      locateStatus: 'idle',
      locateMessage: '',
    }),
}));
