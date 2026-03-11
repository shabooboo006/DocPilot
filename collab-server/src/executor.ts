import { Editor } from 'superdoc/super-editor';
import type { Editor as HeadlessEditor } from 'superdoc/super-editor';

import { loadChatAsset, loadChatAssetMeta, loadDocument, saveDocument } from './storage.js';

export type DocumentMode = 'editing' | 'suggesting';

type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type OpenAIToolCall = {
  id?: string;
  type?: string;
  function: {
    name: string;
    arguments?: string;
  };
};

type TrackChangeSummaryItem = {
  id: string;
  type: string;
  author?: string;
  excerpt?: string;
  date?: string;
};

type TrackChangesSummary = {
  total: number;
  items: TrackChangeSummaryItem[];
};

type SegmentKind = 'title' | 'paragraph' | 'table_cell';
type ToolErrorCode = 'ambiguous_match' | 'insufficient_context' | 'title_not_unique';
type ParagraphNodeType = 'paragraph' | 'heading' | 'listItem';

type ParagraphInfo = {
  paragraphIndexInSegment: number;
  nodeId: string;
  nodeType: ParagraphNodeType;
  text: string;
};

type Segment = {
  segment_id: string;
  kind: SegmentKind;
  text: string;
  context_before: string;
  context_after: string;
  location_label: string;
  section_path: string;
};

type InternalSegment = Segment & {
  paragraphs: ParagraphInfo[];
  titleCandidate: boolean;
};

type AnchorCandidate = {
  anchor_id: string;
  segment_id: string;
  location_label: string;
  section_path: string;
  context_before: string;
  context_after: string;
  confidence: number;
  placement: 'before' | 'after' | 'replace_placeholder';
};

type InsertedImageResult = {
  asset_id: string;
  inserted: boolean;
  location_label: string;
  section_path: string;
  placement: 'before' | 'after' | 'replace_placeholder';
  caption_added: boolean;
  caption_text?: string;
  final_size: {
    width: number;
    height: number;
  };
};

type TableSummary = {
  table_index: number;
  row_count: number;
  column_count: number;
  cell_previews: string[];
};

type MatchCandidate = {
  match_id: string;
  segment_id: string;
  matched_text: string;
  context_before: string;
  context_after: string;
  location_label: string;
  kind: SegmentKind;
};

type MatchCandidateInternal = MatchCandidate & {
  paragraphIndexInSegment: number;
  localIndex: number;
};

type DocumentSnapshot = {
  document_id: string;
  document_type: 'word_docx';
  document_mode: DocumentMode;
  paragraph_count: number;
  segment_count: number;
  segments: Segment[];
  tables_summary: TableSummary[];
  preview: Array<{ location_label: string; text: string }>;
  internalSegments: InternalSegment[];
};

type DispatchResult = {
  result: Record<string, unknown>;
  documentMutated: boolean;
  reloadRequired: boolean;
  trackedChangesSummary?: TrackChangesSummary;
  errorCode?: ToolErrorCode;
  candidates?: MatchCandidate[];
  anchorCandidates?: AnchorCandidate[];
  selectedAnchor?: AnchorCandidate;
  assetId?: string;
  captionAdded?: boolean;
  captionText?: string;
  finalSize?: {
    width: number;
    height: number;
  };
};

class StructuredToolError extends Error {
  errorCode: ToolErrorCode;
  candidates: MatchCandidate[];

  constructor(errorCode: ToolErrorCode, message: string, candidates: MatchCandidate[] = []) {
    super(message);
    this.name = 'StructuredToolError';
    this.errorCode = errorCode;
    this.candidates = candidates;
  }
}

const AI_USER = {
  name: 'DocPilot AI',
  email: 'ai@docpilot.local',
};

const INLINE_FORMATTING_OPERATIONS = [
  'format.apply',
  'format.bCs',
  'format.bold',
  'format.border',
  'format.caps',
  'format.charScale',
  'format.color',
  'format.contextualAlternates',
  'format.cs',
  'format.dstrike',
  'format.eastAsianLayout',
  'format.em',
  'format.emboss',
  'format.fitText',
  'format.fontFamily',
  'format.fontSize',
  'format.fontSizeCs',
  'format.highlight',
  'format.iCs',
  'format.imprint',
  'format.italic',
  'format.kerning',
  'format.lang',
  'format.letterSpacing',
  'format.ligatures',
  'format.numForm',
  'format.numSpacing',
  'format.oMath',
  'format.outline',
  'format.position',
  'format.rFonts',
  'format.rStyle',
  'format.rtl',
  'format.shading',
  'format.shadow',
  'format.smallCaps',
  'format.snapToGrid',
  'format.specVanish',
  'format.strike',
  'format.stylisticSets',
  'format.underline',
  'format.vanish',
  'format.vertAlign',
  'format.webHidden',
] as const;

const PARAGRAPH_FORMATTING_OPERATIONS = [
  'styles.paragraph.setStyle',
  'styles.paragraph.clearStyle',
  'format.paragraph.resetDirectFormatting',
  'format.paragraph.setAlignment',
  'format.paragraph.clearAlignment',
  'format.paragraph.setIndentation',
  'format.paragraph.clearIndentation',
  'format.paragraph.setSpacing',
  'format.paragraph.clearSpacing',
  'format.paragraph.setKeepOptions',
  'format.paragraph.setOutlineLevel',
  'format.paragraph.setFlowOptions',
  'format.paragraph.setTabStop',
  'format.paragraph.clearTabStop',
  'format.paragraph.clearAllTabStops',
  'format.paragraph.setBorder',
  'format.paragraph.clearBorder',
  'format.paragraph.setShading',
  'format.paragraph.clearShading',
] as const;

const LIST_FORMATTING_OPERATIONS = [
  'lists.create',
  'lists.applyPreset',
  'lists.applyTemplate',
  'lists.setType',
  'lists.indent',
  'lists.outdent',
  'lists.setLevel',
  'lists.setValue',
  'lists.setLevelRestart',
  'lists.continuePrevious',
  'lists.convertToText',
  'lists.setLevelAlignment',
  'lists.setLevelIndents',
  'lists.setLevelNumbering',
  'lists.setLevelBullet',
  'lists.setLevelMarkerFont',
  'lists.clearLevelOverrides',
] as const;

const FORMATTING_OPERATION_NAMES = [
  ...INLINE_FORMATTING_OPERATIONS,
  ...PARAGRAPH_FORMATTING_OPERATIONS,
  ...LIST_FORMATTING_OPERATIONS,
] as const;

const INLINE_FORMATTING_OPERATION_SET = new Set<string>(INLINE_FORMATTING_OPERATIONS);
const PARAGRAPH_FORMATTING_OPERATION_SET = new Set<string>(PARAGRAPH_FORMATTING_OPERATIONS);
const LIST_FORMATTING_OPERATION_SET = new Set<string>(LIST_FORMATTING_OPERATIONS);

const BASE_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_document_text',
      description: 'Read a structured snapshot of the current Word .docx document before editing.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_formatting_capabilities',
      description: 'Inspect the current SuperDoc formatting capabilities for inline text, paragraphs, and lists.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_text_context',
      description: 'Locate exact text matches with surrounding Word context before editing.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The exact text to locate in the Word document.',
          },
          max_results: {
            type: 'integer',
            description: 'Maximum number of matches to return. Defaults to 5.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_document_title',
      description: 'Set the unique main title in the Word document. Only use after confirming the title segment.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'The new title text.',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_insertion_anchor',
      description: 'Find the best Word body anchor for inserting an uploaded image from a natural language request.',
      parameters: {
        type: 'object',
        properties: {
          intent: {
            type: 'string',
            description: 'Natural language instruction describing where the image should be inserted.',
          },
          hint_text: {
            type: 'string',
            description: 'Optional exact nearby text or section title to match.',
          },
          asset_id: {
            type: 'string',
            description: 'The uploaded chat image asset id.',
          },
          max_results: {
            type: 'integer',
            description: 'Maximum number of candidate anchors to return. Defaults to 5.',
          },
        },
        required: ['intent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_caption_conventions',
      description: 'Inspect existing image caption conventions in the current document.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'insert_image_at_anchor',
      description: 'Insert an uploaded image at a confirmed Word anchor and optionally add a caption below it.',
      parameters: {
        type: 'object',
        properties: {
          asset_id: {
            type: 'string',
            description: 'The uploaded chat image asset id.',
          },
          anchor_id: {
            type: 'string',
            description: 'The anchor_id returned by find_insertion_anchor.',
          },
          placement: {
            type: 'string',
            enum: ['before', 'after', 'replace_placeholder'],
            description: 'Whether to insert before or after the anchor, or replace a placeholder.',
          },
          caption_mode: {
            type: 'string',
            enum: ['auto', 'always', 'none'],
            description: 'Caption strategy. Defaults to auto.',
          },
          caption_text: {
            type: 'string',
            description: 'Optional explicit caption text.',
          },
        },
        required: ['asset_id', 'anchor_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_text',
      description: 'Replace text inside one confirmed segment only. Requires context from find_text_context first.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'The exact text to find in the confirmed segment.',
          },
          replacement: {
            type: 'string',
            description: 'The new text to write.',
          },
          segment_id: {
            type: 'string',
            description: 'The segment_id returned by get_document_text or find_text_context.',
          },
          context_before: {
            type: 'string',
            description: 'The nearby text immediately before the target returned by find_text_context.',
          },
          context_after: {
            type: 'string',
            description: 'The nearby text immediately after the target returned by find_text_context.',
          },
          replace_all: {
            type: 'boolean',
            description: 'Whether to replace every match inside the confirmed segment. Defaults to false.',
          },
        },
        required: ['target', 'replacement', 'segment_id', 'context_before', 'context_after'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'append_paragraph',
      description: 'Append a new paragraph to the end of the Word document body.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Paragraph text to append.',
          },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_formatting',
      description: 'Apply SuperDoc-supported inline, paragraph, or list formatting to one confirmed Word segment or exact text target inside it.',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: [...FORMATTING_OPERATION_NAMES],
            description: 'The exact SuperDoc formatting operation to execute.',
          },
          segment_id: {
            type: 'string',
            description: 'The confirmed segment_id returned by get_document_text or find_text_context.',
          },
          target_text: {
            type: 'string',
            description: 'Exact text inside the confirmed segment for inline formatting. Omit for paragraph/list operations or when formatting the entire segment.',
          },
          context_before: {
            type: 'string',
            description: 'Nearby text immediately before target_text returned by find_text_context.',
          },
          context_after: {
            type: 'string',
            description: 'Nearby text immediately after target_text returned by find_text_context.',
          },
          apply_to_all_matches: {
            type: 'boolean',
            description: 'For inline formatting, apply to every context-matched target_text inside the confirmed segment. Defaults to false.',
          },
          apply_to_entire_segment: {
            type: 'boolean',
            description: 'For inline formatting, apply the format to all text inside the confirmed segment instead of a specific target_text.',
          },
          args: {
            type: 'object',
            description: 'Operation-specific SuperDoc arguments, excluding target. Examples: {"inline":{"bold":true,"color":"#C00000"}}, {"alignment":"center"}, {"styleId":"Heading1"}, {"kind":"ordered"}, {"before":120,"after":120}, {"side":"bottom","style":"single","color":"FF0000","size":8}.',
            properties: {},
          },
        },
        required: ['operation', 'segment_id', 'args'],
      },
    },
  },
];

export async function getAgentTools(): Promise<ToolDefinition[]> {
  return BASE_TOOLS;
}

export async function dispatchAgentTool({
  documentId,
  mode,
  toolCall,
}: {
  documentId: string;
  mode: DocumentMode;
  toolCall: OpenAIToolCall;
}): Promise<DispatchResult> {
  const source = await loadDocument(documentId);
  if (!source) {
    throw new Error(`Document not found: ${documentId}`);
  }

  const { name, arguments: rawArguments = '{}' } = toolCall.function;
  const args = JSON.parse(rawArguments) as Record<string, unknown>;

  if (
    name === 'get_document_text'
    || name === 'get_formatting_capabilities'
    || name === 'find_text_context'
    || name === 'find_insertion_anchor'
    || name === 'list_caption_conventions'
  ) {
    const readEditor = await openReadEditor(source);
    try {
      const snapshot = buildDocumentSnapshot(readEditor, documentId, mode);
      const result =
        name === 'get_document_text'
          ? getDocumentText(snapshot)
          : name === 'get_formatting_capabilities'
            ? getFormattingCapabilities(readEditor)
          : name === 'find_text_context'
            ? findTextContext(
              snapshot,
              String(args.query ?? ''),
              Math.max(1, Number(args.max_results ?? 5) || 5),
            )
            : name === 'find_insertion_anchor'
              ? findInsertionAnchor(
                snapshot,
                String(args.intent ?? ''),
                String(args.hint_text ?? ''),
                String(args.asset_id ?? ''),
                Math.max(1, Number(args.max_results ?? 5) || 5),
              )
              : listCaptionConventions(snapshot);

      return {
        result,
        documentMutated: false,
        reloadRequired: false,
        trackedChangesSummary: mode === 'suggesting' ? summarizeTrackedChanges(readEditor) : undefined,
        anchorCandidates: name === 'find_insertion_anchor' && Array.isArray((result as any).anchor_candidates)
          ? ((result as any).anchor_candidates as AnchorCandidate[])
          : undefined,
      };
    } finally {
      readEditor.close();
    }
  }

  const mutationEditor = await openMutationEditor(source, mode);

  let documentMutated = false;

  try {
    const snapshot = buildDocumentSnapshot(mutationEditor, documentId, mode);
    let result: Record<string, unknown>;

    try {
      switch (name) {
        case 'set_document_title':
          result = setDocumentTitle(
            mutationEditor,
            snapshot,
            documentId,
            String(args.title ?? ''),
            mode,
          );
          documentMutated = true;
          break;
        case 'insert_image_at_anchor':
          result = await insertImageAtAnchor(
            mutationEditor,
            snapshot,
            documentId,
            String(args.asset_id ?? ''),
            String(args.anchor_id ?? ''),
            normalizePlacement(args.placement),
            normalizeCaptionMode(args.caption_mode),
            String(args.caption_text ?? ''),
            mode,
          );
          documentMutated = true;
          break;
        case 'replace_text':
          result = replaceText(
            mutationEditor,
            snapshot,
            documentId,
            String(args.target ?? ''),
            String(args.replacement ?? ''),
            String(args.segment_id ?? ''),
            String(args.context_before ?? ''),
            String(args.context_after ?? ''),
            Boolean(args.replace_all),
            mode,
          );
          documentMutated = (result.replacements as number) > 0;
          break;
        case 'append_paragraph':
          result = appendParagraph(mutationEditor, documentId, String(args.text ?? ''), mode);
          documentMutated = true;
          break;
        case 'apply_formatting':
          result = applyFormatting(
            mutationEditor,
            snapshot,
            documentId,
            String(args.operation ?? ''),
            args.args,
            String(args.segment_id ?? ''),
            String(args.target_text ?? ''),
            String(args.context_before ?? ''),
            String(args.context_after ?? ''),
            Boolean(args.apply_to_all_matches),
            Boolean(args.apply_to_entire_segment),
            mode,
          );
          documentMutated = (result.mutations_applied as number) > 0;
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      if (error instanceof StructuredToolError) {
        return {
          result: {
            document_id: documentId,
            error_code: error.errorCode,
            message: error.message,
            candidates: error.candidates,
            mode,
          },
          documentMutated: false,
          reloadRequired: false,
          trackedChangesSummary: mode === 'suggesting' ? summarizeTrackedChanges(mutationEditor) : undefined,
          errorCode: error.errorCode,
          candidates: error.candidates,
        };
      }
      throw error;
    }

    const trackedChangesSummary = mode === 'suggesting' ? summarizeTrackedChanges(mutationEditor) : undefined;

    if (documentMutated) {
      const exported = await mutationEditor.exportDocument();
      await saveDocument(documentId, await toBuffer(exported));
    }

    const dispatchResult: DispatchResult = {
      result,
      documentMutated,
      reloadRequired: documentMutated,
      trackedChangesSummary,
    };

    if (name === 'insert_image_at_anchor') {
      const imageResult = result as InsertedImageResult & { selected_anchor?: AnchorCandidate };
      dispatchResult.assetId = imageResult.asset_id;
      dispatchResult.selectedAnchor = imageResult.selected_anchor;
      dispatchResult.captionAdded = imageResult.caption_added;
      dispatchResult.captionText = imageResult.caption_text;
      dispatchResult.finalSize = imageResult.final_size;
    }

    return dispatchResult;
  } finally {
    mutationEditor.close();
  }
}

async function openReadEditor(source: Buffer): Promise<HeadlessEditor> {
  return Editor.open(source, {
    isHeadless: true,
    documentMode: 'editing',
    user: AI_USER,
  });
}

async function openMutationEditor(source: Buffer, mode: DocumentMode): Promise<HeadlessEditor> {
  const editor = await Editor.open(source, {
    isHeadless: true,
    documentMode: mode,
    user: AI_USER,
  });

  if (mode === 'suggesting') {
    editor.commands.enableTrackChanges?.();
  }

  return editor;
}

async function toBuffer(exported: Blob | Buffer | ArrayBuffer | Uint8Array): Promise<Buffer> {
  if (Buffer.isBuffer(exported)) {
    return exported;
  }

  if (exported instanceof Uint8Array) {
    return Buffer.from(exported);
  }

  if (exported instanceof ArrayBuffer) {
    return Buffer.from(exported);
  }

  if (typeof Blob !== 'undefined' && exported instanceof Blob) {
    return Buffer.from(await exported.arrayBuffer());
  }

  throw new Error(`Unexpected document export type in Node executor: ${Object.prototype.toString.call(exported)}`);
}

function getDocumentText(snapshot: DocumentSnapshot): Record<string, unknown> {
  return {
    document_id: snapshot.document_id,
    document_type: snapshot.document_type,
    document_mode: snapshot.document_mode,
    paragraph_count: snapshot.paragraph_count,
    segment_count: snapshot.segment_count,
    segments: snapshot.segments,
    tables_summary: snapshot.tables_summary,
    preview: snapshot.preview,
  };
}

function getFormattingCapabilities(editor: HeadlessEditor): Record<string, unknown> {
  const capabilities = (editor.doc as any).capabilities?.() as Record<string, unknown> | undefined;
  const format = isRecord(capabilities?.format) ? capabilities?.format : {};
  const operations = isRecord(capabilities?.operations) ? capabilities?.operations : {};
  const supportedInlineProperties = isRecord(format.supportedInlineProperties)
    ? format.supportedInlineProperties
    : {};

  return {
    inline_properties: supportedInlineProperties,
    operation_groups: {
      inline: INLINE_FORMATTING_OPERATIONS,
      paragraph: PARAGRAPH_FORMATTING_OPERATIONS,
      list: LIST_FORMATTING_OPERATIONS,
    },
    operation_support: Object.fromEntries(
      FORMATTING_OPERATION_NAMES.map((operationName) => [operationName, operations[operationName] ?? null]),
    ),
    global: isRecord(capabilities?.global) ? capabilities?.global : {},
  };
}

function findTextContext(
  snapshot: DocumentSnapshot,
  query: string,
  maxResults: number,
): Record<string, unknown> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new StructuredToolError('insufficient_context', 'query must not be empty');
  }

  const matches = findMatches(snapshot.internalSegments, trimmedQuery, maxResults);

  return {
    document_id: snapshot.document_id,
    document_type: snapshot.document_type,
    document_mode: snapshot.document_mode,
    query: trimmedQuery,
    match_count: matches.length,
    matches,
  };
}

function findInsertionAnchor(
  snapshot: DocumentSnapshot,
  intent: string,
  hintText: string,
  assetId: string,
  maxResults: number,
): Record<string, unknown> {
  const trimmedIntent = intent.trim();
  if (!trimmedIntent) {
    throw new StructuredToolError('insufficient_context', 'intent must not be empty');
  }

  const placement = inferPlacement(trimmedIntent);
  const candidates = scoreInsertionAnchors(snapshot.internalSegments, trimmedIntent, hintText, placement)
    .slice(0, maxResults);

  if (candidates.length === 0) {
    throw new StructuredToolError('insufficient_context', '未找到合适的正文插图位置，请补充更明确的章节或附近文字。');
  }

  return {
    document_id: snapshot.document_id,
    document_type: snapshot.document_type,
    document_mode: snapshot.document_mode,
    asset_id: assetId || undefined,
    intent: trimmedIntent,
    placement,
    candidate_count: candidates.length,
    anchor_candidates: candidates,
  };
}

function listCaptionConventions(snapshot: DocumentSnapshot): Record<string, unknown> {
  const captionSegments = snapshot.internalSegments.filter((segment) =>
    /^(图|figure)\s*\d+/i.test(segment.text.trim()),
  );

  const numberingStyle = captionSegments.some((segment) => /^figure/i.test(segment.text.trim()))
    ? 'figure'
    : captionSegments.length > 0
      ? 'figure_zh'
      : 'figure_zh';

  const separator = captionSegments.some((segment) => segment.text.includes('：'))
    ? '：'
    : captionSegments.some((segment) => segment.text.includes(':'))
      ? ':'
      : '：';

  return {
    document_id: snapshot.document_id,
    caption_count: captionSegments.length,
    preferred_prefix: numberingStyle === 'figure' ? 'Figure' : '图',
    preferred_separator: separator,
    examples: captionSegments.slice(0, 3).map((segment) => segment.text),
  };
}

function setDocumentTitle(
  editor: HeadlessEditor,
  snapshot: DocumentSnapshot,
  documentId: string,
  title: string,
  mode: DocumentMode,
): Record<string, unknown> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error('title must not be empty');
  }

  const titleSegments = snapshot.internalSegments.filter((segment) => segment.kind === 'title');
  if (titleSegments.length !== 1) {
    throw new StructuredToolError(
      'title_not_unique',
      '无法唯一确定 Word 文档标题，请先确认标题所在位置。',
      titleSegments.map(toTitleCandidate),
    );
  }

  const titleSegment = titleSegments[0];
  const titleParagraph = titleSegment.paragraphs[0];
  const range = findParagraphRangeForSegment(
    editor,
    titleSegment.segment_id,
    titleParagraph.paragraphIndexInSegment,
  );
  if (!range) {
    throw new StructuredToolError('title_not_unique', '未找到可编辑的标题段落。', [toTitleCandidate(titleSegment)]);
  }

  replaceRange(editor, range.from, range.to, trimmedTitle);

  return {
    document_id: documentId,
    title: trimmedTitle,
    segment_id: titleSegment.segment_id,
    location_label: titleSegment.location_label,
    mode,
  };
}

function replaceText(
  editor: HeadlessEditor,
  snapshot: DocumentSnapshot,
  documentId: string,
  target: string,
  replacement: string,
  segmentId: string,
  contextBefore: string,
  contextAfter: string,
  replaceAll: boolean,
  mode: DocumentMode,
): Record<string, unknown> {
  const trimmedTarget = target.trim();
  if (!trimmedTarget) {
    throw new Error('target must not be empty');
  }

  const trimmedSegmentId = segmentId.trim();
  if (!trimmedSegmentId) {
    const candidates = findMatches(snapshot.internalSegments, trimmedTarget, 5);
    throw new StructuredToolError(
      'insufficient_context',
      '缺少 segment_id。请先调用 find_text_context，确认具体要修改的 Word 片段。',
      candidates,
    );
  }

  const segment = snapshot.internalSegments.find((item) => item.segment_id === trimmedSegmentId);
  if (!segment) {
    throw new StructuredToolError(
      'insufficient_context',
      `未找到 segment_id=${trimmedSegmentId} 对应的 Word 片段。请重新定位。`,
    );
  }

  const occurrences = findOccurrencesWithinSegment(segment, trimmedTarget);
  if (occurrences.length === 0) {
    throw new StructuredToolError(
      'insufficient_context',
      `目标文本在指定片段中不存在：${trimmedTarget}`,
      findMatches(snapshot.internalSegments, trimmedTarget, 5),
    );
  }

  const hasContextConstraint = contextBefore.trim() !== '' || contextAfter.trim() !== '';
  const filteredOccurrences = hasContextConstraint
    ? occurrences.filter((occurrence) =>
        matchOccurrenceContext(occurrence, contextBefore, contextAfter),
      )
    : occurrences;

  if (hasContextConstraint && filteredOccurrences.length === 0) {
    throw new StructuredToolError(
      'insufficient_context',
      '指定的上下文与片段中的目标文本不匹配，请重新确认要修改的那一处。',
      occurrences,
    );
  }

  if (!replaceAll && filteredOccurrences.length !== 1) {
    throw new StructuredToolError(
      'ambiguous_match',
      '目标文本在该 Word 片段中命中多处，请根据上下文明确指定要修改的那一处。',
      filteredOccurrences,
    );
  }

  const appliedOccurrences = replaceAll ? filteredOccurrences : [filteredOccurrences[0]];

  for (const occurrence of [...appliedOccurrences].reverse()) {
    const range = findParagraphRangeForSegment(
      editor,
      occurrence.segment_id,
      occurrence.paragraphIndexInSegment,
    );
    if (!range) {
      throw new StructuredToolError(
        'insufficient_context',
        '未找到可编辑的目标段落，请重新定位后重试。',
        [toPublicMatch(occurrence)],
      );
    }

    replaceRange(
      editor,
      range.from + occurrence.localIndex,
      range.from + occurrence.localIndex + trimmedTarget.length,
      replacement,
    );
  }

  return {
    document_id: documentId,
    replacements: appliedOccurrences.length,
    target: trimmedTarget,
    replacement,
    segment_id: segment.segment_id,
    location_label: segment.location_label,
    mode,
  };
}

function applyFormatting(
  editor: HeadlessEditor,
  snapshot: DocumentSnapshot,
  documentId: string,
  operation: string,
  args: unknown,
  segmentId: string,
  targetText: string,
  contextBefore: string,
  contextAfter: string,
  applyToAllMatches: boolean,
  applyToEntireSegment: boolean,
  mode: DocumentMode,
): Record<string, unknown> {
  const trimmedOperation = operation.trim();
  if (!FORMATTING_OPERATION_NAMES.includes(trimmedOperation as (typeof FORMATTING_OPERATION_NAMES)[number])) {
    throw new Error(`Unsupported formatting operation: ${trimmedOperation || '(empty)'}`);
  }

  const trimmedSegmentId = segmentId.trim();
  if (!trimmedSegmentId) {
    throw new StructuredToolError('insufficient_context', '缺少 segment_id。请先确认要调整格式的具体 Word 片段。');
  }

  const segment = snapshot.internalSegments.find((item) => item.segment_id === trimmedSegmentId);
  if (!segment) {
    throw new StructuredToolError(
      'insufficient_context',
      `未找到 segment_id=${trimmedSegmentId} 对应的 Word 片段。请重新定位。`,
    );
  }

  const normalizedArgs = normalizeFormattingArgs(trimmedOperation, args);
  const docApi = editor.doc as any;

  if (INLINE_FORMATTING_OPERATION_SET.has(trimmedOperation)) {
    const textTargets = resolveInlineFormattingTargets(
      segment,
      targetText,
      contextBefore,
      contextAfter,
      applyToAllMatches,
      applyToEntireSegment,
    );

    const receipts = runFormattingOperationBatch(
      segment,
      trimmedOperation,
      textTargets.map((target) => ({
        ...normalizedArgs,
        target,
      })),
      (input) => invokeFormattingOperation(docApi, trimmedOperation, input),
    );

    return {
      document_id: documentId,
      operation: trimmedOperation,
      segment_id: segment.segment_id,
      location_label: segment.location_label,
      target_text: targetText.trim() || undefined,
      apply_to_entire_segment: applyToEntireSegment,
      targets_applied: textTargets.length,
      mutations_applied: textTargets.length,
      mode,
      receipts: receipts.slice(0, 3),
    };
  }

  const paragraphInfos = getSegmentParagraphInfos(segment);
  if (paragraphInfos.length === 0) {
    throw new StructuredToolError(
      'insufficient_context',
      '未找到可编辑的目标段落，请重新定位后再试。',
      [{ match_id: `${segment.segment_id}:paragraph`, segment_id: segment.segment_id, matched_text: segment.text, context_before: segment.context_before, context_after: segment.context_after, location_label: segment.location_label, kind: segment.kind }],
    );
  }

  if (PARAGRAPH_FORMATTING_OPERATION_SET.has(trimmedOperation)) {
    const receipts = runFormattingOperationBatch(
      segment,
      trimmedOperation,
      paragraphInfos.map((paragraph) => ({
        ...normalizedArgs,
        target: toParagraphTarget(paragraph),
      })),
      (input) => invokeFormattingOperation(docApi, trimmedOperation, input),
    );

    return {
      document_id: documentId,
      operation: trimmedOperation,
      segment_id: segment.segment_id,
      location_label: segment.location_label,
      paragraphs_formatted: paragraphInfos.length,
      mutations_applied: paragraphInfos.length,
      mode,
      receipts: receipts.slice(0, 3),
    };
  }

  const useParagraphTarget = trimmedOperation === 'lists.create';
  if (!useParagraphTarget) {
    const nonListParagraph = paragraphInfos.find((paragraph) => paragraph.nodeType !== 'listItem');
    if (nonListParagraph) {
      throw new StructuredToolError(
        'insufficient_context',
        '该列表格式操作只能作用于现有列表项。请先定位到已有列表项，或先使用 lists.create 创建列表。',
        [toSegmentMatchCandidate(segment)],
      );
    }
  }

  const receipts = runFormattingOperationBatch(
    segment,
    trimmedOperation,
    paragraphInfos.map((paragraph) => ({
      ...normalizedArgs,
      target: useParagraphTarget ? toParagraphTarget(paragraph) : toListItemTarget(paragraph),
    })),
    (input) => invokeFormattingOperation(docApi, trimmedOperation, input),
  );

  return {
    document_id: documentId,
    operation: trimmedOperation,
    segment_id: segment.segment_id,
    location_label: segment.location_label,
    list_items_formatted: paragraphInfos.length,
    mutations_applied: paragraphInfos.length,
    mode,
    receipts: receipts.slice(0, 3),
  };
}

function appendParagraph(
  editor: HeadlessEditor,
  documentId: string,
  text: string,
  mode: DocumentMode,
): Record<string, unknown> {
  const trimmedText = text.trim();
  if (!trimmedText) {
    throw new Error('text must not be empty');
  }

  const created = editor.doc.create.paragraph({});
  editor.doc.replace({
    target: created.insertionPoint,
    text: trimmedText,
  });

  return {
    document_id: documentId,
    appended: true,
    text: trimmedText,
    insertion_location: 'document_end',
    mode,
  };
}

async function insertImageAtAnchor(
  editor: HeadlessEditor,
  snapshot: DocumentSnapshot,
  documentId: string,
  assetId: string,
  anchorId: string,
  placement: 'before' | 'after' | 'replace_placeholder',
  captionMode: 'auto' | 'always' | 'none',
  captionText: string,
  mode: DocumentMode,
): Promise<Record<string, unknown>> {
  const trimmedAssetId = assetId.trim();
  const trimmedAnchorId = anchorId.trim();
  if (!trimmedAssetId) {
    throw new Error('asset_id must not be empty');
  }
  if (!trimmedAnchorId) {
    throw new StructuredToolError('insufficient_context', '缺少 anchor_id。请先调用 find_insertion_anchor。');
  }

  const anchor = snapshot.internalSegments.find((segment) => segment.segment_id === trimmedAnchorId);
  if (!anchor) {
    throw new StructuredToolError('insufficient_context', `未找到 anchor_id=${trimmedAnchorId} 对应的正文位置。`);
  }

  const assetMeta = await loadChatAssetMeta(documentId, trimmedAssetId);
  const assetBytes = await loadChatAsset(documentId, trimmedAssetId, 'original');
  if (!assetMeta || !assetBytes) {
    throw new Error(`Image asset not found: ${trimmedAssetId}`);
  }

  const insertionPos = findParagraphInsertionPositionForSegment(editor, anchor, placement);
  if (insertionPos == null) {
    throw new StructuredToolError('insufficient_context', '未找到可插图的目标段落，请重新定位后再试。');
  }

  if (placement === 'replace_placeholder' && looksLikeImagePlaceholder(anchor.text)) {
    const placeholderRange = findParagraphRangeForSegment(
      editor,
      anchor.segment_id,
      anchor.paragraphs[0]?.paragraphIndexInSegment ?? 0,
    );
    if (placeholderRange) {
      replaceRange(editor, placeholderRange.from, placeholderRange.to, '');
    }
  }

  const imageParagraphId = crypto.randomUUID();
  const insertedImageParagraph = editor.commands.insertParagraphAt?.({
    pos: insertionPos,
    text: '',
    sdBlockId: imageParagraphId,
    tracked: mode === 'suggesting',
  });
  if (!insertedImageParagraph) {
    throw new Error(`Unable to insert image paragraph at ${insertionPos}`);
  }

  const imageParagraphRange = findParagraphRangeByBlockId(editor, imageParagraphId);
  if (!imageParagraphRange) {
    throw new Error('Unable to resolve inserted image paragraph');
  }

  const finalSize = computeImageSize(assetMeta.width, assetMeta.height, anchor.kind);
  const imageDataUrl = `data:${assetMeta.mime_type};base64,${assetBytes.toString('base64')}`;

  const imageSelectionSet = editor.commands.setTextSelection?.({
    from: imageParagraphRange.from,
    to: imageParagraphRange.from,
  });
  if (!imageSelectionSet) {
    throw new Error('Unable to position cursor in image paragraph');
  }

  editor.commands.setTextAlign?.('center');
  const imageInserted = editor.commands.setImage?.({
    src: imageDataUrl,
    alt: assetMeta.filename,
    title: assetMeta.filename,
    size: finalSize,
    wrap: { type: 'Inline' },
  });
  if (!imageInserted) {
    throw new Error('Unable to insert image into document');
  }

  let resolvedCaptionText = captionText.trim();
  let captionAdded = false;

  if (captionMode !== 'none') {
    if (!resolvedCaptionText && captionMode === 'always') {
      resolvedCaptionText = buildAutoCaptionText(snapshot, anchor);
    } else if (!resolvedCaptionText && captionMode === 'auto') {
      resolvedCaptionText = buildAutoCaptionText(snapshot, anchor);
    }

    if (resolvedCaptionText) {
      const imageParagraphBoundary = findParagraphInsertionPositionByBlockId(editor, imageParagraphId, 'after');
      if (imageParagraphBoundary == null) {
        throw new Error('Unable to resolve caption insertion point');
      }

      const captionParagraphId = crypto.randomUUID();
      const insertedCaption = editor.commands.insertParagraphAt?.({
        pos: imageParagraphBoundary,
        text: resolvedCaptionText,
        sdBlockId: captionParagraphId,
        tracked: mode === 'suggesting',
      });
      if (!insertedCaption) {
        throw new Error('Unable to insert caption paragraph');
      }

      const captionRange = findParagraphRangeByBlockId(editor, captionParagraphId);
      if (captionRange) {
        editor.commands.setTextSelection?.({ from: captionRange.from, to: captionRange.to });
        editor.commands.setTextAlign?.('center');
      }
      captionAdded = true;
    }
  }

  return {
    asset_id: trimmedAssetId,
    inserted: true,
    location_label: anchor.location_label,
    section_path: anchor.section_path,
    placement,
    caption_added: captionAdded,
    caption_text: captionAdded ? resolvedCaptionText : undefined,
    final_size: finalSize,
    selected_anchor: toAnchorCandidate(anchor, 1, placement),
    mode,
  };
}

function buildDocumentSnapshot(
  editor: HeadlessEditor,
  documentId: string,
  requestedMode: DocumentMode,
): DocumentSnapshot {
  const internalSegments: InternalSegment[] = [];
  const tablesSummary: TableSummary[] = [];
  let paragraphCount = 0;
  let topLevelParagraphCount = 0;
  let encounteredTable = false;
  let currentSectionPath = '文档开头';

  editor.state.doc.forEach((node: any, _offset: number) => {
    if (node.type?.name === 'paragraph') {
      paragraphCount += 1;
      topLevelParagraphCount += 1;
      const text = normalizeSegmentText(node.textContent ?? '');
      if (!text) {
        return;
      }

      const segment = createParagraphSegment(node, text, topLevelParagraphCount, encounteredTable, currentSectionPath);
      if (segment) {
        internalSegments.push(segment);
        if (segment.kind === 'title') {
          currentSectionPath = segment.text;
        }
      }
      return;
    }

    if (node.type?.name === 'table') {
      encounteredTable = true;
      const tableIndex = tablesSummary.length + 1;
      const { segments, summary, paragraphs } = createTableSegments(node, tableIndex, currentSectionPath);
      paragraphCount += paragraphs;
      internalSegments.push(...segments);
      tablesSummary.push(summary);
    }
  });

  attachSegmentContext(internalSegments);

  return {
    document_id: documentId,
    document_type: 'word_docx',
    document_mode: requestedMode,
    paragraph_count: paragraphCount,
    segment_count: internalSegments.length,
    segments: internalSegments.map(toPublicSegment),
    tables_summary: tablesSummary,
    preview: internalSegments.slice(0, 10).map((segment) => ({
      location_label: segment.location_label,
      text: truncateText(segment.text, 120),
    })),
    internalSegments,
  };
}

function createParagraphSegment(
  node: any,
  text: string,
  paragraphIndex: number,
  encounteredTable: boolean,
  currentSectionPath: string,
): InternalSegment | null {
  const paragraphTarget = resolveParagraphTarget(node);
  if (!paragraphTarget) {
    return null;
  }

  const titleCandidate = isTitleParagraph(node, paragraphIndex, encounteredTable);
  const segmentIdPrefix = titleCandidate ? 'title' : 'paragraph';

  return {
    segment_id: `${segmentIdPrefix}:${paragraphIndex}`,
    kind: titleCandidate ? 'title' : 'paragraph',
    text,
    context_before: '',
    context_after: '',
    location_label: titleCandidate ? '文档标题' : `正文段落 ${paragraphIndex}`,
    section_path: titleCandidate ? text : currentSectionPath,
    paragraphs: [
      {
        paragraphIndexInSegment: 0,
        nodeId: paragraphTarget.nodeId,
        nodeType: paragraphTarget.nodeType,
        text,
      },
    ],
    titleCandidate,
  };
}

function createTableSegments(
  tableNode: any,
  tableIndex: number,
  currentSectionPath: string,
): { segments: InternalSegment[]; summary: TableSummary; paragraphs: number } {
  const segments: InternalSegment[] = [];
  const cellPreviews: string[] = [];
  let rowCount = 0;
  let columnCount = 0;
  let paragraphCount = 0;

  tableNode.forEach((rowNode: any, _rowOffset: number, rowIndex: number) => {
    if (rowNode.type?.name !== 'tableRow') {
      return;
    }

    rowCount += 1;
    let visualColumn = 1;

    rowNode.forEach((cellNode: any, _cellOffset: number) => {
      if (cellNode.type?.name !== 'tableCell') {
        return;
      }

      const colspan = Number(cellNode.attrs?.colspan ?? 1) || 1;
      const paragraphs = collectParagraphInfosFromCell(cellNode);
      paragraphCount += paragraphs.length;

      const text = normalizeSegmentText(paragraphs.map((paragraph) => paragraph.text).filter(Boolean).join('\n'));
      const locationLabel = `表格${tableIndex} 第${rowIndex + 1}行 第${visualColumn}列`;

      if (text) {
        segments.push({
          segment_id: `table:${tableIndex}:row:${rowIndex + 1}:col:${visualColumn}`,
          kind: 'table_cell',
          text,
          context_before: '',
          context_after: '',
          location_label: locationLabel,
          section_path: currentSectionPath,
          paragraphs,
          titleCandidate: false,
        });

        if (cellPreviews.length < 8) {
          cellPreviews.push(`${locationLabel}: ${truncateText(text, 48)}`);
        }
      }

      visualColumn += colspan;
    });

    columnCount = Math.max(columnCount, visualColumn - 1);
  });

  return {
    segments,
    summary: {
      table_index: tableIndex,
      row_count: rowCount,
      column_count: columnCount,
      cell_previews: cellPreviews,
    },
    paragraphs: paragraphCount,
  };
}

function collectParagraphInfosFromCell(cellNode: any): ParagraphInfo[] {
  const paragraphs: ParagraphInfo[] = [];
  let paragraphIndexInSegment = 0;

  cellNode.forEach((child: any) => {
    if (child.type?.name !== 'paragraph') {
      return;
    }

    const text = normalizeSegmentText(child.textContent ?? '');
    const paragraphTarget = resolveParagraphTarget(child);
    paragraphs.push({
      paragraphIndexInSegment,
      nodeId: paragraphTarget?.nodeId ?? '',
      nodeType: paragraphTarget?.nodeType ?? 'paragraph',
      text,
    });
    paragraphIndexInSegment += 1;
  });

  return paragraphs;
}

function attachSegmentContext(segments: InternalSegment[]): void {
  for (let index = 0; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const next = segments[index + 1];
    segments[index].context_before = previous ? truncateText(previous.text, 120) : '';
    segments[index].context_after = next ? truncateText(next.text, 120) : '';
  }
}

function findMatches(
  segments: InternalSegment[],
  query: string,
  maxResults: number,
): MatchCandidate[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const matches: MatchCandidate[] = [];

  for (const segment of segments) {
    const occurrences = findOccurrencesWithinSegment(segment, trimmedQuery);
    for (const occurrence of occurrences) {
      matches.push(toPublicMatch(occurrence));
      if (matches.length >= maxResults) {
        return matches;
      }
    }
  }

  return matches;
}

function findOccurrencesWithinSegment(segment: InternalSegment, query: string): MatchCandidateInternal[] {
  const matches: MatchCandidateInternal[] = [];

  for (const paragraph of segment.paragraphs) {
    let searchFrom = 0;
    while (searchFrom <= paragraph.text.length) {
      const index = paragraph.text.indexOf(query, searchFrom);
      if (index === -1) {
        break;
      }

      matches.push({
        match_id: `${segment.segment_id}:paragraph:${paragraph.paragraphIndexInSegment}:${index}`,
        segment_id: segment.segment_id,
        matched_text: query,
        context_before: buildInlineContext(paragraph.text, Math.max(0, index - 24), index),
        context_after: buildInlineContext(
          paragraph.text,
          index + query.length,
          Math.min(paragraph.text.length, index + query.length + 24),
        ),
        location_label: segment.location_label,
        kind: segment.kind,
        paragraphIndexInSegment: paragraph.paragraphIndexInSegment,
        localIndex: index,
      });

      searchFrom = index + query.length;
    }
  }

  return matches;
}

function matchOccurrenceContext(
  occurrence: MatchCandidateInternal,
  contextBefore: string,
  contextAfter: string,
): boolean {
  const before = normalizeContextForMatch(contextBefore);
  const after = normalizeContextForMatch(contextAfter);

  if (before && !normalizeContextForMatch(occurrence.context_before).includes(before)) {
    return false;
  }

  if (after && !normalizeContextForMatch(occurrence.context_after).includes(after)) {
    return false;
  }

  return true;
}

function inferPlacement(intent: string): 'before' | 'after' | 'replace_placeholder' {
  const normalized = intent.toLowerCase();
  if (/占位|placeholder|替换/.test(normalized)) {
    return 'replace_placeholder';
  }
  if (/前|之前|前面|前插|before/.test(normalized)) {
    return 'before';
  }
  return 'after';
}

function normalizePlacement(value: unknown): 'before' | 'after' | 'replace_placeholder' {
  if (value === 'before' || value === 'after' || value === 'replace_placeholder') {
    return value;
  }
  return 'after';
}

function normalizeCaptionMode(value: unknown): 'auto' | 'always' | 'none' {
  if (value === 'auto' || value === 'always' || value === 'none') {
    return value;
  }
  return 'auto';
}

function normalizeFormattingArgs(
  operation: string,
  args: unknown,
): Record<string, unknown> {
  const normalized = isRecord(args) ? { ...args } : {};

  if (operation === 'format.apply') {
    if (!isRecord(normalized.inline) && isRecord(normalized.properties)) {
      normalized.inline = normalized.properties;
    }
    if (!isRecord(normalized.inline) && isRecord(normalized.style)) {
      normalized.inline = normalized.style;
    }
  }

  if (operation === 'format.paragraph.setIndentation' && isRecord(normalized.indentation)) {
    Object.assign(normalized, normalized.indentation);
  }
  if (operation === 'format.paragraph.setSpacing' && isRecord(normalized.spacing)) {
    Object.assign(normalized, normalized.spacing);
  }
  if (operation === 'format.paragraph.setKeepOptions' && isRecord(normalized.keepOptions)) {
    Object.assign(normalized, normalized.keepOptions);
  }
  if (operation === 'format.paragraph.setFlowOptions' && isRecord(normalized.flowOptions)) {
    Object.assign(normalized, normalized.flowOptions);
  }
  if (operation === 'format.paragraph.setTabStop' && isRecord(normalized.tabStop)) {
    Object.assign(normalized, normalized.tabStop);
  }
  if (operation === 'format.paragraph.setBorder' && isRecord(normalized.border)) {
    Object.assign(normalized, normalized.border);
  }
  if (operation === 'format.paragraph.setShading' && isRecord(normalized.shading)) {
    Object.assign(normalized, normalized.shading);
  }
  if (operation === 'format.paragraph.setOutlineLevel' && normalized.outlineLevel == null && normalized.level != null) {
    normalized.outlineLevel = normalized.level;
  }
  if (operation === 'format.paragraph.setTabStop' && normalized.alignment == null && normalized.tabType != null) {
    normalized.alignment = normalized.tabType;
  }
  if (operation === 'format.paragraph.setBorder' && normalized.style == null && normalized.val != null) {
    normalized.style = normalized.val;
  }
  if (operation === 'format.paragraph.setShading' && normalized.pattern == null && normalized.val != null) {
    normalized.pattern = normalized.val;
  }

  if ((operation === 'lists.create' || operation === 'lists.setType') && normalized.kind == null) {
    normalized.kind = normalized.type ?? normalized.listType ?? normalized.listKind;
  }
  if (operation === 'lists.setLevelRestart' && normalized.restart == null && normalized.restart_numbering != null) {
    normalized.restart = normalized.restart_numbering;
  }

  return normalized;
}

function resolveInlineFormattingTargets(
  segment: InternalSegment,
  targetText: string,
  contextBefore: string,
  contextAfter: string,
  applyToAllMatches: boolean,
  applyToEntireSegment: boolean,
): Array<Record<string, unknown>> {
  if (applyToEntireSegment) {
    const targets = getSegmentParagraphInfos(segment)
      .filter((paragraph) => paragraph.text.length > 0)
      .map((paragraph) => ({
        kind: 'text',
        blockId: paragraph.nodeId,
        range: {
          start: 0,
          end: paragraph.text.length,
        },
      }));

    if (targets.length === 0) {
      throw new StructuredToolError(
        'insufficient_context',
        '目标片段里没有可应用字符格式的正文内容。',
      );
    }

    return targets;
  }

  const trimmedTarget = targetText.trim();
  if (!trimmedTarget) {
    throw new StructuredToolError(
      'insufficient_context',
      '字符格式调整必须提供 target_text，或设置 apply_to_entire_segment=true。',
    );
  }

  const occurrences = findOccurrencesWithinSegment(segment, trimmedTarget);
  if (occurrences.length === 0) {
    throw new StructuredToolError(
      'insufficient_context',
      `目标文本在指定片段中不存在：${trimmedTarget}`,
      findMatches([segment], trimmedTarget, 5),
    );
  }

  const hasContextConstraint = contextBefore.trim() !== '' || contextAfter.trim() !== '';
  const filteredOccurrences = hasContextConstraint
    ? occurrences.filter((occurrence) => matchOccurrenceContext(occurrence, contextBefore, contextAfter))
    : occurrences;

  if (hasContextConstraint && filteredOccurrences.length === 0) {
    throw new StructuredToolError(
      'insufficient_context',
      '指定的上下文与片段中的目标文本不匹配，请重新确认要调整格式的那一处。',
      occurrences,
    );
  }

  if (!applyToAllMatches && filteredOccurrences.length !== 1) {
    throw new StructuredToolError(
      'ambiguous_match',
      '目标文本在该 Word 片段中命中多处，请根据上下文明确指定要调整格式的那一处。',
      filteredOccurrences,
    );
  }

  const selectedOccurrences = applyToAllMatches ? filteredOccurrences : [filteredOccurrences[0]];
  return selectedOccurrences.map((occurrence) => {
    const paragraph = segment.paragraphs.find((item) => item.paragraphIndexInSegment === occurrence.paragraphIndexInSegment);
    if (!paragraph?.nodeId) {
      throw new StructuredToolError(
        'insufficient_context',
        '未找到可编辑的目标段落，请重新定位后重试。',
        [toPublicMatch(occurrence)],
      );
    }

    return {
      kind: 'text',
      blockId: paragraph.nodeId,
      range: {
        start: occurrence.localIndex,
        end: occurrence.localIndex + occurrence.matched_text.length,
      },
    };
  });
}

function getSegmentParagraphInfos(segment: InternalSegment): ParagraphInfo[] {
  const seen = new Set<string>();

  return segment.paragraphs.filter((paragraph) => {
    const key = `${paragraph.nodeType}:${paragraph.nodeId}`.trim();
    if (!paragraph.nodeId.trim() || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function toParagraphTarget(paragraph: ParagraphInfo): Record<string, unknown> {
  return {
    kind: 'block',
    nodeType: paragraph.nodeType,
    nodeId: paragraph.nodeId,
  };
}

function toListItemTarget(paragraph: ParagraphInfo): Record<string, unknown> {
  return {
    kind: 'block',
    nodeType: 'listItem',
    nodeId: paragraph.nodeId,
  };
}

function runFormattingOperationBatch(
  segment: InternalSegment,
  operation: string,
  inputs: Array<Record<string, unknown>>,
  invoke: (input: Record<string, unknown>) => Record<string, unknown>,
): Array<Record<string, unknown>> {
  try {
    return inputs.map((input) => invoke(input));
  } catch (error) {
    throw normalizeFormattingOperationError(error, segment, operation);
  }
}

function normalizeFormattingOperationError(
  error: unknown,
  segment: InternalSegment,
  operation: string,
): unknown {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes('target could not be resolved')
    || message.includes('Block "')
    || message.includes('Block target was not found')
    || message.includes('List item target was not found')
  ) {
    return new StructuredToolError(
      'insufficient_context',
      `当前无法在文档中重新定位 ${operation} 的目标段落。请先重新定位该片段后再试。`,
      [toSegmentMatchCandidate(segment)],
    );
  }

  return error;
}

function invokeFormattingOperation(
  docApi: any,
  operation: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const parts = operation.split('.');
  let owner: any = docApi;

  for (let index = 0; index < parts.length - 1; index += 1) {
    owner = owner?.[parts[index]];
  }

  const fn = owner?.[parts[parts.length - 1]];
  if (typeof fn !== 'function') {
    throw new Error(`SuperDoc operation is unavailable: ${operation}`);
  }

  const result = fn.call(owner, input);
  if (isFailedReceipt(result)) {
    throw new Error(result.failure.message || result.failure.code || `SuperDoc operation failed: ${operation}`);
  }

  return isRecord(result) ? result : { value: result };
}

function isFailedReceipt(
  value: unknown,
): value is { success: false; failure: { message?: string; code?: string } } {
  return isRecord(value) && value.success === false && isRecord(value.failure);
}

function isRecord(value: unknown): value is Record<string, any> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function scoreInsertionAnchors(
  segments: InternalSegment[],
  intent: string,
  hintText: string,
  placement: 'before' | 'after' | 'replace_placeholder',
): AnchorCandidate[] {
  const normalizedIntent = intent.toLowerCase();
  const normalizedHint = hintText.trim().toLowerCase();
  const candidates = segments.map((segment) => {
    let score = 0;
    const text = segment.text.toLowerCase();
    const location = segment.location_label.toLowerCase();
    const sectionPath = segment.section_path.toLowerCase();

    if (segment.kind === 'title') {
      score += 0.12;
    }

    if (normalizedHint) {
      if (text.includes(normalizedHint)) score += 0.45;
      if (location.includes(normalizedHint)) score += 0.35;
      if (sectionPath.includes(normalizedHint)) score += 0.5;
    }

    for (const token of tokenizeIntent(normalizedIntent)) {
      if (text.includes(token)) score += 0.12;
      if (location.includes(token)) score += 0.16;
      if (sectionPath.includes(token)) score += 0.22;
    }

    if (/文档开头|开头|顶部|最前/.test(normalizedIntent) && segment.segment_id === segments[0]?.segment_id) {
      score += 0.9;
    }
    if (/文末|末尾|最后|结尾/.test(normalizedIntent) && segment.segment_id === segments[segments.length - 1]?.segment_id) {
      score += 0.8;
    }
    if (placement === 'replace_placeholder' && looksLikeImagePlaceholder(segment.text)) {
      score += 0.6;
    }

    return toAnchorCandidate(segment, Math.min(1, score), placement);
  });

  return candidates
    .filter((candidate) => candidate.confidence >= 0.2)
    .sort((left, right) => right.confidence - left.confidence);
}

function tokenizeIntent(intent: string): string[] {
  return Array.from(new Set(
    intent
      .split(/[\s,，。；;:：()（）]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2),
  ));
}

function toAnchorCandidate(
  segment: InternalSegment,
  confidence: number,
  placement: 'before' | 'after' | 'replace_placeholder',
): AnchorCandidate {
  return {
    anchor_id: segment.segment_id,
    segment_id: segment.segment_id,
    location_label: segment.location_label,
    section_path: segment.section_path,
    context_before: segment.context_before,
    context_after: segment.context_after,
    confidence: Number(confidence.toFixed(3)),
    placement,
  };
}

function findParagraphRangeForSegment(
  editor: HeadlessEditor,
  segmentId: string,
  paragraphIndexInSegment: number,
): { from: number; to: number } | null {
  if (segmentId.startsWith('table:')) {
    return findTableCellParagraphRange(editor, segmentId, paragraphIndexInSegment);
  }

  return findTopLevelParagraphRange(editor, segmentId, paragraphIndexInSegment);
}

function findTopLevelParagraphRange(
  editor: HeadlessEditor,
  segmentId: string,
  paragraphIndexInSegment: number,
): { from: number; to: number } | null {
  if (paragraphIndexInSegment !== 0) {
    return null;
  }

  const [kind, indexValue] = segmentId.split(':');
  if (!(kind === 'title' || kind === 'paragraph')) {
    return null;
  }

  const targetParagraphIndex = Number(indexValue);
  if (!Number.isFinite(targetParagraphIndex) || targetParagraphIndex < 1) {
    return null;
  }

  let currentParagraphIndex = 0;
  let found: { from: number; to: number } | null = null;

  editor.state.doc.forEach((node: any, offset: number) => {
    if (found || node.type?.name !== 'paragraph') {
      return;
    }

    currentParagraphIndex += 1;
    if (currentParagraphIndex !== targetParagraphIndex) {
      return;
    }

    const text = node.textContent ?? '';
    found = {
      from: offset + 1,
      to: offset + 1 + text.length,
    };
  });

  return found;
}

function findTableCellParagraphRange(
  editor: HeadlessEditor,
  segmentId: string,
  paragraphIndexInSegment: number,
): { from: number; to: number } | null {
  const parsed = segmentId.match(/^table:(\d+):row:(\d+):col:(\d+)$/);
  if (!parsed) {
    return null;
  }

  const targetTableIndex = Number(parsed[1]);
  const targetRowIndex = Number(parsed[2]);
  const targetColumnIndex = Number(parsed[3]);

  let currentTableIndex = 0;
  let found: { from: number; to: number } | null = null;

  editor.state.doc.forEach((tableNode: any, tableOffset: number) => {
    if (found || tableNode.type?.name !== 'table') {
      return;
    }

    currentTableIndex += 1;
    if (currentTableIndex !== targetTableIndex) {
      return;
    }

    tableNode.forEach((rowNode: any, rowOffset: number, rowIndex: number) => {
      if (found || rowNode.type?.name !== 'tableRow' || rowIndex + 1 !== targetRowIndex) {
        return;
      }

      let visualColumn = 1;
      const rowStart = tableOffset + 1 + rowOffset;

      rowNode.forEach((cellNode: any, cellOffset: number) => {
        if (found || cellNode.type?.name !== 'tableCell') {
          return;
        }

        const colspan = Number(cellNode.attrs?.colspan ?? 1) || 1;
        const currentColumn = visualColumn;
        visualColumn += colspan;

        if (currentColumn !== targetColumnIndex) {
          return;
        }

        const cellStart = rowStart + 1 + cellOffset;
        let currentParagraphIndex = 0;

        cellNode.forEach((paragraphNode: any, paragraphOffset: number) => {
          if (found || paragraphNode.type?.name !== 'paragraph') {
            return;
          }

          if (currentParagraphIndex !== paragraphIndexInSegment) {
            currentParagraphIndex += 1;
            return;
          }

          const paragraphStart = cellStart + 1 + paragraphOffset;
          const text = paragraphNode.textContent ?? '';
          found = {
            from: paragraphStart + 1,
            to: paragraphStart + 1 + text.length,
          };
        });
      });
    });
  });

  return found;
}

function findParagraphRangeByBlockId(
  editor: HeadlessEditor,
  blockId: string,
): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;

  editor.state.doc.forEach((node: any, offset: number) => {
    if (found || node.type?.name !== 'paragraph') {
      return;
    }

    if (String(node.attrs?.sdBlockId ?? '') !== blockId) {
      return;
    }

    const text = node.textContent ?? '';
    found = {
      from: offset + 1,
      to: offset + 1 + text.length,
    };
  });

  return found;
}

function findParagraphInsertionPositionForSegment(
  editor: HeadlessEditor,
  segment: InternalSegment,
  placement: 'before' | 'after' | 'replace_placeholder',
): number | null {
  if (segment.segment_id.startsWith('table:')) {
    return findTableCellInsertionPosition(editor, segment, placement);
  }

  return findTopLevelInsertionPosition(editor, segment.segment_id, placement);
}

function findParagraphInsertionPositionByBlockId(
  editor: HeadlessEditor,
  blockId: string,
  placement: 'before' | 'after',
): number | null {
  let found: number | null = null;

  editor.state.doc.forEach((node: any, offset: number) => {
    if (found != null || node.type?.name !== 'paragraph') {
      return;
    }

    if (String(node.attrs?.sdBlockId ?? '') !== blockId) {
      return;
    }

    found = placement === 'before' ? offset : offset + node.nodeSize;
  });

  return found;
}

function findTopLevelInsertionPosition(
  editor: HeadlessEditor,
  segmentId: string,
  placement: 'before' | 'after' | 'replace_placeholder',
): number | null {
  const [kind, indexValue] = segmentId.split(':');
  if (!(kind === 'title' || kind === 'paragraph')) {
    return null;
  }

  const targetParagraphIndex = Number(indexValue);
  if (!Number.isFinite(targetParagraphIndex) || targetParagraphIndex < 1) {
    return null;
  }

  let currentParagraphIndex = 0;
  let found: number | null = null;

  editor.state.doc.forEach((node: any, offset: number) => {
    if (found != null || node.type?.name !== 'paragraph') {
      return;
    }

    currentParagraphIndex += 1;
    if (currentParagraphIndex !== targetParagraphIndex) {
      return;
    }

    found = placement === 'before' ? offset : offset + node.nodeSize;
  });

  return found;
}

function findTableCellInsertionPosition(
  editor: HeadlessEditor,
  segment: InternalSegment,
  placement: 'before' | 'after' | 'replace_placeholder',
): number | null {
  const parsed = segment.segment_id.match(/^table:(\d+):row:(\d+):col:(\d+)$/);
  if (!parsed) {
    return null;
  }

  const targetTableIndex = Number(parsed[1]);
  const targetRowIndex = Number(parsed[2]);
  const targetColumnIndex = Number(parsed[3]);
  const targetParagraphIndex = placement === 'before' ? 0 : Math.max(0, segment.paragraphs.length - 1);

  let currentTableIndex = 0;
  let found: number | null = null;

  editor.state.doc.forEach((tableNode: any, tableOffset: number) => {
    if (found != null || tableNode.type?.name !== 'table') {
      return;
    }

    currentTableIndex += 1;
    if (currentTableIndex !== targetTableIndex) {
      return;
    }

    tableNode.forEach((rowNode: any, rowOffset: number, rowIndex: number) => {
      if (found != null || rowNode.type?.name !== 'tableRow' || rowIndex + 1 !== targetRowIndex) {
        return;
      }

      let visualColumn = 1;
      const rowStart = tableOffset + 1 + rowOffset;

      rowNode.forEach((cellNode: any, cellOffset: number) => {
        if (found != null || cellNode.type?.name !== 'tableCell') {
          return;
        }

        const colspan = Number(cellNode.attrs?.colspan ?? 1) || 1;
        const currentColumn = visualColumn;
        visualColumn += colspan;

        if (currentColumn !== targetColumnIndex) {
          return;
        }

        const cellStart = rowStart + 1 + cellOffset;
        let currentParagraph = 0;

        cellNode.forEach((paragraphNode: any, paragraphOffset: number) => {
          if (found != null || paragraphNode.type?.name !== 'paragraph') {
            return;
          }

          const paragraphStart = cellStart + 1 + paragraphOffset;
          if (placement === 'before' && currentParagraph === 0) {
            found = paragraphStart;
            return;
          }
          if (currentParagraph === targetParagraphIndex) {
            found = placement === 'before' ? paragraphStart : paragraphStart + paragraphNode.nodeSize;
          }
          currentParagraph += 1;
        });
      });
    });
  });

  return found;
}

function computeImageSize(
  width: number,
  height: number,
  kind: SegmentKind,
): { width: number; height: number } {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const aspectRatio = safeWidth / safeHeight;
  const availableWidth = kind === 'table_cell' ? 240 : 520;
  const maxHeight = kind === 'table_cell' ? 180 : 360;

  let targetWidth = availableWidth * 0.72;
  if (aspectRatio >= 1.25) {
    targetWidth = availableWidth * 0.92;
  } else if (aspectRatio <= 0.8) {
    targetWidth = availableWidth * 0.58;
  }

  let targetHeight = targetWidth / aspectRatio;
  if (targetHeight > maxHeight) {
    targetHeight = maxHeight;
    targetWidth = targetHeight * aspectRatio;
  }

  targetWidth = Math.min(targetWidth, safeWidth);
  targetHeight = Math.min(targetHeight, safeHeight);

  return {
    width: Math.max(1, Math.round(targetWidth)),
    height: Math.max(1, Math.round(targetHeight)),
  };
}

function buildAutoCaptionText(snapshot: DocumentSnapshot, anchor: InternalSegment): string {
  const conventions = listCaptionConventions(snapshot);
  const prefix = String(conventions.preferred_prefix ?? '图');
  const separator = String(conventions.preferred_separator ?? '：');
  const nextNumber = Number(conventions.caption_count ?? 0) + 1;
  const title = anchor.kind === 'title'
    ? `${anchor.text}相关图片`
    : anchor.section_path && anchor.section_path !== '文档开头'
      ? `${anchor.section_path}配图`
      : '插图';
  return `${prefix} ${nextNumber}${separator}${title}`;
}

function looksLikeImagePlaceholder(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return /图片|插图|image|figure|logo|示意图|流程图|截图/.test(normalized) && normalized.length <= 24;
}

function replaceRange(editor: HeadlessEditor, from: number, to: number, text: string): void {
  const selectionSet = editor.commands.setTextSelection?.({ from, to });
  if (!selectionSet) {
    throw new Error(`Unable to select document range ${from}-${to}`);
  }

  const inserted = editor.commands.insertContent?.(text);
  if (!inserted) {
    throw new Error(`Unable to insert replacement content at ${from}-${to}`);
  }
}

function summarizeTrackedChanges(editor: HeadlessEditor): TrackChangesSummary {
  const listing = editor.doc.trackChanges.list({});
  const items = Array.isArray(listing.items) ? listing.items : [];

  return {
    total: typeof listing.total === 'number' ? listing.total : items.length,
    items: items.slice(0, 5).map((item: Record<string, unknown>) => ({
      id: String(item.id ?? ''),
      type: String(item.type ?? 'unknown'),
      author: item.author ? String(item.author) : undefined,
      excerpt: item.excerpt ? String(item.excerpt) : undefined,
      date: item.date ? String(item.date) : undefined,
    })),
  };
}

function isTitleParagraph(node: any, paragraphIndex: number, encounteredTable: boolean): boolean {
  const styleId = String(node.attrs?.paragraphProperties?.styleId ?? '');
  if (styleId === 'Title' || styleId === 'Heading1') {
    return true;
  }

  const justification = String(node.attrs?.paragraphProperties?.justification ?? '');
  const runProperties = node.attrs?.paragraphProperties?.runProperties ?? {};
  const fontSize = Number(runProperties.fontSize ?? runProperties.fontSizeCs ?? 0);

  return !encounteredTable && paragraphIndex === 1 && justification === 'center' && fontSize >= 28;
}

function resolveParagraphTarget(node: any): { nodeId: string; nodeType: ParagraphNodeType } | null {
  const nodeId = resolveParagraphNodeId(node);
  if (!nodeId) {
    return null;
  }

  return {
    nodeId,
    nodeType: resolveParagraphNodeType(node),
  };
}

function resolveParagraphNodeId(node: any): string {
  const paraId = String(node.attrs?.paraId ?? '').trim();
  if (paraId) {
    return paraId;
  }

  return String(node.attrs?.sdBlockId ?? '').trim();
}

function resolveParagraphNodeType(node: any): ParagraphNodeType {
  const styleId = String(node.attrs?.paragraphProperties?.styleId ?? '').trim();
  if (getHeadingLevel(styleId) != null) {
    return 'heading';
  }

  if (isListParagraph(node.attrs)) {
    return 'listItem';
  }

  return 'paragraph';
}

function getHeadingLevel(styleId: string): number | null {
  const match = /heading\s*([1-6])/i.exec(styleId);
  if (!match) {
    return null;
  }

  const level = Number(match[1]);
  return Number.isFinite(level) ? level : null;
}

function isListParagraph(attrs: any): boolean {
  const numbering = attrs?.paragraphProperties?.numberingProperties;
  if (numbering && (numbering.numId != null || numbering.ilvl != null)) {
    return true;
  }

  const listRendering = attrs?.listRendering;
  if (listRendering?.markerText) {
    return true;
  }

  return Array.isArray(listRendering?.path) && listRendering.path.length > 0;
}

function normalizeSegmentText(text: string): string {
  return text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').trim();
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function buildInlineContext(text: string, start: number, end: number): string {
  return normalizeContextForMatch(text.slice(start, end));
}

function normalizeContextForMatch(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function toPublicSegment(segment: InternalSegment): Segment {
  return {
    segment_id: segment.segment_id,
    kind: segment.kind,
    text: segment.text,
    context_before: segment.context_before,
    context_after: segment.context_after,
    location_label: segment.location_label,
    section_path: segment.section_path,
  };
}

function toPublicMatch(match: MatchCandidateInternal): MatchCandidate {
  return {
    match_id: match.match_id,
    segment_id: match.segment_id,
    matched_text: match.matched_text,
    context_before: match.context_before,
    context_after: match.context_after,
    location_label: match.location_label,
    kind: match.kind,
  };
}

function toTitleCandidate(segment: InternalSegment): MatchCandidate {
  return {
    match_id: `${segment.segment_id}:title`,
    segment_id: segment.segment_id,
    matched_text: segment.text,
    context_before: segment.context_before,
    context_after: segment.context_after,
    location_label: segment.location_label,
    kind: segment.kind,
  };
}

function toSegmentMatchCandidate(segment: InternalSegment): MatchCandidate {
  return {
    match_id: `${segment.segment_id}:paragraph`,
    segment_id: segment.segment_id,
    matched_text: segment.text,
    context_before: segment.context_before,
    context_after: segment.context_after,
    location_label: segment.location_label,
    kind: segment.kind,
  };
}
