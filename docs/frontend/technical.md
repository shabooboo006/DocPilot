# 前端技术细节

## 技术栈

| 技术 | 用途 |
|------|------|
| React 18 | UI 框架 |
| Vite | 构建工具 |
| TypeScript | 类型安全 |
| superdoc | 文档编辑器 |
| yjs + y-websocket | Yjs 客户端 Provider |
| zustand | 轻量状态管理 |
| tailwindcss | 样式 |

## 目录结构

```
frontend/
  src/
    App.tsx
    main.tsx
    components/
      layout/
        MainLayout.tsx         # 双栏可拖拽分栏
        Toolbar.tsx            # 顶部工具栏
        StatusBar.tsx          # 底部状态栏
      editor/
        EditorPanel.tsx        # SuperDoc 编辑器容器
        useSuperdoc.ts         # SuperDoc 初始化 hook
      chat/
        ChatPanel.tsx          # Chat 面板容器
        MessageList.tsx        # 消息列表
        MessageBubble.tsx      # 单条消息气泡
        ToolCallIndicator.tsx  # 工具调用状态指示
        ChatInput.tsx          # 输入框
    hooks/
      useWebSocket.ts          # Chat WebSocket 连接管理
      useDocumentStore.ts      # 文档状态 (zustand)
      useChatStore.ts          # 聊天状态 (zustand)
    services/
      api.ts                   # REST API 调用封装
    types/
      index.ts                 # 类型定义
```

## SuperDoc 编辑器初始化

```typescript
// useSuperdoc.ts
function useSuperdoc(documentId: string) {
  const superdocRef = useRef<SuperDoc | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(
      'ws://localhost:3050',
      documentId,
      ydoc
    );

    provider.on('sync', (synced: boolean) => {
      if (!synced) return;

      superdocRef.current = new SuperDoc({
        selector: containerRef.current,
        documentMode: 'editing',
        user: {
          name: '用户',
          email: 'user@docpilot.local'
        },
        modules: {
          collaboration: { ydoc, provider }
        }
      });
    });

    return () => {
      superdocRef.current?.destroy();
      provider.destroy();
      ydoc.destroy();
    };
  }, [documentId]);

  return { containerRef, superdocRef };
}
```

## Chat WebSocket 管理

```typescript
// useWebSocket.ts
function useChatWebSocket(documentId: string) {
  const ws = useRef<WebSocket | null>(null);
  const { addMessage, updateLastAIMessage } = useChatStore();

  useEffect(() => {
    ws.current = new WebSocket(`ws://localhost:8000/ws/chat/${documentId}`);

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'ai_message':
          if (data.streaming) {
            updateLastAIMessage(data.content);  // 流式追加
          } else {
            addMessage({ role: 'ai', content: data.content });
          }
          break;
        case 'tool_call':
          addMessage({ role: 'system', toolCall: data });
          break;
        case 'tool_result':
          // 更新对应 tool_call 的状态
          break;
        case 'error':
          addMessage({ role: 'system', error: data.message });
          break;
      }
    };

    return () => ws.current?.close();
  }, [documentId]);

  const sendMessage = (content: string) => {
    addMessage({ role: 'user', content });
    ws.current?.send(JSON.stringify({
      type: 'user_message', content
    }));
  };

  return { sendMessage };
}
```

## 状态管理 (Zustand)

```typescript
// useDocumentStore.ts
interface DocumentState {
  documentId: string | null;
  documentName: string;
  suggestMode: boolean;        // 建议模式开关
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  setDocumentId: (id: string) => void;
  setSuggestMode: (mode: boolean) => void;
}

// useChatStore.ts
interface ChatState {
  messages: Message[];
  isAIThinking: boolean;       // AI 正在处理中
  addMessage: (msg: Message) => void;
  updateLastAIMessage: (content: string) => void;
}
```
