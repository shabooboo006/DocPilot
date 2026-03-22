import { useMemo, useState } from 'react';
import { useTamboComponentState } from '@tambo-ai/react';
import type { ChecklistItem } from './cockpit-models';

interface TenderChecklistBoardProps {
  stateKey: string;
  title: string;
  subtitle: string;
  items: ChecklistItem[];
  onSaveItems?: (items: ChecklistItem[]) => void;
  onOpenEvidence?: (title: string, evidence: ChecklistItem['evidence']) => void;
}

export function TenderChecklistBoard({
  stateKey,
  title,
  subtitle,
  items,
  onSaveItems,
  onOpenEvidence,
}: TenderChecklistBoardProps) {
  const [activeCategory, setActiveCategory] = useTamboComponentState<string>(`${stateKey}.activeCategory`, '全部');
  const [edits, setEdits] = useState<Record<string, Partial<ChecklistItem>>>({});
  const draftItems = useMemo(
    () => items.map((item) => ({ ...item, ...(edits[item.id] || {}) })),
    [edits, items],
  );

  const categories = useMemo(
    () => ['全部', ...Array.from(new Set(items.map((item) => item.category || '未分组')))],
    [items],
  );

  const visibleItems = useMemo(() => {
    if (activeCategory === '全部') return draftItems;
    return draftItems.filter((item) => item.category === activeCategory);
  }, [activeCategory, draftItems]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{subtitle}</p>
          <h3 className="mt-1 text-2xl font-semibold leading-none tracking-[-0.03em] text-zinc-950">
            {title}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 ${
                activeCategory === category
                  ? 'bg-zinc-950 text-white'
                  : 'border border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950'
              }`}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {visibleItems.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
            当前分类下暂无条目。
          </div>
        )}
        {visibleItems.map((item) => (
          <article key={item.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-zinc-950">{item.title}</h4>
                  <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase text-zinc-500">
                    {item.category}
                  </span>
                </div>
                {item.description && <p className="mt-2 text-sm leading-6 text-zinc-600">{item.description}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
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
                  <option value="confirmed">confirmed</option>
                  <option value="user_edited">user_edited</option>
                  <option value="open">open</option>
                  <option value="missing">missing</option>
                  <option value="inferred">inferred</option>
                </select>
                <button
                  type="button"
                  className="cursor-pointer rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:opacity-40"
                  disabled={item.evidence.length === 0}
                  onClick={() => onOpenEvidence?.(item.title, item.evidence)}
                >
                  查看证据
                </button>
              </div>
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
            保存清单
          </button>
        </div>
      )}
    </section>
  );
}
