interface RunFailureActionsProps {
  disabled?: boolean;
  onRetry: () => void;
}

export function RunFailureActions({ disabled, onRetry }: RunFailureActionsProps) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
        onClick={onRetry}
        disabled={disabled}
      >
        重试此步
      </button>
      <span className="rounded-full border border-black/10 bg-stone-50 px-3 py-2 text-xs text-zinc-500">
        会沿用当前文档和最近一次运行上下文继续提取。
      </span>
    </div>
  );
}
