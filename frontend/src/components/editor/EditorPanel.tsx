import { useSuperdoc } from './useSuperdoc';
import { useDocumentStore } from '../../hooks/useDocumentStore';

const QUICK_RULES = ['上传即打开', '自动保存', 'AI 写回后自动刷新'];

export function EditorPanel() {
  const {
    documentId,
    documentName,
    suggestMode,
    analysisReadOnly,
    connectionStatus,
    locateStatus,
    locateMessage,
  } = useDocumentStore();
  const {
    containerRef,
    toolbarRef,
    toolbarSelector,
    acceptAllTrackedChanges,
    rejectAllTrackedChanges,
  } = useSuperdoc(documentId, documentName);

  if (!documentId) {
    return (
      <section className="flex min-h-0 flex-1 overflow-hidden">
        <div className="doc-empty-state flex min-h-0 flex-1 flex-col justify-center rounded-[24px] border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="mx-auto flex w-full max-w-xl flex-col gap-4 text-left">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                Editor
              </p>
              <h1 className="mt-2 text-2xl font-medium tracking-tight text-zinc-950">
                打开一个 docx
              </h1>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                文档会直接进入左侧编辑区，聊天面板保留必要操作。
              </p>
            </div>
            <div className="space-y-2 text-sm text-zinc-500">
              {QUICK_RULES.map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const activityLabel = {
    loading: '正在装载文档',
    ready: '文档已就绪',
    saving: '正在保存',
    error: '加载失败',
    idle: '等待文档',
  }[connectionStatus];

  const modeLabel = analysisReadOnly ? '只读查看' : suggestMode ? '建议模式' : '直接编辑';
  const summaryText = [
    modeLabel,
    activityLabel,
    locateStatus !== 'idle' && locateMessage ? locateMessage : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <h2
            className="truncate text-xl font-medium tracking-tight text-zinc-950"
            title={documentName}
          >
            {documentName}
          </h2>
          <p className="mt-1 truncate text-sm text-zinc-500" title={summaryText}>
            {summaryText}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
          {!analysisReadOnly && suggestMode && (
            <>
              <button
                type="button"
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
                onClick={acceptAllTrackedChanges}
              >
                采纳全部修订
              </button>
              <button
                type="button"
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
                onClick={rejectAllTrackedChanges}
              >
                拒绝全部修订
              </button>
            </>
          )}
        </div>
      </div>

      <div className="superdoc-stage flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-zinc-200 bg-white p-3 shadow-sm">
        {analysisReadOnly ? (
          <>
            <div className="rounded-[18px] border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              当前为招标分析只读查看模式。点击右侧证据可联动定位到左侧原文并高亮展示。
            </div>
            <div
              id={toolbarSelector ? toolbarSelector.slice(1) : undefined}
              ref={toolbarRef}
              className="hidden"
            />
          </>
        ) : (
          <div className="superdoc-toolbar-shell shrink-0 rounded-[18px] border border-zinc-200 bg-white shadow-sm">
            <div
              id={toolbarSelector ? toolbarSelector.slice(1) : undefined}
              ref={toolbarRef}
              className="min-h-[54px]"
            />
          </div>
        )}

        <div className="superdoc-host mt-3 min-h-0 flex-1 overflow-auto rounded-[20px] border border-zinc-200 bg-zinc-50">
          <div ref={containerRef} className="h-full min-h-0" />
        </div>
      </div>
    </section>
  );
}
