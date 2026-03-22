import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import { useChatWebSocket } from '../../hooks/useWebSocket';
import { useAnalysisStore } from '../../hooks/useAnalysisStore';
import { TenderDashboard } from '../analysis/TenderDashboard';

const STARTER_PROMPTS = [
  '先概括当前文档。',
  '把标题改得更正式。',
];

export function ChatPanel() {
  const { documentId, documentName, analysisReadOnly } = useDocumentStore();
  const { sendMessage, sendPlanDecision, sendPlanFeedback } = useChatWebSocket(documentId);
  const activeTab = useAnalysisStore((state) => state.activeTab);
  const setActiveTab = useAnalysisStore((state) => state.setActiveTab);

  const starterPrompts = analysisReadOnly
    ? ['概括当前招标文件。', '梳理关键时间节点。']
    : STARTER_PROMPTS;

  return (
    <aside className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
      <div className="border-b border-zinc-200 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Agent Process
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-zinc-950">
              Word 文档执行过程
            </h2>
          </div>

          <div
            className="max-w-[220px] truncate rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600"
            title={documentId ? documentName : '等待文档'}
          >
            {documentId ? documentName : '等待文档'}
          </div>
        </div>

        <div className="mt-4 inline-flex rounded-full border border-zinc-200 bg-zinc-50 p-1">
          {[
            { key: 'agent', label: '文档 Agent' },
            { key: 'cockpit', label: '招标驾驶舱' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 ${
                activeTab === tab.key
                  ? 'bg-zinc-950 text-white'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
              onClick={() => setActiveTab(tab.key as 'agent' | 'cockpit')}
              title={tab.label}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'agent' ? (
        <>
          <MessageList
            starterPrompts={starterPrompts}
            onStarterPrompt={sendMessage}
            onPlanDecision={sendPlanDecision}
            onPlanFeedback={sendPlanFeedback}
          />

          {documentId ? (
            <ChatInput documentId={documentId} onSend={sendMessage} analysisReadOnly={analysisReadOnly} />
          ) : (
            <div className="border-t border-zinc-200 px-4 py-3 text-sm text-zinc-500">
              先打开文档。
            </div>
          )}
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TenderDashboard />
          </div>
        </div>
      )}
    </aside>
  );
}
