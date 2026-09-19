import { primaryBankDetails, usdIntermediaryBankDetails } from '@/lib/banking-details';

function Details({
  title,
  details,
  compact,
}: {
  title: string;
  details: ReadonlyArray<{ label: string; value: string }>;
  compact?: boolean;
}) {
  return (
    <section>
      <h3 className={`invoice-a4-label mb-1 ${compact ? '' : 'mb-1.5'}`}>{title}</h3>
      <dl
        className={`grid gap-x-2 gap-y-px ${
          compact ? 'text-[8.5px] leading-snug sm:grid-cols-[5.75rem_1fr]' : 'text-[11px] sm:grid-cols-[8rem_1fr]'
        }`}
      >
        {details.map((item) => (
          <div key={item.label} className="contents">
            <dt className="font-medium text-[#6b7280]">{item.label}</dt>
            <dd className="break-words font-medium text-[#111827]">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function InvoiceBankingDetails({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`invoice-a4-banking grid gap-3 border border-[#111827]/15 bg-[#f8fafc] sm:grid-cols-2 ${
        compact ? 'px-2.5 py-2' : 'rounded-xl p-4'
      }`}
    >
      <Details title="Banking details" details={primaryBankDetails} compact={compact} />
      <Details title="USD intermediary bank" details={usdIntermediaryBankDetails} compact={compact} />
    </div>
  );
}
