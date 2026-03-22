import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from './useChatStore';
import { useDocumentStore } from './useDocumentStore';
import { useAnalysisStore } from './useAnalysisStore';
import { getTenderAnalysis } from '../services/api';
import type { AnalysisRun, AnalysisStep, ChatAttachment, ChatWsMessage, TenderAnalysisSnapshot } from '../types';

const WS_BASE = 'ws://localhost:6800';

export function useChatWebSocket(documentId: string | null) {
  const ws = useRef<WebSocket | null>(null);
  const {
    addMessage,
    updateToolCallStatus,
    setAIThinking,
    setCurrentPhase,
    setCurrentPlan,
    upsertPlanMessage,
    upsertAgentTask,
    setAgentSummary,
    resetRuntimeState,
  } = useChatStore();
  const suggestMode = useDocumentStore((s) => s.suggestMode);
  const analysisReadOnly = useDocumentStore((s) => s.analysisReadOnly);
  const setAnalysisReadOnly = useDocumentStore((s) => s.setAnalysisReadOnly);
  const requestEditorRefresh = useDocumentStore((s) => s.requestEditorRefresh);
  const planModeEnabled = useChatStore((state) => state.planModeEnabled);
  const {
    upsertRun,
    upsertStep,
    appendStepEvent,
    setSnapshot,
    setActiveTab,
  } = useAnalysisStore();

  useEffect(() => {
    if (!documentId) return;

    const socket = new WebSocket(`${WS_BASE}/ws/chat/${documentId}`);
    ws.current = socket;

    socket.onmessage = (event) => {
      const data: ChatWsMessage = JSON.parse(event.data);

      switch (data.type) {
        case 'ai_message':
          setAIThinking(false);
          if (useChatStore.getState().currentPlan?.status === 'executing') {
            setCurrentPlan({ ...useChatStore.getState().currentPlan!, status: 'completed' });
          }
          addMessage({ role: 'ai', content: data.content || '' });
          break;
        case 'tool_call':
          addMessage({
            role: 'system',
            toolCall: {
              tool: data.tool || '',
              status: 'executing',
              description: data.description,
              taskId: data.task_id,
              agentId: data.agent_id,
              phase: data.phase,
              summary: data.summary,
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
            error_details: data.error_details,
            candidates: data.candidates,
            anchor_candidates: data.anchor_candidates,
            selected_anchor: data.selected_anchor,
            asset_id: data.asset_id,
            caption_added: data.caption_added,
            caption_text: data.caption_text,
            final_size: data.final_size,
          }, {
            taskId: data.task_id,
            agentId: data.agent_id,
            phase: data.phase,
            summary: data.summary,
          });
          if (data.status === 'success' && data.reload_required) {
            requestEditorRefresh();
          }
          break;
        case 'agent_phase':
          setCurrentPhase(data.phase || 'idle');
          break;
        case 'agent_plan':
          upsertPlanMessage({
            title: data.title || '执行计划',
            summary: data.summary || '',
            content: data.content || '',
            status: data.status || 'awaiting_decision',
          });
          setAIThinking(data.status === 'executing');
          break;
        case 'agent_plan_decision_required':
          upsertPlanMessage({
            title: data.title || '执行计划',
            summary: data.summary || '',
            content: data.content || '',
            status: 'awaiting_decision',
          });
          setAIThinking(false);
          break;
        case 'agent_task':
          upsertAgentTask({
            task_id: data.task_id || '',
            title: data.title || '未命名任务',
            status: data.status || 'pending',
            summary: data.summary,
            parent_task_id: data.parent_task_id,
            agent_id: data.agent_id,
          });
          break;
        case 'agent_summary':
          setAgentSummary(data.summary || '');
          break;
        case 'error':
          setAIThinking(false);
          addMessage({ role: 'system', error: data.message });
          break;
        case 'tender_analysis_run':
        case 'tender_analysis_run_update':
          setAnalysisReadOnly(true);
          if (data.run) {
            upsertRun(data.run as AnalysisRun);
          }
          break;
        case 'tender_analysis_step':
        case 'tender_analysis_step_update':
          if (data.run_id && data.step) {
            upsertStep(data.run_id, data.step as Omit<AnalysisStep, 'runId'>);
          }
          break;
        case 'tender_analysis_step_event':
          if (data.run_id && data.step_id && data.event) {
            appendStepEvent(data.run_id, data.step_id, data.event);
          }
          break;
        case 'tender_analysis_run_complete':
          if (data.run) {
            upsertRun(data.run as AnalysisRun);
          }
          if (documentId) {
            setAnalysisReadOnly(true);
            void getTenderAnalysis(documentId).then((response) => {
              if (response.snapshot) {
                setSnapshot(response.snapshot as unknown as TenderAnalysisSnapshot);
              }
            });
          }
          setActiveTab('cockpit');
          break;
        case 'tender_analysis_run_failed':
          if (data.run) {
            upsertRun(data.run as AnalysisRun);
          }
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
  }, [
    documentId,
    addMessage,
    updateToolCallStatus,
    setAIThinking,
    setCurrentPhase,
    setCurrentPlan,
    upsertPlanMessage,
    upsertAgentTask,
    setAgentSummary,
    requestEditorRefresh,
    analysisReadOnly,
    setAnalysisReadOnly,
    upsertRun,
    upsertStep,
    appendStepEvent,
    setSnapshot,
    setActiveTab,
  ]);

  const sendMessage = useCallback(
    (content: string, attachments: ChatAttachment[] = []) => {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
        addMessage({ role: 'system', error: '对话通道尚未连接，请稍后重试。' });
        return;
      }
      resetRuntimeState();
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
          analysis_read_only: analysisReadOnly,
          plan_mode: planModeEnabled,
        })
      );
    },
    [addMessage, analysisReadOnly, planModeEnabled, resetRuntimeState, setAIThinking, suggestMode]
  );

  const switchMode = useCallback((suggest: boolean) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    ws.current.send(JSON.stringify({ type: 'set_suggest_mode', suggest, analysis_read_only: analysisReadOnly }));
  }, [analysisReadOnly]);

  const sendPlanDecision = useCallback((decision: 'yes' | 'no') => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    if (decision === 'yes') {
      setAIThinking(true);
      setCurrentPlan(
        useChatStore.getState().currentPlan
          ? { ...useChatStore.getState().currentPlan!, status: 'executing' }
          : null,
      );
    }
    ws.current.send(JSON.stringify({ type: 'agent_plan_decision', decision }));
  }, [setAIThinking, setCurrentPlan]);

  const sendPlanFeedback = useCallback((content: string) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    setAIThinking(true);
    ws.current.send(JSON.stringify({ type: 'agent_plan_feedback', content }));
  }, [setAIThinking]);

  return { sendMessage, switchMode, sendPlanDecision, sendPlanFeedback };
}
