import type { Dispatch, SetStateAction } from 'react';
import { useMemo, useState } from 'react';
import { useTamboComponentState } from '@tambo-ai/react';
import type { ContactItem, DisplayField } from './cockpit-models';

interface TenderOverviewBoardProps {
  stateKey?: string;
  variant?: 'project' | 'generic';
  title: string;
  subtitle: string;
  fields: DisplayField[];
  contacts?: ContactItem[];
  onSaveField?: (fieldPath: string, value: string) => void;
  onOpenEvidence?: (title: string, fieldPath?: string, evidence?: DisplayField['evidence']) => void;
}

export function TenderOverviewBoard({
  stateKey = 'overview',
  variant = 'generic',
  title,
  subtitle,
  fields,
  contacts = [],
  onSaveField,
  onOpenEvidence,
}: TenderOverviewBoardProps) {
  const [expandedField, setExpandedField] = useTamboComponentState<string | null>(`${stateKey}.expandedField`, null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const fieldRows = useMemo(() => fields.filter((field) => field.value || field.status !== 'missing'), [fields]);
  const fieldMap = useMemo(() => new Map(fieldRows.map((field) => [field.key, field])), [fieldRows]);

  if (variant === 'project') {
    const projectName = fieldMap.get('project_name');
    const projectCode = fieldMap.get('project_code');
    const region = fieldMap.get('region');
    const procurementMethod = fieldMap.get('procurement_method');
    const tenderer = fieldMap.get('tenderer');
    const agency = fieldMap.get('agency');

    const summaryFields = [projectCode, region, procurementMethod].filter(Boolean) as DisplayField[];
    const organizationFields = [tenderer, agency].filter(Boolean) as DisplayField[];
    const extraFields = fieldRows.filter(
      (field) =>
        !['project_name', 'project_code', 'region', 'procurement_method', 'tenderer', 'agency'].includes(field.key),
    );

    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{subtitle}</p>
            <h3 className="mt-1 text-3xl font-semibold leading-none tracking-[-0.03em] text-zinc-950">{title}</h3>
          </div>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600">
            {fieldRows.length} 个字段
          </span>
        </div>

        <div className="mt-5 space-y-4">
          {projectName && (
            <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">项目名称</p>
                  <h4 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.03em] text-zinc-950">
                    {projectName.value || '待提取项目名称'}
                  </h4>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <FieldStatusChip status={projectName.status} />
                  <button
                    type="button"
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
                    onClick={() => setExpandedField(expandedField === projectName.fieldPath ? null : projectName.fieldPath)}
                  >
                    {expandedField === projectName.fieldPath ? '收起编辑' : '编辑项目名称'}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20 disabled:opacity-40"
                    onClick={() => onOpenEvidence?.(projectName.label, projectName.fieldPath, projectName.evidence)}
                    disabled={projectName.evidence.length === 0}
                  >
                    查看证据
                  </button>
                </div>
              </div>

              {expandedField === projectName.fieldPath && (
                <div className="mt-4 max-w-3xl rounded-xl border border-zinc-200 bg-white p-3">
                  <textarea
                    className="min-h-[88px] w-full rounded-xl border border-zinc-200 px-3 py-3 text-sm text-zinc-900 outline-none transition-colors duration-200 focus:border-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-950/10"
                    value={drafts[projectName.fieldPath] ?? projectName.value}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [projectName.fieldPath]: event.target.value }))
                    }
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
                      onClick={() => onSaveField?.(projectName.fieldPath, drafts[projectName.fieldPath] ?? projectName.value)}
                    >
                      保存字段
                    </button>
                  </div>
                </div>
              )}
            </article>
          )}

          {summaryFields.length > 0 && (
            <div className="grid gap-3 md:grid-cols-3">
              {summaryFields.map((field) => (
                <CompactOverviewField
                  key={field.fieldPath}
                  field={field}
                  expandedField={expandedField}
                  drafts={drafts}
                  onToggleField={setExpandedField}
                  onDraftChange={setDrafts}
                  onSaveField={onSaveField}
                  onOpenEvidence={onOpenEvidence}
                />
              ))}
            </div>
          )}

          {organizationFields.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Procurement Parties
                  </p>
                  <h4 className="mt-1 text-lg font-semibold text-zinc-950">采购与代理主体</h4>
                </div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {organizationFields.map((field) => (
                  <OrganizationCard
                    key={field.fieldPath}
                    field={field}
                    expandedField={expandedField}
                    drafts={drafts}
                    onToggleField={setExpandedField}
                    onDraftChange={setDrafts}
                    onSaveField={onSaveField}
                    onOpenEvidence={onOpenEvidence}
                  />
                ))}
              </div>
            </div>
          )}

          {contacts.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Contacts</p>
                  <h4 className="mt-1 text-lg font-semibold text-zinc-950">项目联络信息</h4>
                </div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {contacts.map((contact) => (
                  <article key={contact.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-950">{contact.name}</p>
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          {contact.role}
                        </p>
                      </div>
                      <FieldStatusChip status={contact.status} />
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <ContactDataCell label="电话" value={contact.phone || '未提取'} />
                      <ContactDataCell label="邮箱" value={contact.email || '未提取'} />
                    </div>
                    {contact.evidence.length > 0 && (
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
                          onClick={() => onOpenEvidence?.(`${contact.role} · ${contact.name}`, undefined, contact.evidence)}
                        >
                          查看证据
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}

          {extraFields.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {extraFields.map((field) => (
                <CompactOverviewField
                  key={field.fieldPath}
                  field={field}
                  expandedField={expandedField}
                  drafts={drafts}
                  onToggleField={setExpandedField}
                  onDraftChange={setDrafts}
                  onSaveField={onSaveField}
                  onOpenEvidence={onOpenEvidence}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{subtitle}</p>
          <h3 className="mt-1 text-3xl font-semibold leading-none tracking-[-0.03em] text-zinc-950">{title}</h3>
        </div>
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600">
          {fieldRows.length} 个字段
        </span>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
        <div className="grid content-start gap-3 md:grid-cols-2">
          {fieldRows.map((field) => {
            const isOpen = expandedField === field.fieldPath;
            const draftValue = drafts[field.fieldPath] ?? field.value;
            return (
              <article key={field.fieldPath} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{field.label}</p>
                  <FieldStatusChip status={field.status} />
                </div>
                <p className="mt-3 text-sm leading-7 text-zinc-700">{field.value || '待提取'}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
                    onClick={() => setExpandedField(isOpen ? null : field.fieldPath)}
                  >
                    {isOpen ? '收起编辑' : '编辑字段'}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20 disabled:opacity-40"
                    onClick={() => onOpenEvidence?.(field.label, field.fieldPath, field.evidence)}
                    disabled={field.evidence.length === 0}
                  >
                    查看证据
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
                    <textarea
                      className="min-h-[84px] w-full rounded-xl border border-zinc-200 px-3 py-3 text-sm text-zinc-900 outline-none transition-colors duration-200 focus:border-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-950/10"
                      value={draftValue}
                      onChange={(event) =>
                        setDrafts((current) => ({ ...current, [field.fieldPath]: event.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
                      onClick={() => onSaveField?.(field.fieldPath, draftValue)}
                    >
                      保存字段
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <aside className="self-start rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Contacts</p>
          <div className="mt-3 space-y-3">
            {contacts.length === 0 && (
              <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-500">
                当前未提取到联系人信息。
              </div>
            )}
            {contacts.map((contact, index) => (
              <div key={`${contact.name}-${index}`} className="rounded-xl border border-zinc-200 bg-white px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-950">{contact.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-500">{contact.role}</p>
                  </div>
                  <FieldStatusChip status={contact.status} />
                </div>
                {(contact.phone || contact.email) && (
                  <div className="mt-3 space-y-1 text-sm text-zinc-600">
                    {contact.phone && <p>{contact.phone}</p>}
                    {contact.email && <p>{contact.email}</p>}
                  </div>
                )}
                {contact.evidence.length > 0 && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
                      onClick={() => onOpenEvidence?.(`${contact.role} · ${contact.name}`, undefined, contact.evidence)}
                    >
                      查看证据
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

function CompactOverviewField({
  field,
  expandedField,
  drafts,
  onToggleField,
  onDraftChange,
  onSaveField,
  onOpenEvidence,
}: {
  field: DisplayField;
  expandedField: string | null | undefined;
  drafts: Record<string, string>;
  onToggleField: (fieldPath: string | null) => void;
  onDraftChange: Dispatch<SetStateAction<Record<string, string>>>;
  onSaveField?: (fieldPath: string, value: string) => void;
  onOpenEvidence?: (title: string, fieldPath?: string, evidence?: DisplayField['evidence']) => void;
}) {
  const isOpen = expandedField === field.fieldPath;
  const draftValue = drafts[field.fieldPath] ?? field.value;

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{field.label}</p>
        <FieldStatusChip status={field.status} />
      </div>
      <p className="mt-3 text-base font-medium leading-7 text-zinc-900">{field.value || '待提取'}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
          onClick={() => onToggleField(isOpen ? null : field.fieldPath)}
        >
          {isOpen ? '收起编辑' : '编辑字段'}
        </button>
        <button
          type="button"
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20 disabled:opacity-40"
          onClick={() => onOpenEvidence?.(field.label, field.fieldPath, field.evidence)}
          disabled={field.evidence.length === 0}
        >
          查看证据
        </button>
      </div>
      {isOpen && (
        <div className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <textarea
            className="min-h-[84px] w-full rounded-xl border border-zinc-200 px-3 py-3 text-sm text-zinc-900 outline-none transition-colors duration-200 focus:border-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-950/10"
            value={draftValue}
            onChange={(event) => onDraftChange((current) => ({ ...current, [field.fieldPath]: event.target.value }))}
          />
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
              onClick={() => onSaveField?.(field.fieldPath, draftValue)}
            >
              保存字段
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function OrganizationCard({
  field,
  expandedField,
  drafts,
  onToggleField,
  onDraftChange,
  onSaveField,
  onOpenEvidence,
}: {
  field: DisplayField;
  expandedField: string | null | undefined;
  drafts: Record<string, string>;
  onToggleField: (fieldPath: string | null) => void;
  onDraftChange: Dispatch<SetStateAction<Record<string, string>>>;
  onSaveField?: (fieldPath: string, value: string) => void;
  onOpenEvidence?: (title: string, fieldPath?: string, evidence?: DisplayField['evidence']) => void;
}) {
  const isOpen = expandedField === field.fieldPath;
  const draftValue = drafts[field.fieldPath] ?? field.value;

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-950">{field.label}</p>
        <FieldStatusChip status={field.status} />
      </div>
      <p className="mt-3 text-lg font-semibold leading-8 text-zinc-950">{field.value || '待提取'}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
          onClick={() => onToggleField(isOpen ? null : field.fieldPath)}
        >
          {isOpen ? '收起编辑' : '编辑主体'}
        </button>
        <button
          type="button"
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors duration-200 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20 disabled:opacity-40"
          onClick={() => onOpenEvidence?.(field.label, field.fieldPath, field.evidence)}
          disabled={field.evidence.length === 0}
        >
          查看证据
        </button>
      </div>

      {isOpen && (
        <div className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <textarea
            className="min-h-[88px] w-full rounded-xl border border-zinc-200 px-3 py-3 text-sm text-zinc-900 outline-none transition-colors duration-200 focus:border-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-950/10"
            value={draftValue}
            onChange={(event) => onDraftChange((current) => ({ ...current, [field.fieldPath]: event.target.value }))}
          />
          <button
            type="button"
            className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
            onClick={() => onSaveField?.(field.fieldPath, draftValue)}
          >
            保存主体
          </button>
        </div>
      )}
    </article>
  );
}

function ContactDataCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-zinc-900">{value}</p>
    </div>
  );
}

function FieldStatusChip({ status }: { status: string }) {
  const className =
    {
      confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      user_edited: 'border-zinc-200 bg-zinc-50 text-zinc-700',
      conflicting: 'border-rose-200 bg-rose-50 text-rose-700',
      inferred: 'border-amber-200 bg-amber-50 text-amber-700',
      missing: 'border-zinc-200 bg-zinc-100 text-zinc-500',
    }[status] || 'border-zinc-200 bg-zinc-100 text-zinc-500';

  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${className}`}>{status}</span>;
}
