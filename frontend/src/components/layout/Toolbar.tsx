import { useRef, useState } from 'react';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import { useChatStore } from '../../hooks/useChatStore';
import { useAnalysisStore } from '../../hooks/useAnalysisStore';
import { uploadDocument, createDocument, getDownloadUrl, startTenderAnalysis } from '../../services/api';

const TOOLBAR_BUTTON =
  'inline-flex cursor-pointer items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors duration-200 hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

const TOOLBAR_PRIMARY_BUTTON =
  'inline-flex cursor-pointer items-center justify-center rounded-full border border-zinc-950 bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

const TOOLBAR_SEGMENT =
  'rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

export function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busyAction, setBusyAction] = useState<'idle' | 'upload' | 'create'>('idle');
  const { documentId, documentName, suggestMode, analysisReadOnly, setDocument, setSuggestMode, setAnalysisReadOnly, clearDocument } =
    useDocumentStore();
  const clearMessages = useChatStore((s) => s.clearMessages);
  const setActiveTab = useAnalysisStore((s) => s.setActiveTab);
  const resetForDocument = useAnalysisStore((s) => s.resetForDocument);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setBusyAction('upload');
      const result = await uploadDocument(file);
      clearMessages();
      clearDocument();
      resetForDocument();
      setDocument(result.document_id, result.name);
      setAnalysisReadOnly(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知错误';
      alert(`上传失败: ${message}`);
    } finally {
      setBusyAction('idle');
      event.target.value = '';
    }
  };

  const handleCreate = async () => {
    try {
      setBusyAction('create');
      const result = await createDocument('新文档');
      clearMessages();
      clearDocument();
      resetForDocument();
      setDocument(result.document_id, result.name);
      setAnalysisReadOnly(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知错误';
      alert(`创建失败: ${message}`);
    } finally {
      setBusyAction('idle');
    }
  };

  const handleDownload = () => {
    if (!documentId) return;
    const link = document.createElement('a');
    link.href = getDownloadUrl(documentId);
    link.download = `${documentName || documentId}.docx`;
    link.click();
  };

  const handleTenderAnalysis = async () => {
    if (!documentId) {
      fileInputRef.current?.click();
      return;
    }
    setAnalysisReadOnly(true);
    setActiveTab('agent');
    await startTenderAnalysis(documentId, true);
  };

  return (
    <header className="px-4 pt-4">
      <div className="rounded-[22px] border border-zinc-200 bg-white/95 px-4 py-3 shadow-[0_8px_24px_rgba(24,24,27,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                DocPilot
              </p>
              <h1 className="mt-1 truncate text-lg font-semibold tracking-[-0.02em] text-zinc-950">
                文档工作台
              </h1>
            </div>

            {documentId && (
              <div
                className="inline-flex min-w-0 max-w-[340px] items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600"
                title={documentName}
              >
                <span className="truncate font-medium text-zinc-950">{documentName}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx"
              className="hidden"
              onChange={handleUpload}
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={TOOLBAR_BUTTON}
                onClick={() => fileInputRef.current?.click()}
                disabled={busyAction !== 'idle'}
              >
                {busyAction === 'upload' ? '正在上传...' : '上传 docx'}
              </button>

              <button
                type="button"
                className={TOOLBAR_PRIMARY_BUTTON}
                onClick={handleCreate}
                disabled={busyAction !== 'idle'}
              >
                {busyAction === 'create' ? '正在创建...' : '新建文档'}
              </button>

              <button
                type="button"
                className={TOOLBAR_BUTTON}
                onClick={handleDownload}
                disabled={!documentId}
              >
                下载
              </button>

              <button
                type="button"
                className={`${TOOLBAR_BUTTON} border-zinc-300 bg-zinc-100 text-zinc-950 hover:border-zinc-400 hover:bg-zinc-200`}
                onClick={() => void handleTenderAnalysis()}
                disabled={busyAction !== 'idle'}
              >
                招标分析
              </button>
            </div>

            {analysisReadOnly ? (
              <div className="inline-flex w-fit rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-600">
                招标分析只读查看
              </div>
            ) : (
              <div className="inline-flex w-fit rounded-full border border-zinc-200 bg-zinc-50 p-1">
                <button
                  type="button"
                  className={`${TOOLBAR_SEGMENT} ${
                    suggestMode ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-950'
                  }`}
                  onClick={() => setSuggestMode(true)}
                >
                  建议模式
                </button>
                <button
                  type="button"
                  className={`${TOOLBAR_SEGMENT} ${
                    !suggestMode ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-950'
                  }`}
                  onClick={() => setSuggestMode(false)}
                >
                  直接编辑
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
