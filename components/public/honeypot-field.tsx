import { HONEYPOT_FIELD } from '@/lib/public-form-guard';

/** Visually hidden trap input for bots. Keep it out of the tab order and away from autofill. */
export function HoneypotField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -left-[10000px] top-auto h-px w-px overflow-hidden opacity-0">
      <label>
        Leave this field empty
        <input
          type="text"
          name={HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}
