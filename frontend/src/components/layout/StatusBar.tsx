import { useDocumentStore } from '../../hooks/useDocumentStore';
import { useChatStore } from '../../hooks/useChatStore';

const STATUS_META = {
  idle: {
    label: '未打开文档',
    tone: 'bg-zinc-400',
  },
  loading: {
    label: '正在载入文档',
    tone: 'bg-amber-400 animate-pulse',
  },
  ready: {
    label: '编辑器已就绪',
    tone: 'bg-emerald-500',
  },
  saving: {
    label: '正在保存 docx',
    tone: 'bg-sky-500 animate-pulse',
  },
  error: {
    label: '文档状态异常',
    tone: 'bg-rose-500',
  },
} as const;

export function StatusBar() {
  const { connectionStatus, documentId, documentName, suggestMode } = useDocumentStore();
  const isAIThinking = useChatStore((state) => state.isAIThinking);
  const current = STATUS_META[connectionStatus];

  return (
    <footer className="px-4 pb-4">
      <div className="flex flex-wrap items-center gap-2 rounded-[20px] border border-black/8 bg-white/76 px-3 py-2 text-xs text-zinc-600 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur-xl">
        <div className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1">
          <span className={`h-2 w-2 rounded-full ${current.tone}`} />
          <span>{current.label}</span>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1">
          <span className="font-medium text-zinc-800">AI</span>
          <span>{isAIThinking ? '处理中' : '空闲'}</span>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1">
          <span>{suggestMode ? '建议模式' : '直接编辑'}</span>
        </div>

        {documentId && (
          <div className="ml-auto inline-flex max-w-full items-center gap-2 overflow-hidden rounded-full bg-zinc-950 px-3 py-1 text-zinc-300">
            <span className="truncate text-white">{documentName}</span>
          </div>
        )}
      </div>
    </footer>
  );
}
