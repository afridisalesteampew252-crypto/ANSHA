'use client';

import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  ['en', 'English'], ['ar', 'العربية'], ['ja', '日本語'], ['zh-CN', '中文'], ['ur', 'اردو'], ['hi', 'हिन्दी'],
  ['bn', 'বাংলা'], ['ru', 'Русский'], ['fr', 'Français'], ['es', 'Español'], ['pt', 'Português'], ['de', 'Deutsch'],
  ['tr', 'Türkçe'], ['th', 'ไทย'], ['id', 'Bahasa Indonesia'], ['ms', 'Bahasa Melayu'], ['sw', 'Kiswahili'], ['fa', 'فارسی'],
] as const;

const RTL = new Set(['ar', 'ur', 'fa']);
const STORAGE_KEY = 'ansha-language';

type TranslateWindow = Window & {
  google?: { translate?: { TranslateElement?: new (options: { pageLanguage: string; includedLanguages: string; autoDisplay: boolean }, elementId: string) => unknown } };
  anshaGoogleTranslateInit?: () => void;
};

function startTranslator() {
  const translateWindow = window as TranslateWindow;
  let mount = document.getElementById('ansha-google-translate');
  if (!mount) {
    mount = document.createElement('div');
    mount.id = 'ansha-google-translate';
    mount.hidden = true;
    document.body.appendChild(mount);
  }

  translateWindow.anshaGoogleTranslateInit = () => {
    const Element = translateWindow.google?.translate?.TranslateElement;
    if (Element && !mount?.hasChildNodes()) {
      new Element({ pageLanguage: 'en', includedLanguages: LANGUAGES.map(([code]) => code).join(','), autoDisplay: false }, 'ansha-google-translate');
    }
  };

  if (translateWindow.google?.translate?.TranslateElement) translateWindow.anshaGoogleTranslateInit();
  else if (!document.getElementById('ansha-google-translate-script')) {
    const script = document.createElement('script');
    script.id = 'ansha-google-translate-script';
    script.src = 'https://translate.google.com/translate_a/element.js?cb=anshaGoogleTranslateInit';
    script.async = true;
    document.body.appendChild(script);
  }
}

export function LanguageSwitcher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) || 'en';
    setLanguage(saved);
    document.documentElement.lang = saved;
    document.documentElement.dir = RTL.has(saved) ? 'rtl' : 'ltr';
    if (saved !== 'en') startTranslator();
  }, []);

  const changeLanguage = (code: string) => {
    window.localStorage.setItem(STORAGE_KEY, code);
    document.cookie = code === 'en'
      ? 'googtrans=; path=/; max-age=0; SameSite=Lax'
      : `googtrans=/en/${code}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  };

  return (
    <label className={cn('notranslate relative inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-background/80 px-2.5 text-sm shadow-sm backdrop-blur', className)} translate="no">
      <Languages className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <span className={compact ? 'sr-only' : 'hidden font-semibold lg:inline'}>Language</span>
      <select
        aria-label="Choose website language"
        value={language}
        onChange={(event) => changeLanguage(event.target.value)}
        className={cn('h-8 cursor-pointer appearance-none bg-transparent pr-4 text-xs font-bold text-foreground outline-none', compact ? 'w-16' : 'w-20 lg:w-24')}
      >
        {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select>
    </label>
  );
}
