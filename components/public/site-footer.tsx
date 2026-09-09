import Link from 'next/link';
import { Phone, Mail, MapPin, ArrowRight } from 'lucide-react';
import { siteConfig } from '@/lib/site-config';

export function SiteFooter() {
  return (
    <footer className="bg-foreground text-background">
      <div className="container-page py-14">
        <div className="grid gap-10 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-background">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-foreground" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-base font-extrabold tracking-tight">
                  ANSHA<span className="text-background/50"> TRADING</span>
                </span>
                <span className="text-[10px] font-medium uppercase tracking-widest text-background/40">Auto Spare Parts</span>
              </div>
            </Link>
            <p className="mt-4 text-sm text-background/60 leading-relaxed">
              {siteConfig.description}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-background/40 mb-4">Browse</h3>
            <ul className="space-y-3 text-sm">
              <li><Link href="/parts" className="text-background/70 transition-colors hover:text-background">All Parts</Link></li>
              <li><Link href="/categories" className="text-background/70 transition-colors hover:text-background">Categories</Link></li>
              <li><Link href="/about" className="text-background/70 transition-colors hover:text-background">About Us</Link></li>
              <li><Link href="/contact" className="text-background/70 transition-colors hover:text-background">Contact</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-background/40 mb-4">Contact</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2.5 text-background/70">
                <Phone className="h-4 w-4 shrink-0 text-background/40" />
                <a href={`tel:${siteConfig.phone}`} className="transition-colors hover:text-background">{siteConfig.phone}</a>
              </li>
              <li className="flex items-center gap-2.5 text-background/70">
                <Mail className="h-4 w-4 shrink-0 text-background/40" />
                <a href={`mailto:${siteConfig.email}`} className="transition-colors hover:text-background">{siteConfig.email}</a>
              </li>
              <li className="flex items-center gap-2.5 text-background/70">
                <MapPin className="h-4 w-4 shrink-0 text-background/40" />
                <span>{siteConfig.address}</span>
              </li>
            </ul>
          </div>

          {/* Admin */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-background/40 mb-4">Staff Access</h3>
            <ul className="space-y-3 text-sm">
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
          <p>Premium automotive spare parts supplier</p>
        </div>
      </div>
    </footer>
  );
}
