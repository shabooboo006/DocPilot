import { useEffect, useRef } from 'react';
import { useChatStore } from '../../hooks/useChatStore';
import { MessageBubble } from './MessageBubble';
import { ToolCallIndicator } from './ToolCallIndicator';

export function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {messages.length === 0 && (
        <div className="text-center text-gray-400 text-sm mt-8">
          开始和 AI 对话来编辑文档
        </div>
      )}
      {messages.map((msg) =>
        msg.toolCall ? (
          <ToolCallIndicator key={msg.id} message={msg} />
        ) : (
          <MessageBubble key={msg.id} message={msg} />
        )
      )}
      <div ref={bottomRef} />
    </div>
  );
}
