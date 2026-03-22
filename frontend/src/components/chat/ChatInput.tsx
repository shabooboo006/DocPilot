import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../hooks/useChatStore';
import { deleteChatAsset, uploadChatAsset } from '../../services/api';
import type { ChatAttachment } from '../../types';

interface ChatInputProps {
  documentId: string;
  onSend: (message: string, attachments?: ChatAttachment[]) => void;
  analysisReadOnly?: boolean;
}

export function ChatInput({ documentId, onSend, analysisReadOnly = false }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const isAIThinking = useChatStore((state) => state.isAIThinking);
  const planModeEnabled = useChatStore((state) => state.planModeEnabled);
  const setPlanModeEnabled = useChatStore((state) => state.setPlanModeEnabled);
  const addMessage = useChatStore((state) => state.addMessage);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<ChatAttachment[]>([]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    if (analysisReadOnly) {
      setPlanModeEnabled(false);
    }
  }, [analysisReadOnly, setPlanModeEnabled]);

  useEffect(() => {
    return () => {
      for (const attachment of attachmentsRef.current) {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      }
    };
  }, []);

  const handleSend = () => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || isAIThinking || isUploading) return;
    onSend(trimmed, attachments);
    setValue('');
    setAttachments([]);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (analysisReadOnly) return;

    const files = Array.from(event.clipboardData.files || []).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    await attachFiles(files);
  };

  const handleRemoveAttachment = async (attachment: ChatAttachment) => {
    setAttachments((current) => current.filter((item) => item.asset_id !== attachment.asset_id));
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }

    try {
      await deleteChatAsset(documentId, attachment.asset_id);
    } catch {
      // Ignore best-effort cleanup failures for unsent attachments.
    }
  };

  const attachFiles = async (files: File[]) => {
    if (analysisReadOnly) return;

    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of imageFiles) {
        const previewUrl = URL.createObjectURL(file);
        try {
          const asset = await uploadChatAsset(documentId, file);
          setAttachments((current) => [
            ...current,
            {
              asset_id: asset.asset_id,
              filename: asset.filename,
              mime_type: asset.mime_type,
              width: asset.width,
              height: asset.height,
              previewUrl,
            },
          ]);
        } catch (error) {
          URL.revokeObjectURL(previewUrl);
          addMessage({
            role: 'system',
            error: error instanceof Error ? error.message : '图片上传失败',
          });
        }
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="border-t border-zinc-200 bg-white px-4 py-4">
      {attachments.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3">
          {attachments.map((attachment) => (
            <div key={attachment.asset_id} className="relative w-24">
              {attachment.previewUrl ? (
                <img
                  src={attachment.previewUrl}
                  alt={attachment.filename}
                  className="h-24 w-24 rounded-2xl border border-zinc-200 object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  图片
                </div>
              )}
              <button
                type="button"
                className="absolute right-1 top-1 rounded-full bg-zinc-950/85 px-1.5 py-0.5 text-[10px] text-white transition-colors duration-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
                onClick={() => void handleRemoveAttachment(attachment)}
                disabled={isAIThinking || isUploading}
                title={`删除 ${attachment.filename}`}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="chat-input" className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            输入消息
          </label>
          <span className="text-xs text-zinc-500">
            {analysisReadOnly ? '当前文档处于招标分析只读模式。' : '支持粘贴截图或上传图片。'}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <textarea
            id="chat-input"
            ref={inputRef}
            aria-label="输入消息"
            className="min-h-[112px] w-full resize-none rounded-[20px] border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-800 outline-none transition-colors duration-200 focus-visible:border-zinc-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-zinc-200"
            placeholder={
              isAIThinking
                ? 'AI 正在处理当前文档...'
                : analysisReadOnly
                  ? '可继续提问：解释条款、总结要点、或点击右侧证据回看原文。'
                  : '例如：把这张图插到方法部分最后，并自动加标题。'
            }
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={(event) => void handlePaste(event)}
            disabled={isAIThinking}
            title="在这里输入消息，回车发送，Shift+Enter 换行"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                void attachFiles(files);
                event.target.value = '';
              }}
            />
            {!analysisReadOnly && (
              <button
                type="button"
                className="cursor-pointer rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-600 transition-colors duration-200 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAIThinking || isUploading}
                title="上传图片"
              >
                {isUploading ? '上传中...' : '上传图片'}
              </button>
            )}
            <label className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-600">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-zinc-950"
                checked={planModeEnabled}
                onChange={(event) => setPlanModeEnabled(event.target.checked)}
                disabled={isAIThinking || analysisReadOnly}
                title="切换 Plan Mode"
              />
              <span>Plan Mode</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            className="inline-flex min-w-[96px] items-center justify-center rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-300"
            onClick={handleSend}
            disabled={(!value.trim() && attachments.length === 0) || isAIThinking || isUploading}
            title="发送消息"
          >
            {isUploading ? '上传中' : isAIThinking ? '处理中' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}
