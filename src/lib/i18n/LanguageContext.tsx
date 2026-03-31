'use client'
import { createContext, useContext, useState, ReactNode } from 'react'

type Lang = 'en' | 'ar'
type LanguageContextType = {
  lang: Lang
  toggleLang: () => void
  t: (key: string) => string
}

const translations = {
  en: {
    // Navbar
    'nav.home': 'Home',
    'nav.features': 'Features',
    'nav.pricing': 'Pricing',
    'nav.about': 'About',
    'nav.login': 'Login',
    'nav.getStarted': 'Get Started',
    'nav.dashboard': 'Dashboard',
    'nav.credits': 'Credits',
    // Hero
    'hero.badge': 'Powered by Gemini 3.1 Vision — Now Live',
    'hero.title1': 'Turn Product Images',
    'hero.title2': 'Into Global Sales',
    'hero.sub': 'Upload any product photo. Get Amazon titles, Shopify descriptions, and viral social content — in 3 seconds.',
    'hero.cta1': 'Start Free — No Card Needed',
    'hero.cta2': 'Watch Demo',
    'hero.trust1': '1,240+ products analyzed',
    'hero.trust2': 'Amazon & Shopify ready',
    'hero.trust3': 'Free to start',
    // Dashboard
    'dash.title': 'AI Product Engine',
    'dash.upload': 'Drop Your Product Image Here',
    'dash.uploadSub': 'Gemini 3.1 Vision will analyze materials, colors & audience',
    'dash.generate': 'Ignite Matrix — Generate Content',
    'dash.credits': 'Credits Remaining',
    'dash.platform': 'Target Platform',
    'dash.history': 'Matrix Archives',
    // Pricing
    'pricing.title': 'Simple Pricing for Global Sellers',
    'pricing.sub': 'Start free, upgrade when you need more power.',
  },
  ar: {
    // Navbar
    'nav.home': 'الرئيسية',
    'nav.features': 'المميزات',
    'nav.pricing': 'الأسعار',
    'nav.about': 'من نحن',
    'nav.login': 'تسجيل الدخول',
    'nav.getStarted': 'ابدأ الآن',
    'nav.dashboard': 'لوحة التحكم',
    'nav.credits': 'رصيد',
    // Hero
    'hero.badge': 'مدعوم بـ Gemini 3.1 Vision — متاح الآن',
    'hero.title1': 'حوّل صور منتجاتك',
    'hero.title2': 'إلى مبيعات عالمية',
    'hero.sub': 'ارفع أي صورة منتج واحصل على عناوين Amazon وأوصاف Shopify ومحتوى سوشيال — في 3 ثوانٍ.',
    'hero.cta1': 'ابدأ مجاناً — بدون بطاقة',
    'hero.cta2': 'شاهد العرض',
    'hero.trust1': '+1,240 منتج تم تحليله',
    'hero.trust2': 'جاهز لـ Amazon و Shopify',
    'hero.trust3': 'مجاني للبدء',
    // Dashboard
    'dash.title': 'محرك المنتجات الذكي',
    'dash.upload': 'أسقط صورة منتجك هنا',
    'dash.uploadSub': 'سيقوم Gemini 3.1 بتحليل المواد والألوان والجمهور المستهدف',
    'dash.generate': 'توليد المحتوى بالذكاء الاصطناعي',
    'dash.credits': 'الرصيد المتبقي',
    'dash.platform': 'المنصة المستهدفة',
    'dash.history': 'سجل العمليات',
    // Pricing
    'pricing.title': 'أسعار بسيطة للبائعين العالميين',
    'pricing.sub': 'ابدأ مجاناً، وطوّر عندما تحتاج مزيداً من القوة.',
  }
}

const LanguageContext = createContext<LanguageContextType | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en')
  const toggleLang = () => setLang(prev => prev === 'en' ? 'ar' : 'en')
  const t = (key: string) => translations[lang][key as keyof typeof translations['en']] || key
  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t }}>
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} className={lang === 'ar' ? 'font-arabic' : ''}>
        {children}
      </div>
    </LanguageContext.Provider>
  )
}

export const useLang = () => {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang must be used within LanguageProvider')
  return ctx
}
