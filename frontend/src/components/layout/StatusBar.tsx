import { useDocumentStore } from '../../hooks/useDocumentStore';
import { useChatStore } from '../../hooks/useChatStore';

const STATUS_META = {
  idle: {
    label: '未打开文档',
    tone: 'bg-zinc-400',
  },
  loading: {
    label: '正在载入文档',
    tone: 'bg-zinc-500 animate-pulse',
  },
  ready: {
    label: '编辑器已就绪',
    tone: 'bg-zinc-900',
  },
  saving: {
    label: '正在保存 docx',
    tone: 'bg-zinc-700 animate-pulse',
  },
  error: {
    label: '文档状态异常',
    tone: 'bg-rose-500',
  },
} as const;

export function StatusBar() {
  const { connectionStatus, documentId, documentName, suggestMode, analysisReadOnly } = useDocumentStore();
  const isAIThinking = useChatStore((state) => state.isAIThinking);
  const current = STATUS_META[connectionStatus];

  return (
    <footer className="px-4 pb-4 pt-2">
      <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-zinc-200 bg-white/95 px-3 py-2 text-xs text-zinc-600 shadow-[0_8px_24px_rgba(24,24,27,0.04)]">
        <div className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1">
          <span className={`h-2 w-2 rounded-full ${current.tone}`} />
          <span>{isAIThinking ? `${current.label} · AI 处理中` : current.label}</span>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1">
          <span>{analysisReadOnly ? '查看模式' : suggestMode ? '建议模式' : '直接编辑'}</span>
        </div>

        {documentId && (
          <div
            className="ml-auto inline-flex max-w-full items-center gap-2 overflow-hidden rounded-full bg-zinc-950 px-3 py-1 text-zinc-300"
            title={documentName}
          >
            <span className="truncate text-white">{documentName}</span>
          </div>
        )}
      </div>
    </footer>
  );
}
