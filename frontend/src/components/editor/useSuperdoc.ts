import { useEffect, useRef } from 'react';
import { fetchDocumentBlob, saveDocumentBlob } from '../../services/api';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import 'superdoc/style.css';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SAVE_DEBOUNCE_MS = 1200;
const MIN_AUTO_ZOOM = 70;
const MAX_AUTO_ZOOM = 100;
const AUTO_ZOOM_PADDING = 48;

type DocumentMode = 'editing' | 'suggesting' | 'viewing';

type SearchMatch = {
  id?: string;
  from?: number;
  to?: number;
  text?: string;
  ranges?: Array<{ from: number; to: number }>;
};

type ScrollOptions = {
  block?: 'start' | 'center' | 'end' | 'nearest';
  behavior?: ScrollBehavior;
};

type SuperDocPresentationEditor = {
  scrollToPosition?: (pos: number, options?: ScrollOptions) => boolean;
  scrollToPositionAsync?: (pos: number, options?: ScrollOptions) => Promise<boolean> | boolean;
  getElementAtPos?: (
    pos: number,
    options?: { forceRebuild?: boolean; fallbackToCoords?: boolean },
  ) => HTMLElement | null;
};

type SuperDocInstance = {
  destroy?: () => void;
  setDocumentMode?: (mode: DocumentMode) => void;
  setZoom?: (percent: number) => void;
  search?: (text: string) => SearchMatch[] | undefined;
  goToSearchResult?: (match: SearchMatch) => boolean | undefined;
  export?: (options?: { exportType?: string; triggerDownload?: boolean }) => Promise<Blob | void>;
  activeEditor?: {
    state?: {
      doc: {
        resolve: (pos: number) => {
          depth: number;
          start: (depth: number) => number;
          end: (depth: number) => number;
          node: (depth: number) => { isTextblock?: boolean } | null;
        };
      };
      selection?: {
        from: number;
        to: number;
      };
      tr: {
        setSelection: (selection: unknown) => unknown;
      };
    };
    view?: {
      dispatch?: (tr: unknown) => void;
    };
    commands?: {
      acceptAllTrackedChanges?: () => boolean;
      rejectAllTrackedChanges?: () => boolean;
      setHighlight?: (color: string) => boolean;
      unsetHighlight?: () => boolean;
      search?: (
        text: string,
        options?: { highlight?: boolean; maxMatches?: number; caseSensitive?: boolean },
      ) => SearchMatch[] | undefined;
    };
    presentationEditor?: SuperDocPresentationEditor | null;
  } | null;
};

export function useSuperdoc(documentId: string | null, documentName: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<SuperDocInstance | null>(null);
  const currentZoomRef = useRef(MAX_AUTO_ZOOM);
  const setConnectionStatus = useDocumentStore((s) => s.setConnectionStatus);
  const connectionStatus = useDocumentStore((s) => s.connectionStatus);
  const suggestMode = useDocumentStore((s) => s.suggestMode);
  const analysisReadOnly = useDocumentStore((s) => s.analysisReadOnly);
  const editorRefreshKey = useDocumentStore((s) => s.editorRefreshKey);
  const pendingLocateRequest = useDocumentStore((s) => s.pendingLocateRequest);
  const finishEditorLocate = useDocumentStore((s) => s.finishEditorLocate);
  const clearLocateFeedback = useDocumentStore((s) => s.clearLocateFeedback);
  const suggestModeRef = useRef(suggestMode);
  const activeHighlightRangeRef = useRef<{ from: number; to: number } | null>(null);
  const toolbarSelector = documentId ? `#superdoc-toolbar-${documentId}` : null;

  useEffect(() => {
    suggestModeRef.current = suggestMode;
    const superdoc = superdocRef.current;
    if (!superdoc?.setDocumentMode) return;

    superdoc.setDocumentMode(analysisReadOnly ? 'viewing' : suggestMode ? 'suggesting' : 'editing');
  }, [analysisReadOnly, suggestMode]);

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

        const editorConfig = {
          selector: containerRef.current,
          toolbar: toolbarSelector ?? undefined,
          title: 'DocPilot',
          documentMode: analysisReadOnly ? 'viewing' : suggestModeRef.current ? 'suggesting' : 'editing',
          allowSelectionInViewMode: analysisReadOnly,
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
            if (!cancelled && !analysisReadOnly) {
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
        };

        const editor = new SuperDoc(editorConfig as never);

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
    analysisReadOnly,
    editorRefreshKey,
    setConnectionStatus,
    toolbarSelector,
  ]);

  useEffect(() => {
    if (!pendingLocateRequest || connectionStatus !== 'ready') {
      return;
    }

    let cancelled = false;
    const editor = superdocRef.current;
    if (!editor?.search || !editor?.goToSearchResult) {
      return;
    }

    const locateCandidates = [
      pendingLocateRequest.queryText,
      pendingLocateRequest.fallbackText,
      pendingLocateRequest.sectionPath,
    ]
      .map((item) => item?.trim())
      .filter((item, index, items): item is string => Boolean(item) && items.indexOf(item) === index);

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
      });

    const resolveMatchPosition = (match: SearchMatch) => {
      if (typeof match.from === 'number') return match.from;
      return match.ranges?.[0]?.from;
    };

    const resolveParagraphRange = (pos: number) => {
      const state = editor.activeEditor?.state;
      if (!state) return null;
      const resolved = state.doc.resolve(pos);
      for (let depth = resolved.depth; depth >= 1; depth -= 1) {
        const node = resolved.node(depth);
        if (node?.isTextblock) {
          return {
            from: resolved.start(depth),
            to: resolved.end(depth),
          };
        }
      }
      return null;
    };

    const runWithWritableEditor = async <T>(callback: () => T | Promise<T>) => {
      const previousMode: DocumentMode = analysisReadOnly ? 'viewing' : suggestModeRef.current ? 'suggesting' : 'editing';
      if (analysisReadOnly) {
        editor.setDocumentMode?.('editing');
        await wait(0);
      }
      try {
        return await callback();
      } finally {
        if (analysisReadOnly) {
          editor.setDocumentMode?.(previousMode);
        }
      }
    };

    const applyParagraphHighlight = async (range: { from: number; to: number }) => {
      await runWithWritableEditor(async () => {
        const getRuntime = () => {
          const activeEditor = editor.activeEditor;
          const state = activeEditor?.state;
          const dispatch = activeEditor?.view?.dispatch;
          const commands = activeEditor?.commands;
          if (!state?.tr || !dispatch || !commands?.setHighlight || !commands?.unsetHighlight) {
            return null;
          }
          return { activeEditor, state, dispatch, commands };
        };

        if (!getRuntime()) {
          return;
        }

        const applySelection = (nextRange: { from: number; to: number }) => {
          const runtime = getRuntime();
          if (!runtime) {
            return false;
          }
          const { state, dispatch } = runtime;
          const selectionFactory = state.selection?.constructor as
            | { create?: (doc: unknown, from: number, to: number) => unknown }
            | undefined;
          const nextSelection = selectionFactory?.create?.(state.doc, nextRange.from, nextRange.to);
          if (!nextSelection) {
            return false;
          }
          const tr = state.tr.setSelection(nextSelection);
          dispatch(tr);
          return true;
        };

        const previousRange = activeHighlightRangeRef.current;
        if (previousRange) {
          if (applySelection(previousRange)) {
            getRuntime()?.commands?.unsetHighlight?.();
          }
        }

        if (applySelection(range)) {
          getRuntime()?.commands?.setHighlight?.('#DCFCE7');
          activeHighlightRangeRef.current = range;
        }
      });
    };

    const tryLocateCandidate = async (candidate: string) => {
      const matches =
        editor.activeEditor?.commands?.search?.(candidate, { highlight: true, maxMatches: 1 }) ||
        editor.search?.(candidate) ||
        [];
      if (!Array.isArray(matches) || matches.length === 0) {
        return false;
      }

      const match = matches[0];
      const targetPos = resolveMatchPosition(match);
      const presentationEditor = editor.activeEditor?.presentationEditor;

      const restorePreciseSearchHighlight = async () => {
        const refreshedMatches =
          editor.activeEditor?.commands?.search?.(candidate, { highlight: true, maxMatches: 1 }) ||
          editor.search?.(candidate) ||
          [];
        if (!Array.isArray(refreshedMatches) || refreshedMatches.length === 0) {
          return;
        }

        await Promise.resolve(editor.goToSearchResult?.(refreshedMatches[0])).catch(() => false);
      };

      if (typeof targetPos === 'number' && presentationEditor) {
        try {
          const scrolled =
            presentationEditor.scrollToPosition?.(targetPos, { block: 'center' }) ||
            (await Promise.resolve(
              presentationEditor.scrollToPositionAsync?.(targetPos, { block: 'center' }),
            ));
          if (scrolled) {
            await wait(120);
          }
        } catch {
          // goToSearchResult below will still attempt the built-in navigation fallback
        }
      }

      const jumped = await Promise.resolve(editor.goToSearchResult?.(match)).catch(() => false);
      if (jumped) {
        const paragraphRange = typeof targetPos === 'number' ? resolveParagraphRange(targetPos) : null;
        if (paragraphRange) {
          await applyParagraphHighlight(paragraphRange);
          await restorePreciseSearchHighlight();
        }
        await wait(80);
        return true;
      }

      if (typeof targetPos === 'number' && presentationEditor?.getElementAtPos) {
        const element = presentationEditor.getElementAtPos(targetPos, {
          forceRebuild: true,
          fallbackToCoords: true,
        });
        element?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
        await wait(80);
        const retriedJump = Boolean(await Promise.resolve(editor.goToSearchResult?.(match)).catch(() => false));
        if (retriedJump) {
          const paragraphRange = typeof targetPos === 'number' ? resolveParagraphRange(targetPos) : null;
          if (paragraphRange) {
            await applyParagraphHighlight(paragraphRange);
            await restorePreciseSearchHighlight();
          }
        }
        return retriedJump;
      }

      return false;
    };

    const runLocate = async () => {
      let matched = false;
      for (const candidate of locateCandidates) {
        if (cancelled) return;
        if (await tryLocateCandidate(candidate)) {
          matched = true;
          finishEditorLocate(
            pendingLocateRequest.requestId,
            'found',
            `已定位到原文：${pendingLocateRequest.evidenceTitle}`,
          );
          break;
        }
      }

      if (!matched && !cancelled) {
        finishEditorLocate(
          pendingLocateRequest.requestId,
          'not_found',
          `未找到精确原文定位：${pendingLocateRequest.evidenceTitle}`,
        );
      }
    };

    void runLocate();

    const timer = window.setTimeout(() => {
      clearLocateFeedback();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [analysisReadOnly, clearLocateFeedback, connectionStatus, finishEditorLocate, pendingLocateRequest]);

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
