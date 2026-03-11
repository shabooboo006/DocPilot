import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from './useChatStore';
import { useDocumentStore } from './useDocumentStore';
import type { ChatWsMessage } from '../types';

const WS_BASE = 'ws://localhost:8000';

export function useChatWebSocket(documentId: string | null) {
  const ws = useRef<WebSocket | null>(null);
  const { addMessage, updateToolCallStatus, setAIThinking } = useChatStore();
  const suggestMode = useDocumentStore((s) => s.suggestMode);

  useEffect(() => {
    if (!documentId) return;

    const socket = new WebSocket(`${WS_BASE}/ws/chat/${documentId}`);
    ws.current = socket;

    socket.onmessage = (event) => {
      const data: ChatWsMessage = JSON.parse(event.data);

      switch (data.type) {
        case 'ai_message':
          setAIThinking(false);
          addMessage({ role: 'ai', content: data.content || '' });
          break;
        case 'tool_call':
          addMessage({
            role: 'system',
            toolCall: {
              tool: data.tool || '',
              status: 'executing',
              description: data.description,
            },
          });
          break;
        case 'tool_result':
          updateToolCallStatus(data.tool || '', data.status || 'success', data.result);
          break;
        case 'error':
          setAIThinking(false);
          addMessage({ role: 'system', error: data.message });
          break;
      }
    };

    socket.onclose = () => {
      ws.current = null;
    };

    return () => {
      socket.close();
      ws.current = null;
    };
  }, [documentId, addMessage, updateToolCallStatus, setAIThinking]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
      addMessage({ role: 'user', content });
      setAIThinking(true);
      ws.current.send(
        JSON.stringify({
          type: 'user_message',
          content,
          suggest: suggestMode,
        })
      );
    },
    [addMessage, setAIThinking, suggestMode]
  );

  const switchMode = useCallback((suggest: boolean) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    ws.current.send(JSON.stringify({ type: 'set_suggest_mode', suggest }));
  }, []);

  return { sendMessage, switchMode };
}
