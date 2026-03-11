import { useState, useRef } from 'react';
import { useChatStore } from '../../hooks/useChatStore';

interface ChatInputProps {
  onSend: (message: string) => void;
}

export function ChatInput({ onSend }: ChatInputProps) {
  const [value, setValue] = useState('');
  const isAIThinking = useChatStore((s) => s.isAIThinking);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || isAIThinking) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200 p-3">
      <div className="flex gap-2">
        <textarea
          ref={inputRef}
          className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
          placeholder={isAIThinking ? 'AI 处理中...' : '输入消息...'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isAIThinking}
        />
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed self-end"
          onClick={handleSend}
          disabled={!value.trim() || isAIThinking}
        >
          发送
        </button>
      </div>
    </div>
  );
}
