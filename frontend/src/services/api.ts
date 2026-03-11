const API_BASE = 'http://localhost:6800';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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
