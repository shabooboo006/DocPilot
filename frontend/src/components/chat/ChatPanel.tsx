import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import { useChatWebSocket } from '../../hooks/useWebSocket';

export function ChatPanel() {
  const documentId = useDocumentStore((s) => s.documentId);
  const { sendMessage } = useChatWebSocket(documentId);

  return (
    <div className="flex-1 flex flex-col bg-white border-l border-gray-200">
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">AI 助手</h2>
      </div>
      <MessageList />
      {documentId ? (
        <ChatInput onSend={sendMessage} />
      ) : (
        <div className="p-4 text-center text-gray-400 text-sm border-t">
          请先打开一个文档
        </div>
      )}
    </div>
  );
}
