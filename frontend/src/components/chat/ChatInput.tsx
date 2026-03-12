import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../hooks/useChatStore';
import { deleteChatAsset, uploadChatAsset } from '../../services/api';
import type { ChatAttachment } from '../../types';

interface ChatInputProps {
  documentId: string;
  onSend: (message: string, attachments?: ChatAttachment[]) => void;
}

export function ChatInput({ documentId, onSend }: ChatInputProps) {
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
    <div className="border-t border-black/8 px-4 py-3">
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-3">
          {attachments.map((attachment) => (
            <div key={attachment.asset_id} className="relative w-24">
              {attachment.previewUrl ? (
                <img
                  src={attachment.previewUrl}
                  alt={attachment.filename}
                  className="h-24 w-24 rounded-2xl border border-black/10 object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-black/10 bg-stone-50 text-xs text-zinc-500">
                  图片
                </div>
              )}
              <button
                type="button"
                className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
                onClick={() => void handleRemoveAttachment(attachment)}
                disabled={isAIThinking || isUploading}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <textarea
            id="chat-input"
            ref={inputRef}
            className="min-h-[72px] flex-1 resize-none rounded-[20px] border border-black/10 bg-stone-50 px-4 py-3 text-sm leading-6 text-zinc-800 outline-none transition focus:border-amber-300 focus:bg-white focus:ring-4 focus:ring-amber-100"
            placeholder={isAIThinking ? 'AI 正在处理当前文档...' : '例如：把这张图插到方法部分最后，并自动加标题。'}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={(event) => void handlePaste(event)}
            disabled={isAIThinking}
          />
          <div className="flex items-center gap-2 text-xs text-zinc-500">
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
            <button
              type="button"
              className="rounded-full border border-black/10 bg-white px-3 py-1.5 transition hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
              onClick={() => fileInputRef.current?.click()}
              disabled={isAIThinking || isUploading}
            >
              {isUploading ? '上传中...' : '上传图片'}
            </button>
            <label className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-zinc-600">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-zinc-950"
                checked={planModeEnabled}
                onChange={(event) => setPlanModeEnabled(event.target.checked)}
                disabled={isAIThinking}
              />
              <span>Plan Mode</span>
            </label>
            <span>支持粘贴截图或上传图片。</span>
          </div>
        </div>

        <button
          type="button"
          className="inline-flex min-w-[88px] items-center justify-center self-end rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          onClick={handleSend}
          disabled={(!value.trim() && attachments.length === 0) || isAIThinking || isUploading}
        >
          {isUploading ? '上传中' : isAIThinking ? '处理中' : '发送'}
        </button>
      </div>
    </div>
  );
}
