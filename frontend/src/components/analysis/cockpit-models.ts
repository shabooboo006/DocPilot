import type { TenderAnalysisSnapshot, TenderEvidence, TenderField, TenderFieldStatus, TimelineNode } from '../../types';

export interface DisplayField {
  key: string;
  label: string;
  value: string;
  status: TenderFieldStatus;
  fieldPath: string;
  evidence: TenderEvidence[];
  confidence: number;
  userNote?: string;
}

export interface ContactItem {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  status: TenderFieldStatus;
  confidence: number;
  evidence: TenderEvidence[];
}

export interface LotRow {
  id: string;
  name: string;
  budget: string;
  maximumPrice: string;
  bidBond: string;
  status: string;
}

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  confidence: number;
  evidence: TenderEvidence[];
}

export interface EvaluationRow {
  id: string;
  title: string;
  description: string;
  weight: string;
  status: string;
}

export interface RiskItem {
  id: string;
  title: string;
  summary: string;
  severity: string;
  status: string;
  recommendation: string;
  evidence: TenderEvidence[];
}

export interface OpenQuestionItem {
  id: string;
  question: string;
  reason: string;
  status: string;
  evidence: TenderEvidence[];
}

export interface TimelineConflictItem {
  id: string;
  title: string;
  description: string;
  severity: string;
  evidence: TenderEvidence[];
}

const PROJECT_FIELD_LABELS: Record<string, string> = {
  project_name: '项目名称',
  project_code: '项目编号',
  tenderer: '采购人',
  agency: '代理机构',
  region: '区域',
  procurement_method: '采购方式',
};

const COMMERCIAL_FIELD_LABELS: Record<string, string> = {
  budget: '预算金额',
  maximum_price: '最高限价',
  bid_bond: '投标保证金',
  delivery_term: '交付周期',
};

function stringifyValue(value: unknown): string {
  if (Array.isArray(value)) return value.filter(Boolean).join(' / ');
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function isTenderField(value: unknown): value is TenderField {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'value' in value &&
      'status' in value &&
      'confidence' in value &&
      'evidence' in value,
  );
}

function unwrapFieldLike(value: unknown): {
  value: string;
  status: TenderFieldStatus;
  confidence: number;
  evidence: TenderEvidence[];
} {
  if (isTenderField(value)) {
    return {
      value: stringifyValue(value.value),
      status: value.status || 'missing',
      confidence: typeof value.confidence === 'number' ? value.confidence : 0,
      evidence: Array.isArray(value.evidence) ? value.evidence : [],
    };
  }

  return {
    value: stringifyValue(value),
    status: value == null || value === '' ? 'missing' : 'inferred',
    confidence: value == null || value === '' ? 0 : 0.55,
    evidence: [],
  };
}

function pickFieldLike(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in item) return unwrapFieldLike(item[key]);
  }
  return unwrapFieldLike(undefined);
}

function mergeEvidenceGroups(groups: TenderEvidence[][]): TenderEvidence[] {
  const merged: TenderEvidence[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const evidence of group) {
      const signature = JSON.stringify([
        evidence.source_excerpt,
        evidence.source_section_path,
        evidence.matched_text,
        evidence.table_cell_reference,
        evidence.confidence,
      ]);
      if (seen.has(signature)) continue;
      seen.add(signature);
      merged.push(evidence);
    }
  }

  return merged;
}

export function normalizeEvidenceEntry(value: unknown): TenderEvidence {
  const item = asRecord(value);
  return {
    source_excerpt: stringifyValue(item.source_excerpt || item.excerpt || item.text || ''),
    source_section_path: stringifyValue(item.source_section_path || item.source_path || item.section || ''),
    matched_text: stringifyValue(item.matched_text || ''),
    table_cell_reference: stringifyValue(item.table_cell_reference || ''),
    confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
  };
}

export function normalizeEvidenceList(value: unknown): TenderEvidence[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => normalizeEvidenceEntry(item))
    .filter((item) => Boolean(item.source_excerpt || item.source_section_path || item.matched_text || item.table_cell_reference));
}

function combineStatuses(statuses: TenderFieldStatus[]): TenderFieldStatus {
  const priority: TenderFieldStatus[] = ['conflicting', 'missing', 'user_edited', 'inferred', 'confirmed'];
  for (const status of priority) {
    if (statuses.includes(status)) return status;
  }
  return 'missing';
}

function toDisplayField(
  key: string,
  field: TenderField | undefined,
  labelMap: Record<string, string>,
  prefix: string,
): DisplayField {
  return {
    key,
    label: labelMap[key] || key,
    value: stringifyValue(field?.value),
    status: field?.status || 'missing',
    fieldPath: `${prefix}.${key}`,
    evidence: normalizeEvidenceList(field?.evidence),
    confidence: field?.confidence || 0,
    userNote: field?.user_note,
  };
}

function toEvidenceList(value: unknown): TenderEvidence[] {
  return normalizeEvidenceList(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function buildOverviewFields(snapshot: TenderAnalysisSnapshot): DisplayField[] {
  return Object.entries(snapshot.project_overview || {}).map(([key, field]) =>
    toDisplayField(key, field, PROJECT_FIELD_LABELS, 'project_overview'),
  );
}

export function buildCommercialFields(snapshot: TenderAnalysisSnapshot): DisplayField[] {
  return Object.entries(snapshot.commercial_terms || {}).map(([key, field]) =>
    toDisplayField(key, field, COMMERCIAL_FIELD_LABELS, 'commercial_terms'),
  );
}

export function buildContacts(snapshot: TenderAnalysisSnapshot): ContactItem[] {
  return (snapshot.contacts || []).map((entry, index) => {
    const item = asRecord(entry);
    const name = pickFieldLike(item, ['name', 'contact_name', 'person', 'value']);
    const role = pickFieldLike(item, ['role', 'title', 'department', 'label']);
    const phone = pickFieldLike(item, ['phone', 'mobile', 'telephone']);
    const email = pickFieldLike(item, ['email', 'mail']);

    return {
      id: stringifyValue(item.id || `contact-${index + 1}`),
      name: name.value || `联系人 ${index + 1}`,
      role: role.value || '联系人',
      phone: phone.value,
      email: email.value,
      status: combineStatuses([name.status, role.status, phone.status, email.status]),
      confidence: Math.max(name.confidence, role.confidence, phone.confidence, email.confidence),
      evidence: mergeEvidenceGroups([
        name.evidence,
        role.evidence,
        phone.evidence,
        email.evidence,
        normalizeEvidenceList(item.evidence),
      ]),
    };
  });
}

export function buildLotRows(snapshot: TenderAnalysisSnapshot): LotRow[] {
  return (snapshot.lots || []).map((entry, index) => {
    const item = asRecord(entry);
    return {
      id: stringifyValue(item.id || item.code || `lot-${index + 1}`),
      name: stringifyValue(item.name || item.title || item.lot_name || `标段 ${index + 1}`),
      budget: stringifyValue(item.budget || item.amount || item.estimated_budget || ''),
      maximumPrice: stringifyValue(item.maximum_price || item.max_price || item.limit_price || ''),
      bidBond: stringifyValue(item.bid_bond || item.deposit || item.bond || ''),
      status: stringifyValue(item.status || 'inferred'),
    };
  });
}

export function buildChecklistItems(items: Array<Record<string, unknown>> | unknown[]): ChecklistItem[] {
  return (items || []).map((entry, index) => {
    const item = asRecord(entry);
    return {
      id: stringifyValue(item.id || `item-${index + 1}`),
      title: stringifyValue(item.title || item.name || item.requirement || `条目 ${index + 1}`),
      description: stringifyValue(item.description || item.summary || item.detail || ''),
      category: stringifyValue(item.category || item.group || '未分组'),
      status: stringifyValue(item.status || 'open'),
      confidence: typeof item.confidence === 'number' ? item.confidence : 0,
      evidence: toEvidenceList(item.evidence),
    };
  });
}

export function buildEvaluationRows(snapshot: TenderAnalysisSnapshot): EvaluationRow[] {
  return (snapshot.evaluation_criteria || []).map((entry, index) => {
    const item = asRecord(entry);
    return {
      id: stringifyValue(item.id || `criteria-${index + 1}`),
      title: stringifyValue(item.title || item.name || `评分项 ${index + 1}`),
      description: stringifyValue(item.description || item.summary || ''),
      weight: stringifyValue(item.weight || item.score || item.points || ''),
      status: stringifyValue(item.status || 'open'),
    };
  });
}

export function buildRiskItems(snapshot: TenderAnalysisSnapshot): RiskItem[] {
  return (snapshot.risk_register || []).map((entry, index) => {
    const item = asRecord(entry);
    return {
      id: stringifyValue(item.id || `risk-${index + 1}`),
      title: stringifyValue(item.title || `风险 ${index + 1}`),
      summary: stringifyValue(item.summary || item.description || item.reason || ''),
      severity: stringifyValue(item.severity || 'medium'),
      status: stringifyValue(item.status || 'open'),
      recommendation: stringifyValue(item.recommendation || item.action || ''),
      evidence: toEvidenceList(item.evidence),
    };
  });
}

export function buildOpenQuestions(snapshot: TenderAnalysisSnapshot): OpenQuestionItem[] {
  return (snapshot.open_questions || []).map((entry, index) => {
    const item = asRecord(entry);
    return {
      id: stringifyValue(item.id || `question-${index + 1}`),
      question: stringifyValue(item.question || item.title || `问题 ${index + 1}`),
      reason: stringifyValue(item.reason || item.description || ''),
      status: stringifyValue(item.status || 'open'),
      evidence: toEvidenceList(item.evidence),
    };
  });
}

export function buildComplianceItems(snapshot: TenderAnalysisSnapshot): ChecklistItem[] {
  return buildChecklistItems(snapshot.compliance_flags || []);
}

export function buildTechnicalScopeItems(snapshot: TenderAnalysisSnapshot): ChecklistItem[] {
  return buildChecklistItems(snapshot.technical_scope?.items || []);
}

export function buildTimelineConflicts(snapshot: TenderAnalysisSnapshot): TimelineConflictItem[] {
  return (Array.isArray(snapshot.timeline?.conflicts) ? snapshot.timeline.conflicts : []).map((entry, index) => {
    const item = asRecord(entry);
    return {
      id: stringifyValue(item.id || `conflict-${index + 1}`),
      title: stringifyValue(item.label || item.title || item.conflict_type || `冲突 ${index + 1}`),
      description: stringifyValue(item.description || item.reason || item.message || ''),
      severity: stringifyValue(item.severity || 'medium'),
      evidence: toEvidenceList(item.evidence),
    };
  });
}

export function hasEvidence(evidence: TenderEvidence[] | undefined): boolean {
  return Boolean(evidence && evidence.length > 0);
}

export function timelineEvidence(node: TimelineNode): TenderEvidence[] {
  return node.evidence || [];
}
