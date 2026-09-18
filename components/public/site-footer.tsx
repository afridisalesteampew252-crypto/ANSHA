import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { siteConfig } from '@/lib/site-config';

export function SiteFooter() {
  return (
    <footer className="overflow-hidden border-t border-border bg-[#f4f6f8] text-foreground">
      <div className="h-0.5 w-full bg-accent" />
      <div className="container-page py-12 sm:py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link
              href="/"
              className="inline-flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Ansha Trading home"
            >
              <Image
                src="/images/ansha-logo-transparent.webp"
                alt="Ansha Trading Co. LLC-FZ"
                width={1000}
                height={497}
                className="h-24 w-auto max-w-full object-contain sm:h-28"
              />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">{siteConfig.description}</p>
            <a
              href={`https://wa.me/${siteConfig.whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <MessageCircle className="h-4 w-4" />
              Chat on WhatsApp
            </a>
          </div>

          <div>
            <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span className="h-0.5 w-4 rounded-full bg-accent" />
              Browse
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/parts" className="text-foreground/75 hover:text-accent">All Parts</Link></li>
              <li><Link href="/vehicles" className="text-foreground/75 hover:text-accent">Vehicles</Link></li>
              <li><Link href="/categories" className="text-foreground/75 hover:text-accent">Categories</Link></li>
              <li><Link href="/about" className="text-foreground/75 hover:text-accent">About Us</Link></li>
              <li><Link href="/blog" className="text-foreground/75 hover:text-accent">Insights</Link></li>
              <li><Link href="/offers" className="text-foreground/75 hover:text-accent">Deals &amp; Offers</Link></li>
              <li><Link href="/contact" className="text-foreground/75 hover:text-accent">Contact</Link></li>
              <li><Link href="/banking" className="text-foreground/75 hover:text-accent">Banking Details</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span className="h-0.5 w-4 rounded-full bg-accent" />
              Contact
            </h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2.5 text-foreground/75">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <a href={`tel:${siteConfig.phone}`} className="hover:text-accent">{siteConfig.phone}</a>
              </li>
              <li className="flex items-start gap-2.5 text-foreground/75">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <a href={`mailto:${siteConfig.email}`} className="break-all hover:text-accent">{siteConfig.email}</a>
              </li>
              <li className="flex items-start gap-2.5 text-foreground/75">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>{siteConfig.address}</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span className="h-0.5 w-4 rounded-full bg-accent" />
              Access
            </h3>
            <div className="space-y-2 text-sm">
              <Link href="/portal" className="flex items-center gap-1.5 text-foreground/75 hover:text-accent">
                Customer portal
                <ArrowRight className="h-3 w-3" />
              </Link>
              <Link href="/admin" className="flex items-center gap-1.5 text-foreground/75 hover:text-accent">
                Staff login
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-center text-sm text-muted-foreground sm:flex-row sm:text-left">
          <p>&copy; {new Date().getFullYear()} {siteConfig.name}. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link href="/cookie-policy" className="hover:text-accent">Cookie Policy</Link>
            <p>TRN {siteConfig.taxRegistrationNumber}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
