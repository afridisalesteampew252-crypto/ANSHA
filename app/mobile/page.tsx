import { redirect } from 'next/navigation';

/** Keep the customer APK on the same mobile experience as the public website. */
export default function MobileAppEntry() {
  redirect('/');
}
