import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from './useChatStore';
import { useDocumentStore } from './useDocumentStore';
import type { ChatAttachment, ChatWsMessage } from '../types';

const WS_BASE = 'ws://localhost:6800';

export function useChatWebSocket(documentId: string | null) {
  const ws = useRef<WebSocket | null>(null);
  const { addMessage, updateToolCallStatus, setAIThinking } = useChatStore();
  const suggestMode = useDocumentStore((s) => s.suggestMode);
  const requestEditorRefresh = useDocumentStore((s) => s.requestEditorRefresh);

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
          updateToolCallStatus(data.tool || '', data.status || 'success', {
            ...(data.result || {}),
            document_mutated: data.document_mutated,
            reload_required: data.reload_required,
            tracked_changes_summary: data.tracked_changes_summary,
            error_code: data.error_code,
            candidates: data.candidates,
            anchor_candidates: data.anchor_candidates,
            selected_anchor: data.selected_anchor,
            asset_id: data.asset_id,
            caption_added: data.caption_added,
            caption_text: data.caption_text,
            final_size: data.final_size,
          });
          if (data.status === 'success' && data.reload_required) {
            requestEditorRefresh();
          }
          break;
        case 'error':
          setAIThinking(false);
          addMessage({ role: 'system', error: data.message });
          break;
      }
    };

    socket.onerror = () => {
      // Reset thinking state so the input is not permanently locked
      setAIThinking(false);
    };

    socket.onclose = () => {
      setAIThinking(false);
      ws.current = null;
    };

    return () => {
      socket.close();
      ws.current = null;
    };
  }, [documentId, addMessage, updateToolCallStatus, setAIThinking, requestEditorRefresh]);

  const sendMessage = useCallback(
    (content: string, attachments: ChatAttachment[] = []) => {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
        addMessage({ role: 'system', error: '对话通道尚未连接，请稍后重试。' });
        return;
      }
      addMessage({ role: 'user', content, attachments });
      setAIThinking(true);
      ws.current.send(
        JSON.stringify({
          type: 'user_message',
          content,
          attachments: attachments.map(({ asset_id, filename, mime_type, width, height }) => ({
            asset_id,
            filename,
            mime_type,
            width,
            height,
          })),
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
