import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { siteConfig } from '@/lib/site-config';
import { InstallAppButton } from '@/components/pwa/install-prompt';

export function SiteFooter() {
  return (
    <footer className="section-ink-band min-w-0 max-w-full overflow-x-clip border-t border-white/10 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] text-white lg:pb-0">
      <div className="h-0.5 w-full bg-[#d21e1e]" />
      <div className="container-page py-10 sm:py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              href="/"
              className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Ansha Trading home"
            >
              <Image
                src="/images/ansha-logo-transparent.webp"
                alt="Ansha Trading Co. LLC-FZ"
                width={200}
                height={99}
                sizes="200px"
                className="h-14 w-auto max-w-[200px] object-contain sm:h-16"
              />
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/60">
              Global exporter of vehicles and automotive parts from Dubai.
            </p>
            <a
              href={`https://wa.me/${siteConfig.whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-[#128C7E] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              <MessageCircle className="h-4 w-4" />
              Chat on WhatsApp
            </a>
            <div className="mt-3">
              <InstallAppButton
                className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                label={`Install ${siteConfig.pwaName}`}
              />
            </div>
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/45">
              <span className="h-0.5 w-4 rounded-full bg-accent" />
              Browse
            </h3>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:block sm:space-y-2">
              <li><Link href="/parts" className="inline-flex min-h-9 items-center text-white/70 hover:text-accent">All Parts</Link></li>
              <li><Link href="/vehicles" className="inline-flex min-h-9 items-center text-white/70 hover:text-accent">Vehicles</Link></li>
              <li><Link href="/machinery" className="inline-flex min-h-9 items-center text-white/70 hover:text-accent">Machinery &amp; trucks</Link></li>
              <li><Link href="/#export-markets" className="inline-flex min-h-9 items-center text-white/70 hover:text-accent">Export markets</Link></li>
              <li><Link href="/categories" className="inline-flex min-h-9 items-center text-white/70 hover:text-accent">Categories</Link></li>
              <li><Link href="/about" className="inline-flex min-h-9 items-center text-white/70 hover:text-accent">About Us</Link></li>
              <li><Link href="/blog" className="inline-flex min-h-9 items-center text-white/70 hover:text-accent">Insights</Link></li>
              <li><Link href="/reviews" className="inline-flex min-h-9 items-center text-white/70 hover:text-accent">Reviews</Link></li>
              <li><Link href="/offers" className="inline-flex min-h-9 items-center text-white/70 hover:text-accent">Deals &amp; Offers</Link></li>
              <li><Link href="/contact" className="inline-flex min-h-9 items-center text-white/70 hover:text-accent">Contact</Link></li>
              <li><Link href="/banking" className="inline-flex min-h-9 items-center text-white/70 hover:text-accent">Banking Details</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/45">
              <span className="h-0.5 w-4 rounded-full bg-accent" />
              Contact
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-start gap-2.5 text-white/70">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <a href={`tel:${siteConfig.phone}`} className="hover:text-accent">{siteConfig.phone}</a>
              </li>
              <li className="flex items-start gap-2.5 text-white/70">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <a href={`mailto:${siteConfig.email}`} className="break-all hover:text-accent">{siteConfig.email}</a>
              </li>
              <li className="flex items-start gap-2.5 text-white/70">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>{siteConfig.address}</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/45">
              <span className="h-0.5 w-4 rounded-full bg-accent" />
              Access
            </h3>
            <div className="space-y-1 text-sm">
              <Link href="/portal" className="flex min-h-9 items-center gap-1.5 text-white/70 hover:text-accent">
                Customer portal
                <ArrowRight className="h-3 w-3" />
              </Link>
              <Link href="/admin" className="flex min-h-9 items-center gap-1.5 text-white/70 hover:text-accent">
                Staff login
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-5 text-center text-sm text-white/45 sm:mt-10 sm:flex-row sm:text-left">
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
