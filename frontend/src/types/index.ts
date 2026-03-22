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

export interface EditorLocateRequest {
  requestId: string;
  evidenceTitle: string;
  queryText?: string;
  fallbackText?: string;
  sectionPath?: string;
}

export type EditorLocateStatus = 'idle' | 'locating' | 'found' | 'not_found';

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

export type AnalysisPanelTab = 'agent' | 'cockpit';
export type AnalysisRunStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'ready';
export type AnalysisStepStatus =
  | 'pending'
  | 'running'
  | 'streaming'
  | 'succeeded'
  | 'failed'
  | 'blocked';
export type TimelineViewMode = 'timeline' | 'list' | 'calendar';
export type TenderFieldStatus = 'confirmed' | 'inferred' | 'missing' | 'conflicting' | 'user_edited';

export interface TenderEvidence {
  source_excerpt?: string;
  source_section_path?: string;
  matched_text?: string;
  table_cell_reference?: string;
  confidence?: number;
  excerpt?: string;
  source_path?: string;
}

export interface TenderField<T = unknown> {
  value: T;
  status: TenderFieldStatus;
  confidence: number;
  evidence: TenderEvidence[];
  candidate_values?: T[];
  user_note?: string;
}

export interface TimelineNode {
  id: string;
  event_type: string;
  label: string;
  date?: string;
  time?: string;
  datetime_iso?: string;
  lots?: string[];
  status: TenderFieldStatus;
  confidence?: number;
  urgency?: string;
  is_critical?: boolean;
  dependencies?: string[];
  candidate_values?: string[];
  evidence?: TenderEvidence[];
  user_note?: string;
  updatedAt?: string;
}

export interface DeadlineTodoItem {
  id: string;
  node_id: string;
  title: string;
  status: string;
  due_datetime?: string;
  created_at?: string;
}

export interface TenderAnalysisSnapshot {
  document_meta: {
    document_id: string;
    document_name: string;
    source?: string;
    extracted_at?: string;
  };
  project_overview: Record<string, TenderField>;
  lots: Array<Record<string, unknown>>;
  timeline: {
    nodes: TimelineNode[];
    conflicts: Array<Record<string, unknown>>;
  };
  contacts: Array<Record<string, unknown>>;
  commercial_terms: Record<string, TenderField>;
  qualification_requirements: Array<Record<string, unknown>>;
  technical_scope: {
    summary: TenderField<string>;
    items: Array<Record<string, unknown>>;
  };
  submission_requirements: Array<Record<string, unknown>>;
  evaluation_criteria: Array<Record<string, unknown>>;
  compliance_flags: Array<Record<string, unknown>>;
  risk_register: Array<Record<string, unknown>>;
  open_questions: Array<Record<string, unknown>>;
  deadline_todos: DeadlineTodoItem[];
  evidence_index: Record<string, TenderEvidence[]>;
}

export interface AnalysisStepEvent {
  id: string;
  kind: string;
  message: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export interface AnalysisStep {
  id: string;
  runId: string;
  stage: string;
  title: string;
  description: string;
  status: AnalysisStepStatus;
  startedAt?: string | null;
  updatedAt?: string | null;
  events: AnalysisStepEvent[];
  previewPayload?: Record<string, unknown> | null;
  error?: string | null;
}

export interface AnalysisRun {
  id: string;
  documentId: string;
  documentName: string;
  status: AnalysisRunStatus;
  currentStage?: string | null;
  startedAt: string;
  updatedAt: string;
  summary: string;
  completedStepCount: number;
  riskCount: number;
  confirmedFieldCount: number;
  steps: AnalysisStep[];
  threadId?: string | null;
  error?: string | null;
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
    | 'agent_summary'
    | 'tender_analysis_run'
    | 'tender_analysis_run_update'
    | 'tender_analysis_step'
    | 'tender_analysis_step_update'
    | 'tender_analysis_step_event'
    | 'tender_analysis_run_complete'
    | 'tender_analysis_run_failed';
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
  run?: AnalysisRun;
  step?: Omit<AnalysisStep, 'runId'>;
  run_id?: string;
  step_id?: string;
  event?: AnalysisStepEvent;
}
