import { useState, useRef, useCallback, useEffect } from 'react';
import type { KeyboardEvent } from 'react';

interface MainLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
}

export function MainLayout({ left, right }: MainLayoutProps) {
  const [splitPercent, setSplitPercent] = useState(72);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1280px)').matches : true,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)');
    const handleChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);

    media.addEventListener('change', handleChange);

    return () => media.removeEventListener('change', handleChange);
  }, []);

  const clampSplit = useCallback((value: number) => Math.min(Math.max(value, 46), 78), []);

  const updateSplit = useCallback(
    (nextValue: number | ((current: number) => number)) => {
      setSplitPercent((current) => {
        const resolved = typeof nextValue === 'function' ? nextValue(current) : nextValue;
        return clampSplit(resolved);
      });
    },
    [clampSplit],
  );

  const onMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (event: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const nextPercent = ((event.clientX - rect.left) / rect.width) * 100;
      updateSplit(nextPercent);
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
  }, [updateSplit]);

  const onSeparatorKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!isDesktop) return;

      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          event.preventDefault();
          updateSplit((current) => current - 2);
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          event.preventDefault();
          updateSplit((current) => current + 2);
          break;
        case 'Home':
          event.preventDefault();
          updateSplit(46);
          break;
        case 'End':
          event.preventDefault();
          updateSplit(78);
          break;
        case 'PageDown':
          event.preventDefault();
          updateSplit((current) => current - 8);
          break;
        case 'PageUp':
          event.preventDefault();
          updateSplit((current) => current + 8);
          break;
        default:
          break;
      }
    },
    [isDesktop, updateSplit],
  );

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 pb-3 pt-1 xl:flex-row xl:gap-4"
    >
      <div
        id="editor-pane"
        style={isDesktop ? { width: `${splitPercent}%` } : undefined}
        className="flex min-w-0 flex-col overflow-hidden xl:flex-none"
      >
        {left}
      </div>

      <div
        className="group relative hidden w-4 flex-shrink-0 items-stretch justify-center outline-none xl:flex focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        onMouseDown={onMouseDown}
        tabIndex={0}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整左右面板宽度"
        aria-valuemin={46}
        aria-valuemax={78}
        aria-valuenow={Math.round(splitPercent)}
        aria-controls="editor-pane chat-pane"
        onKeyDown={onSeparatorKeyDown}
      >
        <div className="h-full w-px rounded-full bg-zinc-200 transition-colors duration-200 group-hover:bg-zinc-400 group-focus-visible:bg-zinc-500" />
        <div className="absolute inset-y-1/2 flex h-10 w-4 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-400 shadow-sm transition duration-200 group-hover:border-zinc-300 group-hover:text-zinc-700 group-focus-visible:border-zinc-400 group-focus-visible:text-zinc-700">
          ::
        </div>
      </div>

      <div id="chat-pane" className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {right}
      </div>
    </div>
  );
}
