import Link from 'next/link';
import { Phone, Mail, MapPin, ArrowRight, MessageCircle } from 'lucide-react';
import { siteConfig } from '@/lib/site-config';

export function SiteFooter() {
  return (
    <footer className="bg-foreground text-background">
      {/* Top accent line */}
      <div className="h-0.5 w-full bg-accent" />

      <div className="container-page py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-background">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-foreground" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-base font-extrabold tracking-tight">
                  ANSHA<span className="text-accent"> TRADING</span>
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-background/40">Auto Spare Parts</span>
              </div>
            </Link>
            <p className="mt-4 text-sm text-background/60 leading-relaxed max-w-xs">
              {siteConfig.description}
            </p>
            <a
              href={`https://wa.me/${siteConfig.whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#25D366] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Chat on WhatsApp
            </a>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-background/40 mb-4 flex items-center gap-2">
              <span className="h-0.5 w-4 bg-accent rounded-full" />
              Browse
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/parts" className="text-background/70 transition-colors hover:text-background hover:translate-x-0.5 inline-block">All Parts</Link></li>
              <li><Link href="/vehicles" className="text-background/70 transition-colors hover:text-background hover:translate-x-0.5 inline-block">Vehicles</Link></li>
              <li><Link href="/categories" className="text-background/70 transition-colors hover:text-background hover:translate-x-0.5 inline-block">Categories</Link></li>
              <li><Link href="/about" className="text-background/70 transition-colors hover:text-background hover:translate-x-0.5 inline-block">About Us</Link></li>
              <li><Link href="/contact" className="text-background/70 transition-colors hover:text-background hover:translate-x-0.5 inline-block">Contact</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-background/40 mb-4 flex items-center gap-2">
              <span className="h-0.5 w-4 bg-accent rounded-full" />
              Contact
            </h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2.5 text-background/70">
                <Phone className="h-4 w-4 shrink-0 mt-0.5 text-accent/70" />
                <a href={`tel:${siteConfig.phone}`} className="transition-colors hover:text-background">{siteConfig.phone}</a>
              </li>
              <li className="flex items-start gap-2.5 text-background/70">
                <Mail className="h-4 w-4 shrink-0 mt-0.5 text-accent/70" />
                <a href={`mailto:${siteConfig.email}`} className="transition-colors hover:text-background">{siteConfig.email}</a>
              </li>
              <li className="flex items-start gap-2.5 text-background/70">
                <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-accent/70" />
                <span>{siteConfig.address}</span>
              </li>
            </ul>
          </div>

          {/* Staff Access */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-background/40 mb-4 flex items-center gap-2">
              <span className="h-0.5 w-4 bg-accent rounded-full" />
              Staff Access
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/admin" className="inline-flex items-center gap-1.5 text-background/70 transition-colors hover:text-background">
                  Admin Login
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-background/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-background/40">
          <p>&copy; {new Date().getFullYear()} {siteConfig.name}. All rights reserved.</p>
          <p className="flex items-center gap-2">
            <span className="inline-block h-1 w-1 rounded-full bg-accent" />
            Premium automotive spare parts supplier
          </p>
        </div>
      </div>
    </footer>
  );
}
