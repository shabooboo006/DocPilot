import { create } from 'zustand';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

interface DocumentState {
  documentId: string | null;
  documentName: string;
  suggestMode: boolean;
  connectionStatus: ConnectionStatus;
  setDocument: (id: string, name: string) => void;
  setSuggestMode: (mode: boolean) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  clearDocument: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  documentId: null,
  documentName: '',
  suggestMode: true,
  connectionStatus: 'idle',
  setDocument: (id, name) => set({ documentId: id, documentName: name, connectionStatus: 'idle' }),
  setSuggestMode: (mode) => set({ suggestMode: mode }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  clearDocument: () => set({ documentId: null, documentName: '', connectionStatus: 'idle' }),
}));
