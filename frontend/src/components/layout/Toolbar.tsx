import { useRef, useState } from 'react';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import { useChatStore } from '../../hooks/useChatStore';
import { uploadDocument, createDocument, getDownloadUrl } from '../../services/api';

const TOOLBAR_BUTTON =
  'inline-flex cursor-pointer items-center justify-center rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-medium text-white transition duration-200 hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-50';

export function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busyAction, setBusyAction] = useState<'idle' | 'upload' | 'create'>('idle');
  const { documentId, documentName, suggestMode, setDocument, setSuggestMode, clearDocument } =
    useDocumentStore();
  const clearMessages = useChatStore((s) => s.clearMessages);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setBusyAction('upload');
      const result = await uploadDocument(file);
      clearMessages();
      clearDocument();
      setDocument(result.document_id, result.name);
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
      setDocument(result.document_id, result.name);
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

  return (
    <header className="px-4 pb-2 pt-4">
      <div className="relative overflow-hidden rounded-[26px] border border-black/10 bg-zinc-950 text-white shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_28%)]" />

        <div className="relative flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-400">
                DocPilot
              </p>
              <h1 className="mt-1 font-['Newsreader',serif] text-3xl leading-none tracking-[-0.04em]">
                简洁文档工作台
              </h1>
            </div>

            {documentId && (
              <div className="inline-flex min-w-0 max-w-[320px] items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 py-2 text-sm text-zinc-300">
                <span className="truncate font-medium text-white">{documentName}</span>
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
                className={TOOLBAR_BUTTON}
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
            </div>

            <div className="inline-flex w-fit rounded-full border border-white/12 bg-white/6 p-1">
              <button
                type="button"
                className={`cursor-pointer rounded-full px-4 py-2 text-sm transition ${
                  suggestMode ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-300 hover:text-white'
                }`}
                onClick={() => setSuggestMode(true)}
              >
                建议模式
              </button>
              <button
                type="button"
                className={`cursor-pointer rounded-full px-4 py-2 text-sm transition ${
                  !suggestMode ? 'bg-amber-400 text-zinc-950 shadow-sm' : 'text-zinc-300 hover:text-white'
                }`}
                onClick={() => setSuggestMode(false)}
              >
                直接编辑
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
