import type { AnalysisRun } from '../../types';

interface RunProgressHeaderProps {
  run: AnalysisRun;
}

export function RunProgressHeader({ run }: RunProgressHeaderProps) {
  const totalSteps = Math.max(run.steps.length, 6);
  const progress = Math.min(100, Math.round((run.completedStepCount / totalSteps) * 100));
  const statusTone: Record<AnalysisRun['status'], string> = {
    idle: 'border-zinc-200 bg-zinc-100 text-zinc-700',
    queued: 'border-zinc-200 bg-zinc-100 text-zinc-700',
    running: 'border-zinc-200 bg-zinc-100 text-zinc-700',
    succeeded: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    failed: 'border-rose-200 bg-rose-50 text-rose-700',
    blocked: 'border-rose-200 bg-rose-50 text-rose-700',
    ready: 'border-zinc-200 bg-zinc-100 text-zinc-700',
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Tender Run</p>
          <h3 className="mt-1 text-2xl font-semibold leading-none tracking-[-0.03em] text-zinc-950">
            招标提取任务
          </h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">{run.summary}</p>
        </div>

        <span className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusTone[run.status]}`}>
          {run.status}
        </span>
      </div>

      <div className="mt-4 h-2 rounded-full bg-zinc-100">
        <div className="h-full rounded-full bg-zinc-950 transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric label="当前阶段" value={run.currentStage || '已完成'} />
        <Metric label="已完成" value={`${run.completedStepCount}/${totalSteps}`} />
        <Metric label="风险数" value={String(run.riskCount)} />
        <Metric label="已确认字段" value={String(run.confirmedFieldCount)} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-zinc-950">{value}</p>
    </div>
  );
}
