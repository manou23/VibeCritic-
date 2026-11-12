export const DEFAULT_LOCALE = 'ar' as const;

export const LOCALES = ['ar', 'en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_META: Record<Locale, {
  label: string;
  nativeName: string;
  htmlLang: string;
  direction: 'rtl' | 'ltr';
  ogLocale: string;
}> = {
  ar: {
    label: 'العربية',
    nativeName: 'العربية',
    htmlLang: 'ar',
    direction: 'rtl',
    ogLocale: 'ar_DZ',
  },
  en: {
    label: 'English',
    nativeName: 'English',
    htmlLang: 'en',
    direction: 'ltr',
    ogLocale: 'en_US',
  },
  fr: {
    label: 'Français',
    nativeName: 'Français',
    htmlLang: 'fr',
    direction: 'ltr',
    ogLocale: 'fr_FR',
  },
};

export const isLocale = (value: string): value is Locale =>
  LOCALES.includes(value as Locale);

export const localePath = (locale: Locale, path = '') => {
  const cleanPath = path.replace(/^\/+|\/+$/g, '');
  if (locale === DEFAULT_LOCALE) return cleanPath ? `/${cleanPath}/` : '/';
  return cleanPath ? `/${locale}/${cleanPath}/` : `/${locale}/`;
};

/**
 * Returns the equivalent localized path only when a translated route exists.
 * Callers should provide the known route availability; never guess a slug
 * because translated slugs may differ from the Arabic source.
 */
export const localizedPath = (
  locale: Locale,
  translatedPath: string | undefined,
) => translatedPath ? localePath(locale, translatedPath) : undefined;
