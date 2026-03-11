import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import 'superdoc/style.css';

const COLLAB_URL = 'ws://localhost:3050';

export function useSuperdoc(documentId: string | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<unknown>(null);
  const setConnectionStatus = useDocumentStore((s) => s.setConnectionStatus);

  useEffect(() => {
    if (!documentId || !containerRef.current) return;

    setConnectionStatus('connecting');

    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(COLLAB_URL, documentId, ydoc);

    let initialized = false;

    const onSync = (synced: boolean) => {
      if (!synced || initialized || !containerRef.current) return;
      initialized = true;
      setConnectionStatus('connected');

      // Dynamically import superdoc to avoid SSR issues
      import('superdoc').then(({ SuperDoc }) => {
        if (!containerRef.current) return;
        superdocRef.current = new SuperDoc({
          selector: containerRef.current,
          documentMode: 'editing',
          user: {
            name: '用户',
            email: 'user@docpilot.local',
          },
          modules: {
            collaboration: { ydoc, provider },
          },
        });
      });
    };

    provider.on('sync', onSync);
    provider.on('connection-close', () => setConnectionStatus('disconnected'));

    return () => {
      provider.off('sync', onSync);
      const sd = superdocRef.current as { destroy?: () => void } | null;
      if (sd) {
        sd.destroy?.();
        superdocRef.current = null;
      }
      provider.destroy();
      ydoc.destroy();
      initialized = false;
    };
  }, [documentId, setConnectionStatus]);

  return { containerRef, superdocRef };
}
