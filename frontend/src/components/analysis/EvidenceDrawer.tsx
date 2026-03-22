import type { TenderEvidence } from '../../types';

interface EvidenceDrawerProps {
  open: boolean;
  title: string;
  fieldPath?: string;
  evidence: TenderEvidence[];
  onLocateEvidence?: (title: string, evidence: TenderEvidence) => void;
  onClose: () => void;
}

export function EvidenceDrawer({ open, title, fieldPath, evidence, onLocateEvidence, onClose }: EvidenceDrawerProps) {
  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex justify-end">
      <aside className="pointer-events-auto h-full w-full max-w-[420px] overflow-y-auto border-l border-zinc-200 bg-white px-5 py-5 shadow-[-20px_0_50px_rgba(15,23,42,0.12)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Evidence</p>
            <h3 className="mt-1 text-3xl font-semibold leading-none tracking-[-0.03em] text-zinc-950">
              {title}
            </h3>
            {fieldPath && <p className="mt-2 text-xs text-zinc-500">{fieldPath}</p>}
          </div>
          <button
            type="button"
            className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {evidence.length === 0 && (
            <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4 text-sm leading-6 text-zinc-500">
              当前字段还没有可展示的原文证据。
            </div>
          )}
          {evidence.map((item, index) => (
            <button
              key={`${fieldPath || title}-${index}`}
              type="button"
              className="block w-full rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-left transition-colors duration-200 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
              onClick={() => onLocateEvidence?.(title, item)}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  证据 {index + 1}
                </p>
                <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  点击跳转原文
                </span>
              </div>
              <p className="mt-3 text-sm leading-7 text-zinc-700">
                {item.source_excerpt || item.excerpt || item.matched_text || '未提供摘录'}
              </p>
              <div className="mt-3 space-y-1 text-xs text-zinc-500">
                {item.source_section_path || item.source_path ? (
                  <p>章节：{item.source_section_path || item.source_path}</p>
                ) : null}
                {item.table_cell_reference && <p>表格定位：{item.table_cell_reference}</p>}
                {typeof item.confidence === 'number' && <p>置信度：{item.confidence.toFixed(2)}</p>}
              </div>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
