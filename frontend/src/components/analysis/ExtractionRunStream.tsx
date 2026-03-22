import { startTenderAnalysis } from '../../services/api';
import { useAnalysisStore } from '../../hooks/useAnalysisStore';
import { ExtractionRunCard } from './ExtractionRunCard';

interface ExtractionRunStreamProps {
  documentId: string | null;
}

export function ExtractionRunStream({ documentId }: ExtractionRunStreamProps) {
  const activeRunId = useAnalysisStore((state) => state.activeRunId);
  const runsById = useAnalysisStore((state) => state.runsById);
  const setActiveTab = useAnalysisStore((state) => state.setActiveTab);

  if (!documentId || !activeRunId) return null;

  const run = runsById[activeRunId];
  if (!run) return null;

  return (
    <div className="mb-4">
      <ExtractionRunCard
        run={run}
        onRetry={() => {
          void startTenderAnalysis(documentId, true);
        }}
        onOpenCockpit={() => setActiveTab('cockpit')}
      />
    </div>
  );
}
