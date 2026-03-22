import { useMemo, useState } from 'react';
import { useTamboComponentState } from '@tambo-ai/react';
import type { RiskItem } from './cockpit-models';

interface RiskRegisterBoardProps {
  stateKey?: string;
  items: RiskItem[];
  onSaveItems?: (items: RiskItem[]) => void;
  onOpenEvidence?: (title: string, evidence: RiskItem['evidence']) => void;
}

export function RiskRegisterBoard({
  stateKey = 'risks',
  items,
  onSaveItems,
  onOpenEvidence,
}: RiskRegisterBoardProps) {
  const [severityFilter, setSeverityFilter] = useTamboComponentState<string>(`${stateKey}.severityFilter`, 'all');
  const [edits, setEdits] = useState<Record<string, Partial<RiskItem>>>({});
  const draftItems = useMemo(
    () => items.map((item) => ({ ...item, ...(edits[item.id] || {}) })),
    [edits, items],
  );

  const severities = useMemo(
    () => ['all', ...Array.from(new Set(items.map((item) => item.severity || 'medium')))],
    [items],
  );

  const visibleItems = useMemo(() => {
    if (severityFilter === 'all') return draftItems;
    return draftItems.filter((item) => item.severity === severityFilter);
  }, [draftItems, severityFilter]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Risk Register</p>
          <h3 className="mt-1 text-2xl font-semibold leading-none tracking-[-0.03em] text-zinc-950">
            风险与冲突
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {severities.map((severity) => (
            <button
              key={severity}
              type="button"
              className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 ${
                severityFilter === severity
                  ? 'bg-zinc-950 text-white'
                  : 'border border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950'
              }`}
              onClick={() => setSeverityFilter(severity)}
            >
              {severity}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {visibleItems.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
            当前没有对应严重度的风险项。
          </div>
        )}
        {visibleItems.map((item) => (
          <article key={item.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-zinc-950">{item.title}</p>
                <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase text-zinc-500">
                  {item.severity}
                </span>
              </div>
              <select
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 outline-none transition-colors duration-200 focus-visible:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-200"
                value={item.status}
                onChange={(event) =>
                  setEdits((current) => ({
                    ...current,
                    [item.id]: { ...(current[item.id] || {}), status: event.target.value },
                  }))
                }
              >
                <option value="open">open</option>
                <option value="watching">watching</option>
                <option value="resolved">resolved</option>
              </select>
            </div>
            {item.summary && <p className="mt-3 text-sm leading-7 text-zinc-600">{item.summary}</p>}
            {item.recommendation && (
              <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm leading-6 text-zinc-600">
                建议：{item.recommendation}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="cursor-pointer rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:opacity-40"
                disabled={item.evidence.length === 0}
                onClick={() => onOpenEvidence?.(item.title, item.evidence)}
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
            className="cursor-pointer rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
            onClick={() => onSaveItems?.(draftItems)}
          >
            保存风险状态
          </button>
        </div>
      )}
    </section>
  );
}
