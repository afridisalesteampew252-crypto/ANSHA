'use client';

import { useEffect, useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { EXPORT_MASTER_KIND_LABELS, type ExportMasterKind, type ExportMasterOption } from '@/lib/export-masters';
import { supabase } from '@/lib/supabase/client';

type Props = {
  kind: ExportMasterKind;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  allowCustom?: boolean;
};

/**
 * Select from Configuration export masters. Optionally allow typing a custom value
 * (stored as free text on the shipment header).
 */
export function ExportMasterSelect({ kind, value, onChange, disabled, id, allowCustom = true }: Props) {
  const [options, setOptions] = useState<ExportMasterOption[]>([]);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('export_master_options')
        .select('*')
        .eq('kind', kind)
        .eq('is_active', true)
        .order('sort_order')
        .order('name');
      setOptions((data || []) as ExportMasterOption[]);
    })();
  }, [kind]);

  const names = useMemo(() => options.map((o) => o.name), [options]);
  const valueInList = !value || names.includes(value);

  useEffect(() => {
    if (value && !names.includes(value) && names.length > 0) setCustom(true);
  }, [value, names]);

  const showCustom = allowCustom && (custom || (!valueInList && !!value));

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{EXPORT_MASTER_KIND_LABELS[kind]}</Label>
      {showCustom ? (
        <input
          id={id}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Type ${EXPORT_MASTER_KIND_LABELS[kind].toLowerCase()}…`}
        />
      ) : (
        <select
          id={id}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              setCustom(true);
              onChange('');
              return;
            }
            onChange(e.target.value);
          }}
        >
          <option value="">Select…</option>
          {options.map((row) => (
            <option key={row.id} value={row.name}>
              {row.code ? `${row.name} (${row.code})` : row.name}
            </option>
          ))}
          {allowCustom ? <option value="__custom__">Other (type…)</option> : null}
        </select>
      )}
      {showCustom && allowCustom && options.length > 0 ? (
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          disabled={disabled}
          onClick={() => {
            setCustom(false);
            onChange('');
          }}
        >
          Choose from list
        </button>
      ) : null}
    </div>
  );
}
