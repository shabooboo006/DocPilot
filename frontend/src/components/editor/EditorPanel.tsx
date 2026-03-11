import { useSuperdoc } from './useSuperdoc';
import { useDocumentStore } from '../../hooks/useDocumentStore';

export function EditorPanel() {
  const documentId = useDocumentStore((s) => s.documentId);
  const { containerRef } = useSuperdoc(documentId);

  if (!documentId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400">
          <p className="text-lg mb-2">欢迎使用 DocPilot</p>
          <p className="text-sm">上传或新建一个文档开始编辑</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-white">
      <div ref={containerRef} className="h-full min-h-full" />
    </div>
  );
}
