import { format, subMonths } from 'date-fns';
import { formatMoney } from '@/lib/money';

export const reportMoney = (value: number, currency = 'AED') => formatMoney(value, currency);

export const defaultReportFrom = () => format(subMonths(new Date(), 1), 'yyyy-MM-dd');
export const defaultReportTo = () => format(new Date(), 'yyyy-MM-dd');

export function toDateOnly(value: string | null | undefined) {
  if (!value) return '';
  return value.slice(0, 10);
}
