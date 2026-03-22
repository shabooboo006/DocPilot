import type { AnalysisStepEvent } from '../../types';

interface ExtractionStepEventListProps {
  events: AnalysisStepEvent[];
}

export function ExtractionStepEventList({ events }: ExtractionStepEventListProps) {
  if (events.length === 0) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-zinc-200 pt-3">
      {events.map((event) => (
        <div key={event.id} className="flex items-start gap-3 text-sm leading-6 text-zinc-600">
          <span className="mt-2 h-2 w-2 rounded-full bg-zinc-400" />
          <div className="min-w-0">
            <p>{event.message}</p>
            <p className="text-xs text-zinc-400">{new Date(event.timestamp).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
