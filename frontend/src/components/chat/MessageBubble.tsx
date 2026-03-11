import type { Message } from '../../types';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <article className="max-w-[88%] rounded-[24px] rounded-tr-md bg-zinc-950 px-4 py-3 text-sm leading-6 text-white shadow-sm">
          {message.attachments && message.attachments.length > 0 && (
            <div className="mb-3 flex flex-wrap justify-end gap-2">
              {message.attachments.map((attachment) => (
                attachment.previewUrl ? (
                  <img
                    key={attachment.asset_id}
                    src={attachment.previewUrl}
                    alt={attachment.filename}
                    className="h-24 w-24 rounded-2xl object-cover"
                  />
                ) : (
                  <div
                    key={attachment.asset_id}
                    className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white/10 text-xs"
                  >
                    图片
                  </div>
                )
              ))}
            </div>
          )}
          {message.content}
        </article>
      </div>
    );
  }

  if (message.role === 'ai') {
    return (
      <div className="flex justify-start">
        <article className="max-w-[94%] text-sm leading-7 text-zinc-900">
          {message.content}
        </article>
      </div>
    );
  }

  if (message.error) {
    return (
      <div className="flex justify-start">
        <div role="alert" className="rounded-full bg-rose-50 px-4 py-2 text-xs text-rose-600">
          {message.error}
        </div>
      </div>
    );
  }

  return null;
}
