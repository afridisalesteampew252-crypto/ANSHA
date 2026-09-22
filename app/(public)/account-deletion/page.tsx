import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = {
  title: 'Account deletion | ANSHA Trading',
  description: 'Request deletion of an ANSHA customer portal account and associated personal data.',
};

export default function AccountDeletionPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <Card>
        <CardHeader>
          <ShieldCheck className="mb-2 h-9 w-9 text-accent" />
          <CardTitle className="text-2xl">Delete your ANSHA portal account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-sm text-muted-foreground">
          <p>
            Sign in to your customer portal, open Settings, and choose “Request account deletion.” This is the same
            process for web, PWA, and Android app users.
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Open the portal and sign in with the email that owns the account.</li>
            <li>Select Settings, then Request account deletion.</li>
            <li>An administrator verifies and completes the request to prevent unauthorized or fraudulent deletion.</li>
          </ol>
          <p>
            Completion removes the Supabase login and personal portal profile data. ANSHA may retain anonymized
            invoices, payment, tax, fraud-prevention, or audit records where legally required. Those records are no
            longer usable to sign in.
          </p>
          <Button asChild>
            <Link href="/portal/settings">Open portal deletion settings</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
