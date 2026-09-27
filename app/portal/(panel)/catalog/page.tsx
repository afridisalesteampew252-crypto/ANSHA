import Link from 'next/link';
import { Car, Package, Truck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const catalogs = [
  {
    href: '/parts',
    title: 'Parts stock',
    description: 'Browse published automotive parts currently available from ANSHA.',
    icon: Package,
  },
  {
    href: '/vehicles',
    title: 'Vehicle stock',
    description: 'See available passenger vehicles and export-ready inventory.',
    icon: Car,
  },
  {
    href: '/machinery',
    title: 'Machinery & trucks',
    description: 'Browse commercial vehicles, trucks, and heavy equipment.',
    icon: Truck,
  },
] as const;

export default function PortalCatalogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Browse available stock</h1>
        <p className="text-sm text-muted-foreground">
          Public stock opens in the ANSHA catalog. Your reserved items remain under Reservations. Inquiries sent while signed in appear in your account.
        </p>
      </div>
      <Link href="/portal/inquiries" className="text-sm font-semibold text-primary hover:underline">View your stock inquiries →</Link>
      <div className="grid gap-4 md:grid-cols-3">
        {catalogs.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-colors group-hover:border-accent/60">
              <CardHeader>
                <span className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-accent/10 text-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm font-semibold text-primary">Open catalog →</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
