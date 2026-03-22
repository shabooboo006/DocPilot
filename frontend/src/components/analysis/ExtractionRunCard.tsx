import type { AnalysisRun } from '../../types';
import { RunProgressHeader } from './RunProgressHeader';
import { ExtractionStepCard } from './ExtractionStepCard';

interface ExtractionRunCardProps {
  run: AnalysisRun;
  onRetry: () => void;
  onOpenCockpit: () => void;
}

export function ExtractionRunCard({ run, onRetry, onOpenCockpit }: ExtractionRunCardProps) {
  return (
    <section className="space-y-4">
      <RunProgressHeader run={run} />
      {run.steps.map((step) => (
        <ExtractionStepCard key={step.id} step={step} onRetry={onRetry} />
      ))}
      {run.status === 'succeeded' && (
        <div className="flex justify-start">
          <button
            type="button"
            className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
            onClick={onOpenCockpit}
          >
            查看招标驾驶舱
          </button>
        </div>
      )}
    </section>
  );
}
