import Link from 'next/link';
import Image from 'next/image';
import { Phone, Mail, MapPin, ArrowRight, MessageCircle } from 'lucide-react';
import { siteConfig } from '@/lib/site-config';

export function SiteFooter() {
  return (
    <footer className="relative isolate overflow-hidden bg-black text-white">
      <Image
        src="/images/ansha-global-vehicles-parts-banner.webp"
        alt=""
        fill
        sizes="100vw"
        className="-z-20 object-cover object-center opacity-35"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/70 via-black/90 to-black/95" />
      {/* Top accent line */}
      <div className="h-0.5 w-full bg-accent" />

      <div className="container-page py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Link href="/" className="group inline-flex items-center rounded-md bg-white p-2 transition-transform group-hover:scale-[1.02]" aria-label="Ansha Trading Co. - Parts & Accessories home">
              <Image
                src="/images/ansha-trading-logo.jpg"
                alt="Ansha Trading Co. - Parts & Accessories"
                width={888}
                height={429}
                className="h-16 w-auto object-contain sm:h-20"
              />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
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
            <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50">
              <span className="h-0.5 w-4 bg-accent rounded-full" />
              Browse
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/parts" className="inline-block text-white/70 transition-colors hover:translate-x-0.5 hover:text-white">All Parts</Link></li>
              <li><Link href="/vehicles" className="inline-block text-white/70 transition-colors hover:translate-x-0.5 hover:text-white">Vehicles</Link></li>
              <li><Link href="/categories" className="inline-block text-white/70 transition-colors hover:translate-x-0.5 hover:text-white">Categories</Link></li>
              <li><Link href="/about" className="inline-block text-white/70 transition-colors hover:translate-x-0.5 hover:text-white">About Us</Link></li>
              <li><Link href="/blog" className="inline-block text-white/70 transition-colors hover:translate-x-0.5 hover:text-white">Blog</Link></li>
              <li><Link href="/contact" className="inline-block text-white/70 transition-colors hover:translate-x-0.5 hover:text-white">Contact</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50">
              <span className="h-0.5 w-4 bg-accent rounded-full" />
              Contact
            </h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2.5 text-white/70">
                <Phone className="h-4 w-4 shrink-0 mt-0.5 text-accent/70" />
                <a href={`tel:${siteConfig.phone}`} className="transition-colors hover:text-white">{siteConfig.phone}</a>
              </li>
              <li className="flex items-start gap-2.5 text-white/70">
                <Mail className="h-4 w-4 shrink-0 mt-0.5 text-accent/70" />
                <a href={`mailto:${siteConfig.email}`} className="transition-colors hover:text-white">{siteConfig.email}</a>
              </li>
              <li className="flex items-start gap-2.5 text-white/70">
                <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-accent/70" />
                <span>{siteConfig.address}</span>
              </li>
            </ul>
          </div>

          {/* Staff Access */}
          <div>
            <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50">
              <span className="h-0.5 w-4 bg-accent rounded-full" />
              Staff Access
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/admin" className="inline-flex items-center gap-1.5 text-white/70 transition-colors hover:text-white">
                  Admin Login
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/15 pt-6 text-sm text-white/50 sm:flex-row">
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
