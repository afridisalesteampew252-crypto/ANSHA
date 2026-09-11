import Link from 'next/link';
import Image from 'next/image';
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
            <Link href="/" className="flex h-16 w-[190px] items-center overflow-hidden rounded-md bg-background transition-transform hover:scale-[1.02] sm:w-[220px]" aria-label="Ansha Trading Co. home">
              <Image
                src="/images/logo/Gemini_Generated_Image_.png"
                alt="Ansha Trading Co."
                width={1365}
                height={768}
                className="h-full w-full object-contain"
              />
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
              <li><Link href="/blog" className="text-background/70 transition-colors hover:text-background hover:translate-x-0.5 inline-block">Blog</Link></li>
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
