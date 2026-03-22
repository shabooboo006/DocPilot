import { useMemo, useState } from 'react';
import { useTamboComponentState } from '@tambo-ai/react';
import type { OpenQuestionItem } from './cockpit-models';

interface OpenQuestionsPanelProps {
  stateKey?: string;
  items: OpenQuestionItem[];
  onSaveItems?: (items: OpenQuestionItem[]) => void;
  onOpenEvidence?: (title: string, evidence: OpenQuestionItem['evidence']) => void;
}

export function OpenQuestionsPanel({
  stateKey = 'open-questions',
  items,
  onSaveItems,
  onOpenEvidence,
}: OpenQuestionsPanelProps) {
  const [showResolved, setShowResolved] = useTamboComponentState<boolean>(`${stateKey}.showResolved`, true);
  const [edits, setEdits] = useState<Record<string, Partial<OpenQuestionItem>>>({});
  const draftItems = useMemo(
    () => items.map((item) => ({ ...item, ...(edits[item.id] || {}) })),
    [edits, items],
  );

  const visibleItems = showResolved ? draftItems : draftItems.filter((item) => item.status !== 'resolved');

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Open Questions</p>
          <h3 className="mt-1 text-3xl font-semibold leading-none tracking-[-0.03em] text-zinc-950">
            待确认问题
          </h3>
        </div>
        <button
          type="button"
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
            showResolved
              ? 'bg-zinc-950 text-white'
              : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
          }`}
          onClick={() => setShowResolved((current) => !current)}
        >
          {showResolved ? '显示已解决' : '隐藏已解决'}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {visibleItems.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
            当前没有待确认问题。
          </div>
        )}
        {visibleItems.map((item) => (
          <article key={item.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-950">{item.question}</p>
                {item.reason && <p className="mt-2 text-sm leading-6 text-zinc-600">{item.reason}</p>}
              </div>
              <select
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 outline-none transition-colors duration-200 focus:border-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-950/10"
                value={item.status}
                onChange={(event) =>
                  setEdits((current) => ({
                    ...current,
                    [item.id]: { ...(current[item.id] || {}), status: event.target.value },
                  }))
                }
              >
                <option value="open">open</option>
                <option value="reviewing">reviewing</option>
                <option value="resolved">resolved</option>
              </select>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20 disabled:opacity-40"
                disabled={item.evidence.length === 0}
                onClick={() => onOpenEvidence?.(item.question, item.evidence)}
              >
                查看证据
              </button>
            </div>
          </article>
        ))}
      </div>

      {draftItems.length > 0 && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
            onClick={() => onSaveItems?.(draftItems)}
          >
            保存问题状态
          </button>
        </div>
      )}
    </section>
  );
}
