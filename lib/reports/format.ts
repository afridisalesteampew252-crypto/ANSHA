import { format, subMonths } from 'date-fns';

export const reportMoney = (value: number, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(
    Number(value || 0)
  );

export const defaultReportFrom = () => format(subMonths(new Date(), 1), 'yyyy-MM-dd');
export const defaultReportTo = () => format(new Date(), 'yyyy-MM-dd');

export function toDateOnly(value: string | null | undefined) {
  if (!value) return '';
  return value.slice(0, 10);
}
