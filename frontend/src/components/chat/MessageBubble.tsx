import type { Message } from '../../types';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div className="bg-blue-600 text-white rounded-lg px-4 py-2 max-w-[80%] text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === 'ai') {
    return (
      <div className="flex justify-start mb-3">
        <div className="bg-gray-100 text-gray-800 rounded-lg px-4 py-2 max-w-[80%] text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  // System messages (errors)
  if (message.error) {
    return (
      <div className="flex justify-center mb-3">
        <div className="bg-red-50 text-red-600 rounded-lg px-4 py-2 text-xs">
          {message.error}
        </div>
      </div>
    );
  }

  return null;
}
