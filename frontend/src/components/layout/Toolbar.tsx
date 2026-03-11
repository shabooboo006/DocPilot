import { useRef } from 'react';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import { useChatStore } from '../../hooks/useChatStore';
import { uploadDocument, createDocument, getDownloadUrl } from '../../services/api';

export function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { documentId, documentName, suggestMode, setDocument, setSuggestMode, clearDocument } =
    useDocumentStore();
  const clearMessages = useChatStore((s) => s.clearMessages);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadDocument(file);
      clearMessages();
      clearDocument();
      setDocument(result.document_id, result.name);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '未知错误';
      alert(`上传失败: ${message}`);
    }
    e.target.value = '';
  };

  const handleCreate = async () => {
    try {
      const result = await createDocument('新文档');
      clearMessages();
      clearDocument();
      setDocument(result.document_id, result.name);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '未知错误';
      alert(`创建失败: ${message}`);
    }
  };

  const handleDownload = () => {
    if (!documentId) return;
    const a = document.createElement('a');
    a.href = getDownloadUrl(documentId);
    a.download = `${documentName || documentId}.docx`;
    a.click();
  };

  const handleModeToggle = () => {
    setSuggestMode(!suggestMode);
  };

  return (
    <div className="h-12 bg-gray-900 text-white flex items-center px-4 gap-2 flex-shrink-0">
      <span className="font-bold text-base mr-3 text-blue-400">DocPilot</span>

      <input
        ref={fileInputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={handleUpload}
      />
      <button
        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        上传文档
      </button>
      <button
        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
        onClick={handleCreate}
      >
        新建文档
      </button>

      {documentId && (
        <>
          <button
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            onClick={handleDownload}
          >
            下载
          </button>

          <div className="mx-2 h-5 w-px bg-gray-600" />

          <span className="text-sm text-gray-300 max-w-xs truncate">{documentName}</span>

          <div className="ml-auto">
            <button
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                suggestMode
                  ? 'bg-amber-600 hover:bg-amber-500'
                  : 'bg-emerald-700 hover:bg-emerald-600'
              }`}
              onClick={handleModeToggle}
            >
              {suggestMode ? '建议模式' : '直接编辑'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
