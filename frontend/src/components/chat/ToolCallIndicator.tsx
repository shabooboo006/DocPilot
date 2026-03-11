import type { Message } from '../../types';

interface ToolCallIndicatorProps {
  message: Message;
}

export function ToolCallIndicator({ message }: ToolCallIndicatorProps) {
  const tc = message.toolCall;
  if (!tc) return null;

  const statusIcon = {
    executing: '⏳',
    success: '✓',
    error: '✗',
  }[tc.status];

  const statusColor = {
    executing: 'text-yellow-600 bg-yellow-50',
    success: 'text-green-600 bg-green-50',
    error: 'text-red-600 bg-red-50',
  }[tc.status];

  return (
    <div className="flex justify-start mb-2">
      <div className={`rounded px-3 py-1.5 text-xs font-mono ${statusColor}`}>
        {statusIcon} {tc.tool} {tc.description ? `— ${tc.description}` : ''}
      </div>
    </div>
  );
}
