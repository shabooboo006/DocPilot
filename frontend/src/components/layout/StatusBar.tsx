import { useDocumentStore } from '../../hooks/useDocumentStore';
import { useChatStore } from '../../hooks/useChatStore';

const STATUS_LABELS: Record<string, string> = {
  idle: '未连接',
  connecting: '连接中...',
  connected: '已连接',
  disconnected: '已断开',
};

const STATUS_COLORS: Record<string, string> = {
  idle: 'bg-gray-500',
  connecting: 'bg-yellow-500 animate-pulse',
  connected: 'bg-green-500',
  disconnected: 'bg-red-500',
};

export function StatusBar() {
  const { connectionStatus, documentId, documentName } = useDocumentStore();
  const isAIThinking = useChatStore((s) => s.isAIThinking);

  return (
    <div className="h-6 bg-gray-800 text-gray-400 flex items-center px-3 text-xs gap-3 flex-shrink-0 border-t border-gray-700">
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[connectionStatus]}`} />
        <span>{STATUS_LABELS[connectionStatus]}</span>
      </div>

      {isAIThinking && (
        <span className="text-yellow-400 animate-pulse">AI 处理中...</span>
      )}

      {documentId && (
        <span className="ml-auto text-gray-500">
          {documentName} · {documentId}
        </span>
      )}
    </div>
  );
}
