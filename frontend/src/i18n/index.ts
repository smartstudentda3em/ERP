import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ar from './ar.json';

const savedLang = localStorage.getItem('erp_lang') || 'ar';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// Press and Stationery call their cash account "الكاش مكروم". Rather than patching every screen that
// shows an account name (invoice/receipt lists, payroll, partners, expenses, commissions…), the one
// shared label is switched with the active company — so no screen can be missed or drift.
const CASH_KEY = 'treasury.paymentAccounts.CASH';
const ORIGINAL_CASH = {
  ar: (ar as any).treasury.paymentAccounts.CASH as string,
  en: (en as any).treasury.paymentAccounts.CASH as string,
};
const MAKROUM_CASH = { ar: 'الكاش مكروم', en: 'Cash (Makroum)' };
export function setCashAccountName(makroum: boolean) {
  for (const lng of ['ar', 'en'] as const) {
    const value = (makroum ? MAKROUM_CASH : ORIGINAL_CASH)[lng];
    if (i18n.getResource(lng, 'translation', CASH_KEY) !== value) i18n.addResource(lng, 'translation', CASH_KEY, value);
  }
}

export function setLanguage(lang: 'en' | 'ar') {
  i18n.changeLanguage(lang);
  localStorage.setItem('erp_lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

setLanguage(savedLang as 'en' | 'ar');

export default i18n;
