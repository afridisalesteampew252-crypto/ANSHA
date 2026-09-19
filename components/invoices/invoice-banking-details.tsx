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
      <h3 className={`mb-1.5 font-bold uppercase tracking-wider text-[#374151] ${compact ? 'text-[9px]' : 'text-xs'}`}>
        {title}
      </h3>
      <dl className={`grid gap-x-2 gap-y-0.5 ${compact ? 'text-[9px] sm:grid-cols-[6.5rem_1fr]' : 'text-[11px] sm:grid-cols-[8rem_1fr]'}`}>
        {details.map((item) => (
          <div key={item.label} className="contents">
            <dt className="font-medium text-[#6b7280]">{item.label}</dt>
            <dd className="break-words text-[#111827]">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function InvoiceBankingDetails({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`grid gap-4 border border-[#111827]/12 bg-[#f9fafb] sm:grid-cols-2 ${
        compact ? 'rounded-md p-3' : 'rounded-xl p-4'
      }`}
    >
      <Details title="Banking details" details={primaryBankDetails} compact={compact} />
      <Details title="USD intermediary bank" details={usdIntermediaryBankDetails} compact={compact} />
    </div>
  );
}
