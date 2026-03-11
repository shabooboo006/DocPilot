import type { Message } from '../../types';

interface ToolCallIndicatorProps {
  message: Message;
}

const STATUS_META = {
  executing: {
    label: '执行中',
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  success: {
    label: '已完成',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  error: {
    label: '失败',
    tone: 'border-rose-200 bg-rose-50 text-rose-700',
  },
} as const;

export function ToolCallIndicator({ message }: ToolCallIndicatorProps) {
  const toolCall = message.toolCall;
  if (!toolCall) return null;

  const current = STATUS_META[toolCall.status];
  const trackedChangesSummary = toolCall.result?.tracked_changes_summary as
    | { total?: number }
    | undefined;
  const reloadRequired = toolCall.result?.reload_required;
  const errorCode = toolCall.result?.error_code as string | undefined;
  const candidates = toolCall.result?.candidates as
    | Array<{ location_label?: string; context_before?: string; matched_text?: string; context_after?: string }>
    | undefined;
  const anchorCandidates = toolCall.result?.anchor_candidates as
    | Array<{ location_label?: string; section_path?: string; context_before?: string; context_after?: string; confidence?: number }>
    | undefined;
  const summary = buildToolSummary(toolCall.tool, toolCall.status, toolCall.result);

  return (
    <div className="flex justify-start">
      <div className="max-w-[94%] text-sm leading-6 text-zinc-800">
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${current.tone}`}>
            {current.label}
          </span>
          <span className="font-mono text-[12px] text-zinc-500">{toolCall.tool}</span>
        </div>
        {toolCall.description && <p className="mt-2 text-sm leading-6 text-zinc-900">{toolCall.description}</p>}
        {summary && <p className="mt-1 text-sm leading-6 text-zinc-700">{summary}</p>}
        {typeof trackedChangesSummary?.total === 'number' && (
          <p className="mt-1 text-sm leading-6 text-zinc-500">当前修订数：{trackedChangesSummary.total}</p>
        )}
        {errorCode && <p className="mt-1 text-sm leading-6 text-rose-600">错误类型：{errorCode}</p>}
        {Array.isArray(candidates) && candidates.length > 0 && (
          <div className="mt-2 space-y-1 text-sm leading-6 text-zinc-600">
            {candidates.slice(0, 3).map((candidate, index) => (
              <p key={`${candidate.location_label}-${index}`}>
                {index + 1}. {candidate.location_label || '未知位置'}
                {candidate.matched_text
                  ? `: ${(candidate.context_before || '')}[${candidate.matched_text}]${candidate.context_after || ''}`
                  : ''}
              </p>
            ))}
          </div>
        )}
        {Array.isArray(anchorCandidates) && anchorCandidates.length > 0 && (
          <div className="mt-2 space-y-1 text-sm leading-6 text-zinc-600">
            {anchorCandidates.slice(0, 3).map((candidate, index) => (
              <p key={`${candidate.location_label}-${index}`}>
                {index + 1}. {candidate.location_label || '未知位置'}
                {candidate.section_path ? `（${candidate.section_path}）` : ''}
                {typeof candidate.confidence === 'number' ? `，置信度 ${candidate.confidence}` : ''}
              </p>
            ))}
          </div>
        )}
        {Boolean(reloadRequired) && <p className="mt-1 text-sm leading-6 text-zinc-500">文档已刷新到最新 AI 结果。</p>}
      </div>
    </div>
  );
}

function buildToolSummary(
  tool: string,
  status: 'executing' | 'success' | 'error',
  result?: Record<string, unknown>
): string | null {
  if (!result || status === 'executing') {
    return null;
  }

  if (status === 'error') {
    if (typeof result.message === 'string') {
      return result.message;
    }
    if (typeof result.error === 'string') {
      return result.error;
    }
  }

  switch (tool) {
    case 'get_document_text': {
      const segmentCount = Number(result.segment_count ?? 0);
      const tables = Array.isArray(result.tables_summary) ? result.tables_summary.length : 0;
      return `已读取 Word 结构化上下文，共 ${segmentCount} 个片段${tables ? `，${tables} 个表格` : ''}。`;
    }
    case 'get_formatting_capabilities': {
      const operationGroups = (result.operation_groups ?? {}) as {
        paragraph?: unknown[];
        list?: unknown[];
      };
      const inlineProps = result.inline_properties && typeof result.inline_properties === 'object'
        ? Object.keys(result.inline_properties as Record<string, unknown>).length
        : 0;
      const paragraphOps = Array.isArray(operationGroups.paragraph)
        ? operationGroups.paragraph.length
        : 0;
      const listOps = Array.isArray(operationGroups.list)
        ? operationGroups.list.length
        : 0;
      return `已读取当前格式能力，支持 ${inlineProps} 个字符格式属性、${paragraphOps} 个段落格式操作、${listOps} 个列表格式操作。`;
    }
    case 'find_text_context': {
      const matchCount = Number(result.match_count ?? 0);
      const matches = result.matches as Array<{ location_label?: string }> | undefined;
      const firstLocation = matches?.[0]?.location_label;
      return matchCount > 0
        ? `已定位 ${matchCount} 处命中${firstLocation ? `，首个位置在 ${firstLocation}` : ''}。`
        : '未找到命中文本。';
    }
    case 'find_insertion_anchor': {
      const candidates = result.anchor_candidates as Array<{ location_label?: string }> | undefined;
      if (!candidates || candidates.length === 0) {
        return '未找到可插图的正文位置。';
      }
      return `已识别 ${candidates.length} 个可能的插图位置${candidates[0]?.location_label ? `，首个候选为 ${candidates[0].location_label}` : ''}。`;
    }
    case 'list_caption_conventions': {
      const count = Number(result.caption_count ?? 0);
      const prefix = typeof result.preferred_prefix === 'string' ? result.preferred_prefix : '图';
      return count > 0 ? `已读取文档中的图片标题样式，当前更接近 ${prefix} 编号格式。` : '文档中没有现成图片标题样式，将默认使用图系标题。';
    }
    case 'insert_image_at_anchor': {
      const location = typeof result.location_label === 'string' ? result.location_label : '目标位置';
      const captionAdded = Boolean(result.caption_added);
      const captionText = typeof result.caption_text === 'string' ? result.caption_text : '';
      return captionAdded
        ? `已将图片插入到 ${location}，并添加标题“${captionText}”。`
        : `已将图片插入到 ${location}。`;
    }
    case 'replace_text': {
      const replacements = Number(result.replacements ?? 0);
      const location = typeof result.location_label === 'string' ? result.location_label : null;
      if (replacements > 0) {
        return `已在 ${location || '目标片段'} 精确替换 ${replacements} 处内容。`;
      }
      return typeof result.message === 'string' ? result.message : '未发生替换。';
    }
    case 'set_document_title':
      return `已更新 ${String(result.location_label || '文档标题')}。`;
    case 'append_paragraph':
      return '已在文档末尾追加新段落。';
    case 'apply_formatting': {
      const operation = typeof result.operation === 'string' ? result.operation : '格式操作';
      const location = typeof result.location_label === 'string' ? result.location_label : '目标片段';
      const applied = Number(result.mutations_applied ?? 0);
      return applied > 0
        ? `已在 ${location} 执行 ${operation}，共处理 ${applied} 处目标。`
        : `已尝试在 ${location} 执行 ${operation}。`;
    }
    default:
      return null;
  }
}
