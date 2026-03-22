import type { AnalysisStep } from '../../types';
import { ExtractionStepEventList } from './ExtractionStepEventList';
import { RunFailureActions } from './RunFailureActions';

interface ExtractionStepCardProps {
  step: AnalysisStep;
  onRetry: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'border-zinc-200 bg-zinc-100 text-zinc-500',
  running: 'border-zinc-200 bg-zinc-100 text-zinc-700',
  streaming: 'border-sky-200 bg-sky-50 text-sky-800',
  succeeded: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
  blocked: 'border-rose-200 bg-rose-50 text-rose-700',
};

export function ExtractionStepCard({ step, onRetry }: ExtractionStepCardProps) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {step.stage}
          </p>
          <h4 className="mt-1 text-sm font-semibold text-zinc-950">{step.title}</h4>
          <p className="mt-1 text-sm leading-6 text-zinc-600">{step.description}</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
            STATUS_STYLES[step.status] || STATUS_STYLES.pending
          }`}
        >
          {step.status}
        </span>
      </div>

      {(step.startedAt || step.updatedAt) && (
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-400">
          {step.startedAt && <span>开始：{new Date(step.startedAt).toLocaleString()}</span>}
          {step.updatedAt && <span>更新：{new Date(step.updatedAt).toLocaleString()}</span>}
        </div>
      )}

      {step.previewPayload && (
        <pre className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs leading-6 text-zinc-600">
          {JSON.stringify(step.previewPayload, null, 2)}
        </pre>
      )}

      <ExtractionStepEventList events={step.events} />

      {step.error && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm leading-6 text-rose-700">
          {step.error}
        </div>
      )}

      {(step.status === 'failed' || step.status === 'blocked') && (
        <RunFailureActions onRetry={onRetry} />
      )}
    </article>
  );
}
