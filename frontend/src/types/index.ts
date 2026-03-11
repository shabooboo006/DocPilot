export interface DocumentInfo {
  document_id: string;
  name: string;
  size?: number;
}

export interface DocumentCreateResponse {
  document_id: string;
  name: string;
}

export interface Message {
  id: string;
  role: 'user' | 'ai' | 'system';
  content?: string;
  toolCall?: ToolCallInfo;
  error?: string;
  timestamp: number;
}

export interface ToolCallInfo {
  tool: string;
  status: 'executing' | 'success' | 'error';
  description?: string;
  result?: Record<string, unknown>;
}

export interface ChatWsMessage {
  type: 'user_message' | 'ai_message' | 'tool_call' | 'tool_result' | 'error' | 'set_suggest_mode';
  content?: string;
  tool?: string;
  status?: string;
  description?: string;
  result?: Record<string, unknown>;
  message?: string;
  streaming?: boolean;
  suggest?: boolean;
}
