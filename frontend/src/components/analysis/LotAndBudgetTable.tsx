import { useMemo, useState } from 'react';
import { useTamboComponentState } from '@tambo-ai/react';
import type { LotRow } from './cockpit-models';

interface LotAndBudgetTableProps {
  stateKey?: string;
  rows: LotRow[];
  onSaveRows?: (rows: LotRow[]) => void;
}

export function LotAndBudgetTable({ stateKey = 'lots', rows, onSaveRows }: LotAndBudgetTableProps) {
  const [sortKey, setSortKey] = useTamboComponentState<'name' | 'budget'>(`${stateKey}.sortKey`, 'name');
  const [edits, setEdits] = useState<Record<string, Partial<LotRow>>>({});
  const draftRows = useMemo(
    () => rows.map((row) => ({ ...row, ...(edits[row.id] || {}) })),
    [edits, rows],
  );

  const sortedRows = useMemo(() => {
    const safeSortKey: 'name' | 'budget' = sortKey || 'name';
    return [...draftRows].sort((left, right) =>
      (left[safeSortKey] || '').localeCompare(right[safeSortKey] || '', 'zh-CN'),
    );
  }, [draftRows, sortKey]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Lots & Budget</p>
          <h3 className="mt-1 text-2xl font-semibold leading-none tracking-[-0.03em] text-zinc-950">
            标段与预算
          </h3>
        </div>
        <div className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 p-1">
          {[
            { key: 'name', label: '按标段' },
            { key: 'budget', label: '按预算' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 ${
                sortKey === item.key ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:text-zinc-950'
              }`}
              onClick={() => setSortKey(item.key as 'name' | 'budget')}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {sortedRows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
          当前没有提取到可展示的标段或预算信息。
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-zinc-700">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                <th className="pb-3 pr-4">标段</th>
                <th className="pb-3 pr-4">预算</th>
                <th className="pb-3 pr-4">最高限价</th>
                <th className="pb-3 pr-4">保证金</th>
                <th className="pb-3 pr-4">状态</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-200 align-top">
                  <td className="py-3 pr-4">
                    <input
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 outline-none transition-colors duration-200 focus-visible:border-zinc-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-zinc-200"
                      value={row.name}
                      onChange={(event) =>
                        setEdits((current) => ({
                          ...current,
                          [row.id]: { ...(current[row.id] || {}), name: event.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <input
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 outline-none transition-colors duration-200 focus-visible:border-zinc-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-zinc-200"
                      value={row.budget}
                      onChange={(event) =>
                        setEdits((current) => ({
                          ...current,
                          [row.id]: { ...(current[row.id] || {}), budget: event.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <input
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 outline-none transition-colors duration-200 focus-visible:border-zinc-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-zinc-200"
                      value={row.maximumPrice}
                      onChange={(event) =>
                        setEdits((current) => ({
                          ...current,
                          [row.id]: { ...(current[row.id] || {}), maximumPrice: event.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <input
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 outline-none transition-colors duration-200 focus-visible:border-zinc-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-zinc-200"
                      value={row.bidBond}
                      onChange={(event) =>
                        setEdits((current) => ({
                          ...current,
                          [row.id]: { ...(current[row.id] || {}), bidBond: event.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <select
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 outline-none transition-colors duration-200 focus-visible:border-zinc-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-zinc-200"
                      value={row.status}
                      onChange={(event) =>
                        setEdits((current) => ({
                          ...current,
                          [row.id]: { ...(current[row.id] || {}), status: event.target.value },
                        }))
                      }
                    >
                      <option value="confirmed">confirmed</option>
                      <option value="user_edited">user_edited</option>
                      <option value="conflicting">conflicting</option>
                      <option value="inferred">inferred</option>
                      <option value="missing">missing</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sortedRows.length > 0 && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="cursor-pointer rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
            onClick={() => onSaveRows?.(draftRows)}
          >
            保存表格
          </button>
        </div>
      )}
    </section>
  );
}
