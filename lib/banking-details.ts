export type BankingDetail = {
  label: string;
  value: string;
  displayLabel?: string;
  displayValue?: string;
  copyValue?: string;
};

const primaryIban = 'AE230860000009307584798';
const intermediarySwiftCodes = ['CITIUS33', 'CITIUS33XXX'] as const;

export const primaryBankDetails: readonly BankingDetail[] = [
  { label: 'Bank name', value: 'WIO BANK' },
  { label: 'Account holder', value: 'Ansha Trading Co. L.L.C-FZ' },
  { label: 'IBAN', value: primaryIban, displayValue: primaryIban.match(/.{1,4}/g)?.join(' '), copyValue: primaryIban },
  { label: 'BIC / SWIFT', value: 'WIOBAEADXXX' },
  { label: 'Routing code', value: '808610001' },
  { label: 'Bank address', value: 'Etihad Airways Centre, 5th Floor, Abu Dhabi, U.A.E.' },
] as const;

export const usdIntermediaryBankDetails: readonly BankingDetail[] = [
  { label: 'Bank name', value: 'CITI BANK NA' },
  { label: 'Account number', value: '36447154' },
  { label: 'Branch name', value: 'CITIBANK, N.A.' },
  { label: 'ABA / routing code', value: '021000089', displayLabel: 'ABA / routing' },
  {
    label: 'SWIFT code',
    value: intermediarySwiftCodes.join(' / '),
    displayValue: `${intermediarySwiftCodes.join(' or ')} (if required)`,
    copyValue: intermediarySwiftCodes[0],
  },
  { label: 'Address', value: '388 Greenwich Street, New York, NY 10013, U.S.A.' },
  { label: 'Branch code', value: '940' },
] as const;
