import { create } from 'zustand';

type ConnectionStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

interface DocumentState {
  documentId: string | null;
  documentName: string;
  suggestMode: boolean;
  connectionStatus: ConnectionStatus;
  editorRefreshKey: number;
  setDocument: (id: string, name: string) => void;
  setSuggestMode: (mode: boolean) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  requestEditorRefresh: () => void;
  clearDocument: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  documentId: null,
  documentName: '',
  suggestMode: true,
  connectionStatus: 'idle',
  editorRefreshKey: 0,
  setDocument: (id, name) =>
    set((state) => ({
      documentId: id,
      documentName: name,
      connectionStatus: 'loading',
      editorRefreshKey: state.editorRefreshKey + 1,
    })),
  setSuggestMode: (mode) => set({ suggestMode: mode }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  requestEditorRefresh: () =>
    set((state) => ({
      editorRefreshKey: state.editorRefreshKey + 1,
    })),
  clearDocument: () =>
    set({
      documentId: null,
      documentName: '',
      connectionStatus: 'idle',
    }),
}));
