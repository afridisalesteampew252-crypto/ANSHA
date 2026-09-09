export const siteConfig = {
  name: 'ANSHATRADING',
  description:
    'Quality automotive spare parts. Search by part name, OEM number, or vehicle compatibility.',
  whatsappNumber: '0000000000',
  whatsappDisplay: '+00 000 000 0000',
  email: 'info@anshatrading.com',
  phone: '+00 000 000 0000',
  address: 'Industrial Area, City, Country',
  url: 'https://anshatrading.com',
};

export const conditionLabels: Record<string, string> = {
  new: 'New',
  used: 'Used',
  refurbished: 'Refurbished',
  'for-parts': 'For Parts',
};

export const conditionBadgeClasses: Record<string, string> = {
  new: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  used: 'bg-blue-100 text-blue-700 border-blue-200',
  refurbished: 'bg-amber-100 text-amber-700 border-amber-200',
  'for-parts': 'bg-stone-100 text-stone-600 border-stone-200',
};

export const inquiryStatusLabels: Record<string, string> = {
  new: 'New',
  read: 'Read',
  responded: 'Responded',
  closed: 'Closed',
};
