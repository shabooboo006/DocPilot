import { useSuperdoc } from './useSuperdoc';
import { useDocumentStore } from '../../hooks/useDocumentStore';

const QUICK_RULES = ['上传即打开', '自动保存', 'AI 写回后自动刷新'];

export function EditorPanel() {
  const { documentId, documentName, suggestMode, connectionStatus } = useDocumentStore();
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
        <div className="doc-empty-state flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-hidden rounded-[28px] border border-black/8 bg-white/78 p-8 text-center shadow-[0_24px_60px_rgba(24,24,27,0.08)] backdrop-blur-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-zinc-950 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white">
            Editor
          </div>
          <div className="space-y-3">
            <h1 className="font-['Newsreader',serif] text-4xl leading-none tracking-[-0.04em] text-zinc-950">
              打开一个 docx
            </h1>
            <p className="max-w-xl text-sm leading-6 text-zinc-600">
              文档会直接进入左侧编辑区，聊天面板只保留必要操作。
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {QUICK_RULES.map((item) => (
              <span
                key={item}
                className="rounded-full border border-black/8 bg-stone-50 px-3 py-1.5 text-sm text-zinc-700"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const statusLabel = {
    loading: '正在装载文档',
    ready: '文档已就绪',
    saving: '正在保存',
    error: '加载失败',
    idle: '等待文档',
  }[connectionStatus];

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-black/8 bg-white/82 px-4 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.07)] backdrop-blur-xl">
        <div className="min-w-0">
          <h2 className="truncate font-['Newsreader',serif] text-2xl leading-none tracking-[-0.03em] text-zinc-950">
            {documentName}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">{statusLabel}</p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
          <span
            className={`rounded-full px-3 py-1.5 ${
              suggestMode ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-zinc-700'
            }`}
          >
            {suggestMode ? '建议模式' : '直接编辑'}
          </span>
          <span className="rounded-full bg-stone-100 px-3 py-1.5">docx</span>
          <span className="rounded-full bg-stone-100 px-3 py-1.5">自动保存</span>
          {suggestMode && (
            <>
              <button
                type="button"
                className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-800 transition hover:bg-emerald-200"
                onClick={acceptAllTrackedChanges}
              >
                采纳全部修订
              </button>
              <button
                type="button"
                className="rounded-full bg-rose-100 px-3 py-1.5 text-rose-700 transition hover:bg-rose-200"
                onClick={rejectAllTrackedChanges}
              >
                不采纳全部修订
              </button>
            </>
          )}
        </div>
      </div>

      <div className="superdoc-stage flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-black/8 bg-white/74 p-3 shadow-[0_24px_70px_rgba(24,24,27,0.08)] backdrop-blur-xl">
        <div className="superdoc-toolbar-shell shrink-0 rounded-[20px] border border-black/6 bg-white/92 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
          <div
            id={toolbarSelector ? toolbarSelector.slice(1) : undefined}
            ref={toolbarRef}
            className="min-h-[54px]"
          />
        </div>

        <div className="superdoc-host mt-3 min-h-0 flex-1 overflow-auto rounded-[22px] border border-black/6 bg-[#f7f3ec]">
          <div ref={containerRef} className="h-full min-h-0" />
        </div>
      </div>
    </section>
  );
}
