export interface DocumentInfo {
  document_id: string;
  name: string;
  size?: number;
}

export interface DocumentCreateResponse {
  document_id: string;
  name: string;
}

export interface ChatAttachment {
  asset_id: string;
  filename: string;
  mime_type: string;
  width: number;
  height: number;
  previewUrl?: string;
}

export interface AnchorCandidate {
  anchor_id: string;
  segment_id: string;
  location_label: string;
  section_path?: string;
  context_before?: string;
  context_after?: string;
  confidence?: number;
  placement?: 'before' | 'after' | 'replace_placeholder';
}

export interface InsertedImageResult {
  asset_id: string;
  caption_added?: boolean;
  caption_text?: string;
  final_size?: {
    width: number;
    height: number;
  };
  selected_anchor?: AnchorCandidate;
}

export type AgentPhase = 'idle' | 'inspect' | 'plan' | 'execute' | 'verify' | 'respond' | string;

export type AgentPlanStatus =
  | 'awaiting_decision'
  | 'collecting_feedback'
  | 'executing'
  | 'completed'
  | string;

export interface AgentTask {
  task_id: string;
  title: string;
  status: string;
  summary?: string;
  parent_task_id?: string;
  agent_id?: string;
}

export interface AgentPlan {
  title: string;
  summary: string;
  content: string;
  status: AgentPlanStatus;
}

export interface Message {
  id: string;
  role: 'user' | 'ai' | 'system';
  content?: string;
  attachments?: ChatAttachment[];
  toolCall?: ToolCallInfo;
  agentPlan?: AgentPlan;
  error?: string;
  timestamp: number;
}

export interface ToolCallInfo {
  tool: string;
  status: 'executing' | 'success' | 'error';
  description?: string;
  result?: Record<string, unknown>;
  taskId?: string;
  agentId?: string;
  phase?: string;
  summary?: string;
}

export interface ChatWsMessage {
  type:
    | 'user_message'
    | 'ai_message'
    | 'tool_call'
    | 'tool_result'
    | 'error'
    | 'set_suggest_mode'
    | 'agent_phase'
    | 'agent_plan'
    | 'agent_plan_decision_required'
    | 'agent_plan_decision'
    | 'agent_plan_feedback'
    | 'agent_task'
    | 'agent_summary';
  content?: string;
  tool?: string;
  status?: string;
  description?: string;
  result?: Record<string, unknown>;
  phase?: AgentPhase;
  task_id?: string;
  agent_id?: string;
  parent_task_id?: string;
  title?: string;
  summary?: string;
  document_mutated?: boolean;
  reload_required?: boolean;
  tracked_changes_summary?: Record<string, unknown>;
  error_code?: string;
  error_details?: Record<string, unknown>;
  candidates?: Record<string, unknown>[];
  attachments?: ChatAttachment[];
  anchor_candidates?: AnchorCandidate[];
  selected_anchor?: AnchorCandidate;
  asset_id?: string;
  caption_added?: boolean;
  caption_text?: string;
  final_size?: { width: number; height: number };
  message?: string;
  streaming?: boolean;
  suggest?: boolean;
  decision?: 'yes' | 'no';
  plan_mode?: boolean;
}
