import { useEffect, useState } from 'react';
import type { Message } from '../../types';

interface MessageBubbleProps {
  message: Message;
  onPlanDecision?: (decision: 'yes' | 'no') => void;
  onPlanFeedback?: (content: string) => void;
}

export function MessageBubble({ message, onPlanDecision, onPlanFeedback }: MessageBubbleProps) {
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (message.agentPlan?.status !== 'collecting_feedback') {
      setFeedback('');
    }
  }, [message.agentPlan?.status]);

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

  if (message.agentPlan) {
    const plan = message.agentPlan;
    return (
      <div className="flex justify-start">
        <section className="max-w-[94%] rounded-[22px] border border-amber-200 bg-amber-50/80 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">Plan</p>
              <h3 className="mt-1 text-sm font-semibold text-zinc-950">{plan.title}</h3>
            </div>
            <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
              {plan.status}
            </span>
          </div>
          {plan.summary && <p className="mt-2 text-sm leading-6 text-zinc-700">{plan.summary}</p>}
          {plan.content && (
            <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-white/80 px-3 py-3 text-sm leading-6 text-zinc-800">
              {plan.content}
            </pre>
          )}
          {plan.status === 'awaiting_decision' && onPlanDecision && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
                onClick={() => onPlanDecision('yes')}
              >
                是：实施此计划
              </button>
              <button
                type="button"
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-amber-200 hover:bg-amber-100"
                onClick={() => onPlanDecision('no')}
              >
                否：继续补充信息
              </button>
            </div>
          )}
          {plan.status === 'collecting_feedback' && onPlanFeedback && (
            <div className="mt-3 space-y-2">
              <textarea
                className="min-h-[88px] w-full resize-none rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm leading-6 text-zinc-800 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                placeholder="补充范围、目标章节、保留内容、格式要求或风险约束。"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
              />
              <button
                type="button"
                className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                onClick={() => {
                  onPlanFeedback(feedback.trim());
                  setFeedback('');
                }}
                disabled={!feedback.trim()}
              >
                更新计划
              </button>
            </div>
          )}
        </section>
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
