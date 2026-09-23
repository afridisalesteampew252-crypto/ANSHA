import { permanentRedirect } from 'next/navigation';

export default function InsightsRedirectPage() {
  permanentRedirect('/blog');
}
