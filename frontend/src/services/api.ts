const API_BASE = 'http://localhost:8000';

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
  const res = await fetch(`${API_BASE}/api/documents/${documentId}`);
  if (!res.ok) throw new Error('Document not found');
  return res.json();
}

export function getDownloadUrl(documentId: string): string {
  return `${API_BASE}/api/documents/${documentId}/download`;
}
