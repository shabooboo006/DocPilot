import { useEffect, useRef } from 'react';
import { fetchDocumentBlob, saveDocumentBlob } from '../../services/api';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import 'superdoc/style.css';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SAVE_DEBOUNCE_MS = 1200;
const MIN_AUTO_ZOOM = 70;
const MAX_AUTO_ZOOM = 100;
const AUTO_ZOOM_PADDING = 48;

type DocumentMode = 'editing' | 'suggesting';

type SuperDocInstance = {
  destroy?: () => void;
  setDocumentMode?: (mode: DocumentMode) => void;
  setZoom?: (percent: number) => void;
  export?: (options?: { exportType?: string; triggerDownload?: boolean }) => Promise<Blob | void>;
  activeEditor?: {
    commands?: {
      acceptAllTrackedChanges?: () => boolean;
      rejectAllTrackedChanges?: () => boolean;
    };
  } | null;
};

export function useSuperdoc(documentId: string | null, documentName: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<SuperDocInstance | null>(null);
  const currentZoomRef = useRef(MAX_AUTO_ZOOM);
  const setConnectionStatus = useDocumentStore((s) => s.setConnectionStatus);
  const suggestMode = useDocumentStore((s) => s.suggestMode);
  const editorRefreshKey = useDocumentStore((s) => s.editorRefreshKey);
  const suggestModeRef = useRef(suggestMode);
  const toolbarSelector = documentId ? `#superdoc-toolbar-${documentId}` : null;

  useEffect(() => {
    suggestModeRef.current = suggestMode;
    const superdoc = superdocRef.current;
    if (!superdoc?.setDocumentMode) return;

    superdoc.setDocumentMode(suggestMode ? 'suggesting' : 'editing');
  }, [suggestMode]);

  useEffect(() => {
    if (!documentId || !containerRef.current || !toolbarRef.current) {
      return;
    }

    let cancelled = false;
    let saveTimer: number | undefined;
    let resizeFrame: number | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let saving = false;
    let needsAnotherSave = false;

    const syncZoomToViewport = () => {
      const editor = superdocRef.current;
      const host = containerRef.current;
      if (!editor?.setZoom || !host) return;

      const page = host.querySelector<HTMLElement>('.super-editor-container:not(.web-layout)');
      if (!page) return;

      const renderedWidth = page.getBoundingClientRect().width;
      const effectiveZoom = currentZoomRef.current / 100;
      if (!renderedWidth || !effectiveZoom) return;

      const baseWidth = renderedWidth / effectiveZoom;
      const availableWidth = Math.max(host.clientWidth - AUTO_ZOOM_PADDING, 0);
      if (!baseWidth || !availableWidth) return;

      const nextZoom = Math.max(
        MIN_AUTO_ZOOM,
        Math.min(MAX_AUTO_ZOOM, Math.floor((availableWidth / baseWidth) * 100)),
      );

      if (Math.abs(nextZoom - currentZoomRef.current) < 1) return;

      currentZoomRef.current = nextZoom;
      editor.setZoom(nextZoom);
    };

    const scheduleZoomSync = () => {
      if (resizeFrame !== undefined) {
        window.cancelAnimationFrame(resizeFrame);
      }
      resizeFrame = window.requestAnimationFrame(() => {
        syncZoomToViewport();
      });
    };

    const flushSave = async () => {
      const editor = superdocRef.current;
      if (!editor?.export || saving || cancelled) {
        if (saving) {
          needsAnotherSave = true;
        }
        return;
      }

      saving = true;
      setConnectionStatus('saving');

      try {
        const exported = await editor.export({
          exportType: 'docx',
          triggerDownload: false,
        });

        if (cancelled) {
          return;
        }

        if (exported instanceof Blob) {
          await saveDocumentBlob(documentId, exported);
        }

        if (!cancelled) {
          setConnectionStatus('ready');
        }
      } catch (error) {
        console.error('Failed to save document', error);
        if (!cancelled) {
          setConnectionStatus('error');
        }
      } finally {
        saving = false;
        if (needsAnotherSave && !cancelled) {
          needsAnotherSave = false;
          void flushSave();
        }
      }
    };

    const scheduleSave = () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        void flushSave();
      }, SAVE_DEBOUNCE_MS);
    };

    const mountEditor = async () => {
      setConnectionStatus('loading');

      try {
        const blob = await fetchDocumentBlob(documentId);
        const file = new File(
          [blob],
          `${documentName || documentId}.docx`,
          { type: DOCX_MIME },
        );

        const { SuperDoc } = await import('superdoc');
        if (cancelled || !containerRef.current || !toolbarRef.current) return;

        containerRef.current.innerHTML = '';
        toolbarRef.current.innerHTML = '';

        const editor = new SuperDoc({
          selector: containerRef.current,
          toolbar: toolbarSelector ?? undefined,
          title: 'DocPilot',
          documentMode: suggestModeRef.current ? 'suggesting' : 'editing',
          documents: [
            {
              id: documentId,
              type: 'docx',
              name: file.name,
              data: file,
            },
          ],
          user: {
            name: '当前用户',
            email: 'user@docpilot.local',
          },
          comments: { visible: false },
          trackChanges: { visible: true },
          modules: {
            toolbar: {
              hideButtons: false,
              responsiveToContainer: true,
            },
            comments: false,
          },
          onReady: () => {
            if (!cancelled) {
              setConnectionStatus('ready');
              scheduleZoomSync();
            }
          },
          onPaginationUpdate: () => {
            if (!cancelled) {
              scheduleZoomSync();
            }
          },
          onEditorUpdate: () => {
            if (!cancelled) {
              scheduleSave();
            }
          },
          onContentError: (payload: { error: object }) => {
            console.error('SuperDoc content error', payload.error);
            if (!cancelled) {
              setConnectionStatus('error');
            }
          },
          onException: (payload: unknown) => {
            console.error('SuperDoc exception', payload);
            if (!cancelled) {
              setConnectionStatus('error');
            }
          },
        });

        superdocRef.current = editor as SuperDocInstance;
        currentZoomRef.current = MAX_AUTO_ZOOM;
        resizeObserver = new ResizeObserver(() => {
          if (!cancelled) {
            scheduleZoomSync();
          }
        });
        resizeObserver.observe(containerRef.current);
      } catch (error) {
        console.error('Failed to initialize SuperDoc', error);
        if (!cancelled) {
          setConnectionStatus('error');
        }
      }
    };

    void mountEditor();

    return () => {
      cancelled = true;
      window.clearTimeout(saveTimer);
      if (resizeFrame !== undefined) {
        window.cancelAnimationFrame(resizeFrame);
      }
      resizeObserver?.disconnect();
      superdocRef.current?.destroy?.();
      superdocRef.current = null;
    };
  }, [
    documentId,
    documentName,
    editorRefreshKey,
    setConnectionStatus,
  ]);

  const acceptAllTrackedChanges = () => {
    return Boolean(superdocRef.current?.activeEditor?.commands?.acceptAllTrackedChanges?.());
  };

  const rejectAllTrackedChanges = () => {
    return Boolean(superdocRef.current?.activeEditor?.commands?.rejectAllTrackedChanges?.());
  };

  return {
    containerRef,
    toolbarRef,
    toolbarSelector,
    acceptAllTrackedChanges,
    rejectAllTrackedChanges,
  };
}
