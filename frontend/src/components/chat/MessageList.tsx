import { useEffect, useRef } from 'react';
import { useChatStore } from '../../hooks/useChatStore';
import { MessageBubble } from './MessageBubble';
import { ToolCallIndicator } from './ToolCallIndicator';
import { ExtractionRunStream } from '../analysis/ExtractionRunStream';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import { useAnalysisStore } from '../../hooks/useAnalysisStore';

interface MessageListProps {
  starterPrompts: string[];
  onStarterPrompt: (prompt: string) => void;
  onPlanDecision: (decision: 'yes' | 'no') => void;
  onPlanFeedback: (content: string) => void;
}

export function MessageList({
  starterPrompts,
  onStarterPrompt,
  onPlanDecision,
  onPlanFeedback,
}: MessageListProps) {
  const messages = useChatStore((state) => state.messages);
  const isAIThinking = useChatStore((state) => state.isAIThinking);
  const documentId = useDocumentStore((state) => state.documentId);
  const activeRunId = useAnalysisStore((state) => state.activeRunId);
  const runsById = useAnalysisStore((state) => state.runsById);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeRun = activeRunId ? runsById[activeRunId] : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAIThinking, activeRun]);

  return (
    <div
      className="flex-1 overflow-y-auto px-4 py-4"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-label="聊天消息流"
    >
      <ExtractionRunStream documentId={documentId} />

      {messages.length === 0 && !isAIThinking && !activeRun && (
        <section className="rounded-[20px] border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
          <p className="font-medium text-zinc-900">这里会连续显示 Agent 的读取、定位、修改、刷新和追问过程。</p>
          <p className="mt-1 text-zinc-500">先从一个低噪声问题开始，或直接发送一条修改指令。</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="cursor-pointer rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-left text-xs leading-5 text-zinc-600 transition-colors duration-200 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => onStarterPrompt(prompt)}
                disabled={!documentId}
                title={prompt}
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-4 space-y-4">
        {messages.map((message) =>
          message.toolCall ? (
            <ToolCallIndicator key={message.id} message={message} />
          ) : (
            <MessageBubble
              key={message.id}
              message={message}
              onPlanDecision={onPlanDecision}
              onPlanFeedback={onPlanFeedback}
            />
          )
        )}
        {isAIThinking && (
          <div className="flex justify-start">
            <div className="flex max-w-[94%] items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
              <span className="h-2 w-2 rounded-full bg-zinc-950" aria-hidden="true" />
              <div>
                <p className="font-medium text-zinc-900">正在思考</p>
                <p className="text-xs text-zinc-500">Agent 正在分析文档上下文并准备下一步操作。</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}
