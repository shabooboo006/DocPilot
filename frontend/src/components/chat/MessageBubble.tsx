import { useState } from 'react';
import type { Message } from '../../types';

interface MessageBubbleProps {
  message: Message;
  onPlanDecision?: (decision: 'yes' | 'no') => void;
  onPlanFeedback?: (content: string) => void;
}

export function MessageBubble({ message, onPlanDecision, onPlanFeedback }: MessageBubbleProps) {
  const [feedback, setFeedback] = useState('');

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <article
          className="max-w-[88%] rounded-2xl rounded-tr-sm bg-zinc-950 px-4 py-3 text-sm leading-6 text-white shadow-sm"
          aria-label="用户消息"
        >
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
        <section className="max-w-[94%] rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Plan</p>
              <h3 className="mt-1 text-sm font-semibold tracking-[-0.01em] text-zinc-950">{plan.title}</h3>
            </div>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-700">
              {plan.status}
            </span>
          </div>
          {plan.summary && <p className="mt-2 text-sm leading-6 text-zinc-700">{plan.summary}</p>}
          {plan.content && (
            <pre className="mt-3 whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm leading-6 text-zinc-800">
              {plan.content}
            </pre>
          )}
          {plan.status === 'awaiting_decision' && onPlanDecision && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="cursor-pointer rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
                onClick={() => onPlanDecision('yes')}
                title="实施此计划"
              >
                是：实施此计划
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors duration-200 hover:border-zinc-300 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
                onClick={() => onPlanDecision('no')}
                title="继续补充信息"
              >
                否：继续补充信息
              </button>
            </div>
          )}
          {plan.status === 'collecting_feedback' && onPlanFeedback && (
            <div className="mt-3 space-y-2">
              <label htmlFor="plan-feedback" className="block text-xs font-medium text-zinc-600">
                补充计划说明
              </label>
              <textarea
                id="plan-feedback"
                className="min-h-[96px] w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm leading-6 text-zinc-800 outline-none transition-colors duration-200 focus-visible:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-200"
                placeholder="补充范围、目标章节、保留内容、格式要求或风险约束。"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
              />
              <button
                type="button"
                className="cursor-pointer rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-300"
                onClick={() => {
                  onPlanFeedback(feedback.trim());
                  setFeedback('');
                }}
                disabled={!feedback.trim()}
                title="更新计划"
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
        <article className="max-w-[94%] whitespace-pre-wrap text-sm leading-7 text-zinc-800">
          {message.content}
        </article>
      </div>
    );
  }

  if (message.error) {
    return (
      <div className="flex justify-start">
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {message.error}
        </div>
      </div>
    );
  }

  return null;
}
