import { primaryBankDetails, usdIntermediaryBankDetails } from '@/lib/banking-details';

function Details({ title, details }: { title: string; details: ReadonlyArray<{ label: string; value: string }> }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h3>
      <dl className="grid gap-x-3 gap-y-1 text-[11px] sm:grid-cols-[8rem_1fr]">
        {details.map((item) => <div key={item.label} className="contents"><dt className="font-medium text-slate-500">{item.label}</dt><dd className="break-words text-slate-800">{item.value}</dd></div>)}
      </dl>
    </section>
  );
}

export function InvoiceBankingDetails() {
  return (
    <div className="grid gap-5 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
      <Details title="Banking details" details={primaryBankDetails} />
      <Details title="USD intermediary bank" details={usdIntermediaryBankDetails} />
    </div>
  );
}
