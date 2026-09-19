import { SavedListPage } from '@/components/public/saved-list-page';

export const metadata = {
  title: 'Inquiry cart',
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return <SavedListPage mode="cart" />;
}
