import { useMemo, useState } from 'react';
import { useTamboComponentState } from '@tambo-ai/react';
import type { DeadlineTodoItem, TimelineNode, TimelineViewMode } from '../../types';
import type { TimelineConflictItem } from './cockpit-models';

interface TenderTimelineBoardProps {
  stateKey?: string;
  nodes: TimelineNode[];
  conflicts: TimelineConflictItem[];
  todos: DeadlineTodoItem[];
  onConfirm?: (nodeId: string) => void;
  onCreateTodo?: (nodeId: string) => void;
  onSaveNode?: (
    nodeId: string,
    patch: {
      date?: string | null;
      time?: string | null;
      datetime_iso?: string | null;
      user_note?: string;
      status?: string;
    },
  ) => void;
  onOpenEvidence?: (title: string, fieldPath: string, evidenceCount: number) => void;
}

export function TenderTimelineBoard({
  stateKey = 'timeline',
  nodes,
  conflicts,
  todos,
  onConfirm,
  onCreateTodo,
  onSaveNode,
  onOpenEvidence,
}: TenderTimelineBoardProps) {
  const [viewMode, setViewMode] = useTamboComponentState<TimelineViewMode>(`${stateKey}.viewMode`, 'timeline');
  const [selectedLot, setSelectedLot] = useTamboComponentState<string>(`${stateKey}.selectedLot`, '全部');
  const [urgencyFilter, setUrgencyFilter] = useTamboComponentState<string>(`${stateKey}.urgencyFilter`, '全部');
  const [onlyConfirmed, setOnlyConfirmed] = useTamboComponentState<boolean>(`${stateKey}.onlyConfirmed`, false);
  const [expandedNodeId, setExpandedNodeId] = useTamboComponentState<string | null>(
    `${stateKey}.expandedNodeId`,
    null,
  );
  const [draftNodes, setDraftNodes] = useState<Record<string, { date?: string; time?: string; note?: string }>>({});

  const lotOptions = useMemo(
    () => ['全部', ...Array.from(new Set(nodes.flatMap((node) => node.lots || []).filter(Boolean)))],
    [nodes],
  );

  const urgencyOptions = useMemo(
    () => ['全部', ...Array.from(new Set(nodes.map((node) => node.urgency || 'normal')))],
    [nodes],
  );

  const filteredNodes = useMemo(() => {
    const safeSelectedLot = selectedLot || '全部';
    return [...nodes]
      .filter((node) => (safeSelectedLot === '全部' ? true : (node.lots || []).includes(safeSelectedLot)))
      .filter((node) => (urgencyFilter === '全部' ? true : (node.urgency || 'normal') === urgencyFilter))
      .filter((node) => (onlyConfirmed ? node.status === 'confirmed' : true))
      .sort((a, b) => (a.datetime_iso || '').localeCompare(b.datetime_iso || '', 'zh-CN'));
  }, [nodes, onlyConfirmed, selectedLot, urgencyFilter]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Timeline</p>
          <h3 className="mt-1 text-3xl font-semibold leading-none tracking-[-0.03em] text-zinc-950">招标时间线</h3>
        </div>
        <div className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 p-1">
          {(['timeline', 'list', 'calendar'] as TimelineViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
                viewMode === mode ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-white hover:text-zinc-950'
              }`}
              onClick={() => setViewMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 outline-none transition-colors duration-200 focus:border-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-950/10"
          value={selectedLot}
          onChange={(event) => setSelectedLot(event.target.value)}
        >
          {lotOptions.map((lot) => (
            <option key={lot} value={lot}>
              {lot}
            </option>
          ))}
        </select>
        <select
          className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 outline-none transition-colors duration-200 focus:border-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-950/10"
          value={urgencyFilter}
          onChange={(event) => setUrgencyFilter(event.target.value)}
        >
          {urgencyOptions.map((urgency) => (
            <option key={urgency} value={urgency}>
              {urgency}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`rounded-full px-3 py-2 text-xs font-medium transition-colors duration-200 ${
            onlyConfirmed ? 'bg-zinc-950 text-white' : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
          }`}
          onClick={() => setOnlyConfirmed((current) => !current)}
        >
          仅看已确认
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {filteredNodes.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
            当前筛选条件下没有时间节点。
          </div>
        )}
        {filteredNodes.map((node) => {
          const draft = {
            date: draftNodes[node.id]?.date ?? node.date ?? '',
            time: draftNodes[node.id]?.time ?? node.time ?? '',
            note: draftNodes[node.id]?.note ?? node.user_note ?? '',
          };
          const isOpen = expandedNodeId === node.id;
          return (
            <article key={node.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold text-zinc-950">{node.label}</h4>
                    <StatusChip status={node.status} />
                    {node.urgency && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                        {node.urgency}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {node.datetime_iso || [node.date, node.time].filter(Boolean).join(' ') || '时间待确认'}
                  </p>
                  {node.lots && node.lots.length > 0 && (
                    <p className="mt-1 text-xs text-zinc-500">适用标段：{node.lots.join(' / ')}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
                    onClick={() => setExpandedNodeId(isOpen ? null : node.id)}
                  >
                    {isOpen ? '收起编辑' : '修正节点'}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
                    onClick={() => onConfirm?.(node.id)}
                  >
                    确认节点
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
                    onClick={() => onCreateTodo?.(node.id)}
                  >
                    生成待办
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20 disabled:opacity-40"
                    disabled={!node.evidence?.length}
                    onClick={() => onOpenEvidence?.(node.label, `timeline.nodes.${node.id}`, node.evidence?.length || 0)}
                  >
                    查看证据
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="mt-4 grid gap-3 rounded-xl border border-zinc-200 bg-white p-3 md:grid-cols-[1fr_1fr]">
                  <input
                    type="date"
                    className="rounded-xl border border-zinc-200 px-3 py-2 text-zinc-900 outline-none transition-colors duration-200 focus:border-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-950/10"
                    value={draft.date}
                    onChange={(event) =>
                      setDraftNodes((current) => ({
                        ...current,
                        [node.id]: { ...draft, date: event.target.value },
                      }))
                    }
                  />
                  <input
                    type="time"
                    className="rounded-xl border border-zinc-200 px-3 py-2 text-zinc-900 outline-none transition-colors duration-200 focus:border-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-950/10"
                    value={draft.time}
                    onChange={(event) =>
                      setDraftNodes((current) => ({
                        ...current,
                        [node.id]: { ...draft, time: event.target.value },
                      }))
                    }
                  />
                  <textarea
                    className="min-h-[90px] rounded-xl border border-zinc-200 px-3 py-3 text-zinc-900 outline-none transition-colors duration-200 focus:border-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-950/10 md:col-span-2"
                    value={draft.note}
                    onChange={(event) =>
                      setDraftNodes((current) => ({
                        ...current,
                        [node.id]: { ...draft, note: event.target.value },
                      }))
                    }
                    placeholder="补充时区说明、节点约束或人工确认备注。"
                  />
                  <div className="md:col-span-2 flex justify-end">
                    <button
                      type="button"
                      className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
                      onClick={() =>
                        onSaveNode?.(node.id, {
                          date: draft.date || null,
                          time: draft.time || null,
                          datetime_iso: draft.date ? `${draft.date}T${draft.time || '00:00'}:00` : null,
                          user_note: draft.note,
                          status: 'user_edited',
                        })
                      }
                    >
                      保存节点
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {conflicts.length > 0 && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-500">Conflicts</p>
          <div className="mt-3 space-y-2">
            {conflicts.map((item, index) => (
              <article key={item.id || `conflict-${index}`} className="rounded-xl border border-rose-100 bg-white px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-rose-700">{item.title}</p>
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold uppercase text-rose-700">
                    {item.severity}
                  </span>
                </div>
                {item.description && <p className="mt-2 leading-6 text-rose-700/90">{item.description}</p>}
                {item.evidence.length > 0 && (
                  <div className="mt-3 rounded-xl border border-rose-100 bg-white px-3 py-3 text-xs leading-6 text-rose-600">
                    证据：{item.evidence[0].source_excerpt || item.evidence[0].matched_text || '已记录'}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      {todos.length > 0 && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-zinc-950">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Deadline Todos</p>
          <div className="mt-3 space-y-2">
            {todos.map((todo) => (
              <div key={todo.id} className="rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm">
                <p>{todo.title}</p>
                <p className="mt-1 text-xs text-zinc-500">{todo.due_datetime || '未设置截止时间'}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StatusChip({ status }: { status: string }) {
  const color =
    {
      confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      user_edited: 'border-zinc-200 bg-zinc-50 text-zinc-700',
      conflicting: 'border-rose-200 bg-rose-50 text-rose-700',
      inferred: 'border-amber-200 bg-amber-50 text-amber-700',
      missing: 'border-zinc-200 bg-zinc-100 text-zinc-500',
    }[status] || 'border-zinc-200 bg-zinc-100 text-zinc-500';

  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${color}`}>{status}</span>;
}
