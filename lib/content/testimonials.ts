export interface Testimonial {
  id: string;
  name: string;
  role: string;
  location: string;
  rating: 5 | 4;
  quote: string;
}

/** Customer-facing testimonials for the public site (not a live review feed). */
export const testimonials: Testimonial[] = [
  {
    id: 't1',
    name: 'Kwame Mensah',
    role: 'Importer',
    location: 'Accra, Ghana',
    rating: 5,
    quote:
      'We ordered a Land Cruiser Prado from Japan stock through ANSHA. Clear photos, honest condition notes, and the paperwork arrived before the vessel — that is rare in this trade.',
  },
  {
    id: 't2',
    name: 'Fatima Al-Rashid',
    role: 'Workshop manager',
    location: 'Sharjah, UAE',
    rating: 5,
    quote:
      'When we need OEM remotes and sensors for Japanese models, ANSHA usually has the right Make / Model / Year match. Saves us from guessing aftermarket fitment.',
  },
  {
    id: 't3',
    name: 'David Okonkwo',
    role: 'Spare parts trader',
    location: 'Lagos, Nigeria',
    rating: 5,
    quote:
      'Communication is straightforward. They confirm OEM numbers before shipping and do not push stock that will not fit. That alone is worth the relationship.',
  },
  {
    id: 't4',
    name: 'Hassan Ibrahim',
    role: 'Fleet buyer',
    location: 'Dubai, UAE',
    rating: 4,
    quote:
      'Sourced two Hilux units for our site fleet. Export timeline from Dubai was realistic — no overselling — and the team answered every chassis question quickly.',
  },
  {
    id: 't5',
    name: 'Amina Diallo',
    role: 'Construction procurement',
    location: 'Dakar, Senegal',
    rating: 5,
    quote:
      'We needed a used excavator with known hours. ANSHA shared inspection details and helped us decide between two machines instead of rushing a sale.',
  },
  {
    id: 't6',
    name: 'Ravi Perera',
    role: 'Auto electrician',
    location: 'Colombo, Sri Lanka',
    rating: 5,
    quote:
      'Smart keys and immobilizer parts are easy to get wrong. Their team asked for the chassis and key type first. The remote we received programmed without drama.',
  },
  {
    id: 't7',
    name: 'Joseph Mwangi',
    role: 'Used car dealer',
    location: 'Nairobi, Kenya',
    rating: 5,
    quote:
      'Auction sheet guidance helped us avoid a car with flood history. We still buy through them when we need clean Japanese stock for East Africa.',
  },
  {
    id: 't8',
    name: 'Sara Haddad',
    role: 'Parts buyer',
    location: 'Amman, Jordan',
    rating: 4,
    quote:
      'Catalog search by model year and color naming actually works. We find remotes and body parts faster than hunting through WhatsApp photo dumps.',
  },
];
