import { SavedListPage } from '@/components/public/saved-list-page';

export const metadata = {
  title: 'Favorites',
  robots: { index: false, follow: false },
};

export default function FavoritesPage() {
  return <SavedListPage mode="favorites" />;
}
