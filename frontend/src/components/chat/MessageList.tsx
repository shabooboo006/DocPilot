import { useEffect, useRef } from 'react';
import { useChatStore } from '../../hooks/useChatStore';
import { MessageBubble } from './MessageBubble';
import { ToolCallIndicator } from './ToolCallIndicator';

interface MessageListProps {
  onPlanDecision: (decision: 'yes' | 'no') => void;
  onPlanFeedback: (content: string) => void;
}

export function MessageList({ onPlanDecision, onPlanFeedback }: MessageListProps) {
  const messages = useChatStore((state) => state.messages);
  const isAIThinking = useChatStore((state) => state.isAIThinking);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAIThinking]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.length === 0 && (
        <div className="rounded-[20px] border border-dashed border-black/10 bg-stone-50 p-4 text-sm leading-6 text-zinc-500">
          这里会连续显示 Agent 的读取、定位、修改、刷新和追问过程。
        </div>
      )}

      <div className="space-y-4">
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
            <p className="text-sm leading-6 text-zinc-400">正在思考</p>
          </div>
        )}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}
