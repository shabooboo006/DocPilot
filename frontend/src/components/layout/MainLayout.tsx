import { useState, useRef, useCallback } from 'react';

interface MainLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
}

export function MainLayout({ left, right }: MainLayoutProps) {
  const [splitPercent, setSplitPercent] = useState(65);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const onMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(Math.max(pct, 25), 80));
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
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      <div style={{ width: `${splitPercent}%` }} className="flex overflow-hidden">
        {left}
      </div>
      <div
        className="w-1 flex-shrink-0 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors"
        onMouseDown={onMouseDown}
      />
      <div className="flex flex-1 min-w-0 overflow-hidden">
        {right}
      </div>
    </div>
  );
}
