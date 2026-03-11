import { useState, useRef, useCallback } from 'react';

interface MainLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
}

export function MainLayout({ left, right }: MainLayoutProps) {
  const [splitPercent, setSplitPercent] = useState(72);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const onMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (event: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const nextPercent = ((event.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(Math.max(nextPercent, 46), 78));
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 gap-3 overflow-hidden px-4 pb-3 pt-1 xl:gap-4"
    >
      <div style={{ width: `${splitPercent}%` }} className="flex min-w-0 flex-col overflow-hidden">
        {left}
      </div>

      <div
        className="group relative hidden w-4 flex-shrink-0 items-center justify-center xl:flex"
        onMouseDown={onMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整左右面板宽度"
      >
        <div className="h-full w-px rounded-full bg-black/8 transition-colors duration-200 group-hover:bg-amber-400" />
        <div className="absolute inset-y-1/2 flex h-12 w-4 -translate-y-1/2 items-center justify-center rounded-full border border-black/8 bg-white/92 text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-400 shadow-sm backdrop-blur-md transition duration-200 group-hover:border-amber-200 group-hover:text-amber-600">
          ••
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {right}
      </div>
    </div>
  );
}
