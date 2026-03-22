const API_BASE = 'http://localhost:6800';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface TenderAnalysisStatusResponse {
  status: string;
  active_job_id?: string | null;
  snapshot?: Record<string, unknown> | null;
}

export interface TenderTimelineNodePatch {
  label?: string;
  event_type?: string;
  date?: string | null;
  time?: string | null;
  datetime_iso?: string | null;
  status?: string;
  urgency?: string;
  is_critical?: boolean;
  lots?: string[];
  dependencies?: string[];
  user_note?: string;
}

export async function uploadDocument(file: File): Promise<{ document_id: string; name: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/api/documents/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Upload failed');
  }
  return res.json();
}

export async function createDocument(name = 'Untitled'): Promise<{ document_id: string; name: string }> {
  const res = await fetch(`${API_BASE}/api/documents/create?name=${encodeURIComponent(name)}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Create failed');
  return res.json();
}

export async function getDocumentInfo(documentId: string): Promise<{ document_id: string; name: string; created_at: string }> {
  const res = await fetch(`${API_BASE}/api/documents/${documentId}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Document not found');
  return res.json();
}

export function getDownloadUrl(documentId: string): string {
  return `${API_BASE}/api/documents/${documentId}/download`;
}

export async function fetchDocumentBlob(documentId: string): Promise<Blob> {
  const res = await fetch(getDownloadUrl(documentId), {
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Load failed');
  }

  return res.blob();
}

export async function saveDocumentBlob(documentId: string, blob: Blob): Promise<void> {
  const res = await fetch(`${API_BASE}/api/documents/${documentId}/content`, {
    method: 'PUT',
    headers: {
      'Content-Type': DOCX_MIME,
    },
    body: blob,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Save failed');
  }
}

export async function uploadChatAsset(
  documentId: string,
  file: File,
): Promise<{ asset_id: string; filename: string; mime_type: string; width: number; height: number; size_bytes: number; storage_key: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/api/documents/${documentId}/chat-assets`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Image upload failed');
  }

  return res.json();
}

export async function deleteChatAsset(documentId: string, assetId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/documents/${documentId}/chat-assets/${assetId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Image delete failed');
  }
}

export async function startTenderAnalysis(
  documentId: string,
  forceRefresh = false,
): Promise<{ job_id: string; status: string; run?: Record<string, unknown> }> {
  const res = await fetch(
    `${API_BASE}/api/documents/${documentId}/tender-analysis/extract?force_refresh=${String(forceRefresh)}`,
    {
      method: 'POST',
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Tender analysis start failed');
  }
  return res.json();
}

export async function getTenderAnalysis(documentId: string): Promise<TenderAnalysisStatusResponse> {
  const res = await fetch(`${API_BASE}/api/documents/${documentId}/tender-analysis`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Tender analysis load failed');
  }
  return res.json();
}

export async function patchTenderField(
  documentId: string,
  fieldPath: string,
  value: unknown,
  note?: string,
): Promise<TenderAnalysisStatusResponse> {
  const res = await fetch(`${API_BASE}/api/documents/${documentId}/tender-analysis/fields`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_path: fieldPath, value, note }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Tender field patch failed');
  }
  return res.json();
}

export async function patchTenderSnapshotValue(
  documentId: string,
  fieldPath: string,
  value: unknown,
): Promise<TenderAnalysisStatusResponse> {
  const res = await fetch(`${API_BASE}/api/documents/${documentId}/tender-analysis/snapshot`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_path: fieldPath, value }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Tender snapshot patch failed');
  }
  return res.json();
}

export async function patchTenderTimelineNode(
  documentId: string,
  nodeId: string,
  patch: TenderTimelineNodePatch,
): Promise<TenderAnalysisStatusResponse> {
  const res = await fetch(`${API_BASE}/api/documents/${documentId}/tender-analysis/timeline/${nodeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patch }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Timeline patch failed');
  }
  return res.json();
}

export async function confirmTenderTimelineNode(
  documentId: string,
  nodeId: string,
): Promise<TenderAnalysisStatusResponse> {
  const res = await fetch(
    `${API_BASE}/api/documents/${documentId}/tender-analysis/timeline/${nodeId}/confirm`,
    {
      method: 'POST',
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Timeline confirm failed');
  }
  return res.json();
}

export async function listTenderEvidence(documentId: string, fieldPath: string): Promise<{ evidence: unknown[] }> {
  const res = await fetch(
    `${API_BASE}/api/documents/${documentId}/tender-analysis/evidence?field_path=${encodeURIComponent(fieldPath)}`,
    {
      cache: 'no-store',
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Evidence fetch failed');
  }
  return res.json();
}

export async function listTenderTimelineConflicts(documentId: string): Promise<{ conflicts: unknown[] }> {
  const res = await fetch(`${API_BASE}/api/documents/${documentId}/tender-analysis/timeline/conflicts`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Timeline conflicts fetch failed');
  }
  return res.json();
}

export async function createTenderDeadlineTodo(
  documentId: string,
  nodeId: string,
  templateType?: string,
): Promise<{ todo: Record<string, unknown> }> {
  const res = await fetch(
    `${API_BASE}/api/documents/${documentId}/tender-analysis/timeline/${nodeId}/todos`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_type: templateType }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Deadline todo creation failed');
  }
  return res.json();
}
