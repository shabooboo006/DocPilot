import { useMemo, useState } from 'react';
import { useTamboComponentState } from '@tambo-ai/react';
import type { EvaluationRow } from './cockpit-models';

interface EvaluationMatrixProps {
  stateKey?: string;
  rows: EvaluationRow[];
  onSaveRows?: (rows: EvaluationRow[]) => void;
}

export function EvaluationMatrix({ stateKey = 'evaluation', rows, onSaveRows }: EvaluationMatrixProps) {
  const [denseMode, setDenseMode] = useTamboComponentState<boolean>(`${stateKey}.denseMode`, false);
  const [edits, setEdits] = useState<Record<string, Partial<EvaluationRow>>>({});
  const draftRows = useMemo(
    () => rows.map((row) => ({ ...row, ...(edits[row.id] || {}) })),
    [edits, rows],
  );

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Evaluation Matrix</p>
          <h3 className="mt-1 text-2xl font-semibold leading-none tracking-[-0.03em] text-zinc-950">
            评分矩阵
          </h3>
        </div>
        <button
          type="button"
          className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 ${
            denseMode ? 'bg-zinc-950 text-white' : 'border border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950'
          }`}
          onClick={() => setDenseMode((current) => !current)}
        >
          {denseMode ? '紧凑视图' : '标准视图'}
        </button>
      </div>

      {draftRows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
          当前没有提取到评分细则。
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-zinc-700">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                <th className="pb-3 pr-4">评分项</th>
                <th className="pb-3 pr-4">说明</th>
                <th className="pb-3 pr-4">权重</th>
                <th className="pb-3 pr-4">状态</th>
              </tr>
            </thead>
            <tbody>
              {draftRows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-200 align-top">
                  <td className={`py-3 pr-4 ${denseMode ? 'max-w-[220px]' : 'max-w-[280px]'}`}>
                    <input
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 outline-none transition-colors duration-200 focus-visible:border-zinc-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-zinc-200"
                      value={row.title}
                      onChange={(event) =>
                        setEdits((current) => ({
                          ...current,
                          [row.id]: { ...(current[row.id] || {}), title: event.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <textarea
                      className="min-h-[72px] w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 outline-none transition-colors duration-200 focus-visible:border-zinc-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-zinc-200"
                      value={row.description}
                      onChange={(event) =>
                        setEdits((current) => ({
                          ...current,
                          [row.id]: { ...(current[row.id] || {}), description: event.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <input
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 outline-none transition-colors duration-200 focus-visible:border-zinc-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-zinc-200"
                      value={row.weight}
                      onChange={(event) =>
                        setEdits((current) => ({
                          ...current,
                          [row.id]: { ...(current[row.id] || {}), weight: event.target.value },
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
                      <option value="open">open</option>
                      <option value="confirmed">confirmed</option>
                      <option value="user_edited">user_edited</option>
                      <option value="missing">missing</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draftRows.length > 0 && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="cursor-pointer rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
            onClick={() => onSaveRows?.(draftRows)}
          >
            保存评分矩阵
          </button>
        </div>
      )}
    </section>
  );
}
