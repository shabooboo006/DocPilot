import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import { useChatWebSocket } from '../../hooks/useWebSocket';

const STARTER_PROMPTS = [
  '先概括当前文档。',
  '把标题改得更正式。',
];

export function ChatPanel() {
  const { documentId, documentName } = useDocumentStore();
  const { sendMessage, sendPlanDecision, sendPlanFeedback } = useChatWebSocket(documentId);

  return (
    <aside className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-black/10 bg-white/82 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="border-b border-black/8 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-400">
              Agent Process
            </p>
            <h2 className="mt-1 font-['Newsreader',serif] text-2xl leading-none tracking-[-0.03em] text-zinc-950">
              Word 文档执行过程
            </h2>
          </div>

          <div className="max-w-[180px] truncate rounded-full bg-stone-100 px-3 py-1.5 text-xs text-zinc-500">
            {documentId ? documentName : '等待文档'}
          </div>
        </div>
      </div>

      <div className="border-b border-black/8 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="cursor-pointer rounded-full border border-black/10 bg-stone-50 px-3 py-1.5 text-left text-xs leading-5 text-zinc-600 transition hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => sendMessage(prompt)}
              disabled={!documentId}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <MessageList onPlanDecision={sendPlanDecision} onPlanFeedback={sendPlanFeedback} />

      {documentId ? (
        <ChatInput documentId={documentId} onSend={sendMessage} />
      ) : (
        <div className="border-t border-black/8 px-4 py-3 text-sm text-zinc-400">
          先打开文档。
        </div>
      )}
    </aside>
  );
}
