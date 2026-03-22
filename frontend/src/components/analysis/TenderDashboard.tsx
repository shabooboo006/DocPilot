import { useCallback, useEffect, useMemo, useState } from 'react';
import { withTamboInteractable } from '@tambo-ai/react';
import { z } from 'zod/v4';
import { useAnalysisStore } from '../../hooks/useAnalysisStore';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import {
  confirmTenderTimelineNode,
  createTenderDeadlineTodo,
  getTenderAnalysis,
  listTenderEvidence,
  patchTenderField,
  patchTenderSnapshotValue,
  patchTenderTimelineNode,
} from '../../services/api';
import type { TenderAnalysisSnapshot, TenderEvidence } from '../../types';
import { EvidenceDrawer } from './EvidenceDrawer';
import { EvaluationMatrix } from './EvaluationMatrix';
import { LotAndBudgetTable } from './LotAndBudgetTable';
import { OpenQuestionsPanel } from './OpenQuestionsPanel';
import { RiskRegisterBoard } from './RiskRegisterBoard';
import { TenderChecklistBoard } from './TenderChecklistBoard';
import { TenderOverviewBoard } from './TenderOverviewBoard';
import { TenderTimelineBoard } from './TenderTimelineBoard';
import {
  buildChecklistItems,
  buildCommercialFields,
  buildComplianceItems,
  buildContacts,
  buildEvaluationRows,
  buildLotRows,
  buildOpenQuestions,
  buildOverviewFields,
  buildRiskItems,
  buildTechnicalScopeItems,
  buildTimelineConflicts,
  normalizeEvidenceList,
} from './cockpit-models';

function hasEntries(value: unknown[] | undefined): boolean {
  return Boolean(value && value.length > 0);
}

function mergeLots(snapshot: TenderAnalysisSnapshot, rows: ReturnType<typeof buildLotRows>) {
  return (snapshot.lots || []).map((entry, index) => {
    const row = rows[index];
    if (!row || !entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    return {
      ...entry,
      id: row.id,
      name: row.name,
      budget: row.budget,
      maximum_price: row.maximumPrice,
      bid_bond: row.bidBond,
      status: row.status,
    };
  });
}

function mergeChecklist<T extends Record<string, unknown>>(
  items: T[],
  edited: ReturnType<typeof buildChecklistItems>,
) {
  return items.map((entry, index) => {
    const next = edited[index];
    if (!next) return entry;
    return {
      ...entry,
      title: next.title,
      description: next.description,
      category: next.category,
      status: next.status,
      confidence: next.confidence,
      evidence: next.evidence,
    };
  });
}

function mergeEvaluation(snapshot: TenderAnalysisSnapshot, rows: ReturnType<typeof buildEvaluationRows>) {
  return (snapshot.evaluation_criteria || []).map((entry, index) => {
    const row = rows[index];
    if (!row || !entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    return {
      ...entry,
      title: row.title,
      description: row.description,
      weight: row.weight,
      status: row.status,
    };
  });
}

function mergeRisks(snapshot: TenderAnalysisSnapshot, rows: ReturnType<typeof buildRiskItems>) {
  return (snapshot.risk_register || []).map((entry, index) => {
    const row = rows[index];
    if (!row || !entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    return {
      ...entry,
      title: row.title,
      summary: row.summary,
      severity: row.severity,
      status: row.status,
      recommendation: row.recommendation,
      evidence: row.evidence,
    };
  });
}

function mergeQuestions(snapshot: TenderAnalysisSnapshot, rows: ReturnType<typeof buildOpenQuestions>) {
  return (snapshot.open_questions || []).map((entry, index) => {
    const row = rows[index];
    if (!row || !entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    return {
      ...entry,
      question: row.question,
      reason: row.reason,
      status: row.status,
      evidence: row.evidence,
    };
  });
}

function TenderDashboardBase() {
  const documentId = useDocumentStore((state) => state.documentId);
  const setAnalysisReadOnly = useDocumentStore((state) => state.setAnalysisReadOnly);
  const requestEditorLocate = useDocumentStore((state) => state.requestEditorLocate);
  const snapshot = useAnalysisStore((state) => state.snapshot);
  const setSnapshot = useAnalysisStore((state) => state.setSnapshot);
  const [drawer, setDrawer] = useState<{
    title: string;
    fieldPath?: string;
    evidence: TenderEvidence[];
  } | null>(null);

  useEffect(() => {
    if (!documentId) return;
    void getTenderAnalysis(documentId).then((response) => {
      if (response.snapshot) {
        setAnalysisReadOnly(true);
        setSnapshot(response.snapshot as unknown as TenderAnalysisSnapshot);
      }
    });
  }, [documentId, setAnalysisReadOnly, setSnapshot]);

  const updateSnapshotFromResponse = useCallback(
    (response: { snapshot?: Record<string, unknown> | null }) => {
      if (response.snapshot) {
        setSnapshot(response.snapshot as unknown as TenderAnalysisSnapshot);
      }
    },
    [setSnapshot],
  );

  const handleOpenEvidence = useCallback(
    async (title: string, fieldPath?: string, fallbackEvidence: TenderEvidence[] = []) => {
      if (!documentId) return;
      if (fieldPath) {
        const response = await listTenderEvidence(documentId, fieldPath).catch(() => ({ evidence: fallbackEvidence }));
        setDrawer({
          title,
          fieldPath,
          evidence: normalizeEvidenceList(response.evidence || fallbackEvidence),
        });
        return;
      }
      setDrawer({ title, evidence: normalizeEvidenceList(fallbackEvidence) });
    },
    [documentId],
  );

  const handleLocateEvidence = useCallback(
    (title: string, evidence: TenderEvidence) => {
      requestEditorLocate({
        evidenceTitle: title,
        queryText: evidence.source_excerpt || evidence.excerpt || evidence.matched_text,
        fallbackText: evidence.matched_text || evidence.source_excerpt || evidence.excerpt,
        sectionPath: evidence.source_section_path || evidence.source_path,
      });
    },
    [requestEditorLocate],
  );

  const overviewFields = useMemo(() => (snapshot ? buildOverviewFields(snapshot) : []), [snapshot]);
  const commercialFields = useMemo(() => (snapshot ? buildCommercialFields(snapshot) : []), [snapshot]);
  const contacts = useMemo(() => (snapshot ? buildContacts(snapshot) : []), [snapshot]);
  const lotRows = useMemo(() => (snapshot ? buildLotRows(snapshot) : []), [snapshot]);
  const qualificationItems = useMemo(
    () => (snapshot ? buildChecklistItems(snapshot.qualification_requirements || []) : []),
    [snapshot],
  );
  const submissionItems = useMemo(
    () => (snapshot ? buildChecklistItems(snapshot.submission_requirements || []) : []),
    [snapshot],
  );
  const technicalItems = useMemo(() => (snapshot ? buildTechnicalScopeItems(snapshot) : []), [snapshot]);
  const evaluationRows = useMemo(() => (snapshot ? buildEvaluationRows(snapshot) : []), [snapshot]);
  const complianceItems = useMemo(() => (snapshot ? buildComplianceItems(snapshot) : []), [snapshot]);
  const riskItems = useMemo(() => (snapshot ? buildRiskItems(snapshot) : []), [snapshot]);
  const openQuestions = useMemo(() => (snapshot ? buildOpenQuestions(snapshot) : []), [snapshot]);
  const timelineConflicts = useMemo(() => (snapshot ? buildTimelineConflicts(snapshot) : []), [snapshot]);

  if (!documentId) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
        先上传或打开一个招标 docx，再进入驾驶舱。
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4 text-sm leading-6 text-zinc-500">
        当前还没有提取结果。点击顶部“招标分析”后，会先在 Agent 流程里展示步骤卡片流，完成后这里会自动加载固定驾驶舱。
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <TenderOverviewBoard
          stateKey="overview"
          variant="project"
          title="项目概况"
          subtitle="Overview"
          fields={overviewFields}
          contacts={contacts}
          onSaveField={(fieldPath, value) => {
            void patchTenderField(documentId, fieldPath, value).then(updateSnapshotFromResponse);
          }}
          onOpenEvidence={(title, fieldPath, evidence) => {
            if (!fieldPath) {
              void handleOpenEvidence(title, undefined, evidence || []);
              return;
            }
            const field = overviewFields.find((item) => item.fieldPath === fieldPath);
            void handleOpenEvidence(title, fieldPath, field?.evidence || evidence || []);
          }}
        />

        <TenderOverviewBoard
          stateKey="commercial"
          title="商务条款"
          subtitle="Commercial Terms"
          fields={commercialFields}
          onSaveField={(fieldPath, value) => {
            void patchTenderField(documentId, fieldPath, value).then(updateSnapshotFromResponse);
          }}
          onOpenEvidence={(title, fieldPath, evidence) => {
            if (!fieldPath) {
              void handleOpenEvidence(title, undefined, evidence || []);
              return;
            }
            const field = commercialFields.find((item) => item.fieldPath === fieldPath);
            void handleOpenEvidence(title, fieldPath, field?.evidence || evidence || []);
          }}
        />

        <TenderTimelineBoard
          stateKey="timeline"
          nodes={snapshot.timeline?.nodes || []}
          conflicts={timelineConflicts}
          todos={snapshot.deadline_todos || []}
          onConfirm={(nodeId) => {
            void confirmTenderTimelineNode(documentId, nodeId).then(updateSnapshotFromResponse);
          }}
          onCreateTodo={(nodeId) => {
            void createTenderDeadlineTodo(documentId, nodeId).then(async () => {
              const response = await getTenderAnalysis(documentId);
              updateSnapshotFromResponse(response);
            });
          }}
          onSaveNode={(nodeId, patch) => {
            void patchTenderTimelineNode(documentId, nodeId, patch).then(updateSnapshotFromResponse);
          }}
          onOpenEvidence={(title, fieldPath) => {
            const node = snapshot.timeline?.nodes?.find((item) => `timeline.nodes.${item.id}` === fieldPath);
            void handleOpenEvidence(title, fieldPath, node?.evidence || []);
          }}
        />

        {hasEntries(lotRows) && (
          <LotAndBudgetTable
            stateKey="lots"
            rows={lotRows}
            onSaveRows={(rows) => {
              void patchTenderSnapshotValue(documentId, 'lots', mergeLots(snapshot, rows)).then(updateSnapshotFromResponse);
            }}
          />
        )}

        {hasEntries(qualificationItems) && (
          <TenderChecklistBoard
            stateKey="qualification"
            title="资格条件"
            subtitle="Qualification Checklist"
            items={qualificationItems}
            onSaveItems={(items) => {
              void patchTenderSnapshotValue(
                documentId,
                'qualification_requirements',
                mergeChecklist(snapshot.qualification_requirements || [], items),
              ).then(updateSnapshotFromResponse);
            }}
            onOpenEvidence={(title, evidence) => void handleOpenEvidence(title, undefined, evidence)}
          />
        )}

        {hasEntries(submissionItems) && (
          <TenderChecklistBoard
            stateKey="submission"
            title="投标文件要求"
            subtitle="Submission Package"
            items={submissionItems}
            onSaveItems={(items) => {
              void patchTenderSnapshotValue(
                documentId,
                'submission_requirements',
                mergeChecklist(snapshot.submission_requirements || [], items),
              ).then(updateSnapshotFromResponse);
            }}
            onOpenEvidence={(title, evidence) => void handleOpenEvidence(title, undefined, evidence)}
          />
        )}

        {hasEntries(technicalItems) && (
          <TenderChecklistBoard
            stateKey="technical"
            title="技术范围"
            subtitle="Technical Scope"
            items={technicalItems}
            onSaveItems={(items) => {
              void patchTenderSnapshotValue(
                documentId,
                'technical_scope.items',
                mergeChecklist(snapshot.technical_scope?.items || [], items),
              ).then(updateSnapshotFromResponse);
            }}
            onOpenEvidence={(title, evidence) => void handleOpenEvidence(title, undefined, evidence)}
          />
        )}

        {hasEntries(evaluationRows) && (
          <EvaluationMatrix
            stateKey="evaluation"
            rows={evaluationRows}
            onSaveRows={(rows) => {
              void patchTenderSnapshotValue(
                documentId,
                'evaluation_criteria',
                mergeEvaluation(snapshot, rows),
              ).then(updateSnapshotFromResponse);
            }}
          />
        )}

        {hasEntries(complianceItems) && (
          <TenderChecklistBoard
            stateKey="compliance"
            title="合规标记"
            subtitle="Compliance Flags"
            items={complianceItems}
            onSaveItems={(items) => {
              void patchTenderSnapshotValue(
                documentId,
                'compliance_flags',
                mergeChecklist(snapshot.compliance_flags || [], items),
              ).then(updateSnapshotFromResponse);
            }}
            onOpenEvidence={(title, evidence) => void handleOpenEvidence(title, undefined, evidence)}
          />
        )}

        {hasEntries(riskItems) && (
          <RiskRegisterBoard
            stateKey="risks"
            items={riskItems}
            onSaveItems={(items) => {
              void patchTenderSnapshotValue(documentId, 'risk_register', mergeRisks(snapshot, items)).then(
                updateSnapshotFromResponse,
              );
            }}
            onOpenEvidence={(title, evidence) => void handleOpenEvidence(title, undefined, evidence)}
          />
        )}

        {hasEntries(openQuestions) && (
          <OpenQuestionsPanel
            stateKey="open-questions"
            items={openQuestions}
            onSaveItems={(items) => {
              void patchTenderSnapshotValue(documentId, 'open_questions', mergeQuestions(snapshot, items)).then(
                updateSnapshotFromResponse,
              );
            }}
            onOpenEvidence={(title, evidence) => void handleOpenEvidence(title, undefined, evidence)}
          />
        )}
      </div>

      <EvidenceDrawer
        open={Boolean(drawer)}
        title={drawer?.title || ''}
        fieldPath={drawer?.fieldPath}
        evidence={drawer?.evidence || []}
        onLocateEvidence={handleLocateEvidence}
        onClose={() => setDrawer(null)}
      />
    </>
  );
}

export const TenderDashboard = withTamboInteractable(TenderDashboardBase, {
  componentName: 'TenderDashboard',
  description: '招标分析固定驾驶舱，按数据类型展示概况、时间线、表格、清单、评分矩阵、风险和证据。',
  propsSchema: z.object({}),
  stateSchema: z.object({}),
});
