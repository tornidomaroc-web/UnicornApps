'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { langCookieString, type Lang } from '@/lib/i18n/initial-lang'
type LanguageContextType = {
  lang: Lang
  toggleLang: () => void
  t: (key: string) => string
}

const translations = {
  en: {
    // Login / Auth
    'login.signinTitle': 'Welcome back',
    'login.signinSub': 'Sign in to your UnicornApps account.',
    'login.signupTitle': 'Create your account',
    'login.signupSub': 'Start turning product photos into listings, free.',
    'login.resetTitle': 'Reset your password',
    'login.resetSub': "Enter your email and we'll send you a reset link.",
    'login.email': 'Email',
    'login.emailPlaceholder': 'you@example.com',
    'login.password': 'Password',
    'login.passwordPlaceholder': 'Your password',
    'login.newPassword': 'New password',
    'login.signinButton': 'Sign in',
    'login.signinPending': 'Signing in…',
    'login.signupButton': 'Create account',
    'login.signupPending': 'Creating account…',
    'login.resetButton': 'Send reset link',
    'login.resetPending': 'Sending…',
    'login.updateButton': 'Save new password',
    'login.updatePending': 'Saving…',
    'login.forgot': 'Forgot password?',
    'login.or': 'or',
    'login.google': 'Continue with Google',
    'login.noAccount': 'New to UnicornApps?',
    'login.createOne': 'Create an account',
    'login.haveAccount': 'Already have an account?',
    'login.signinLink': 'Sign in',
    'login.backToSignin': 'Back to sign in',
    'login.showPassword': 'Show password',
    'login.hidePassword': 'Hide password',
    'login.agreePrefix': 'By continuing you agree to our',
    'login.terms': 'Terms',
    'login.and': 'and',
    'login.privacy': 'Privacy Policy',
    'login.updateTitle': 'Choose a new password',
    'login.updateSub': 'Enter a new password for your account.',
    // Auth status messages
    'login.msg.check_email_title': 'Check your email',
    'login.msg.check_email': "Almost there, check your inbox and click the link to confirm your account, then sign in.",
    'login.action.back_to_sign_in': 'Back to sign in',
    'login.msg.reset_sent': "If an account exists for that email, we've sent a reset link. Check your inbox.",
    // Auth error messages
    'login.err.invalid_credentials': 'That email or password is incorrect. Please try again.',
    'login.err.email_not_confirmed': 'Please confirm your email first, check your inbox for the confirmation link.',
    'login.err.already_registered': 'An account with this email already exists. Try signing in instead.',
    'login.err.weak_password': 'Your password must be at least 6 characters.',
    'login.err.missing_fields': 'Please fill in every field.',
    'login.err.server_unreachable': "We can't reach the server right now. Please try again in a moment.",
    'login.err.rate_limited': 'Too many attempts. Please wait a minute and try again.',
    'login.err.captcha_failed': 'We could not confirm that you are a person. Please try again.',
    'login.err.signup_limited': 'Too many accounts were created from this network today. Please try again later.',
    'login.err.config_error': 'Something went wrong on our end. Please try again later.',
    'login.err.unknown': 'Something went wrong. Please try again.',
    'login.err.same_password': 'Your new password must be different from your current one.',
    'login.err.oauth_cancelled': 'Sign-in was cancelled. You can try again whenever you are ready.',
    'login.err.oauth_failed': "We couldn't sign you in. Please try again.",
    'login.err.link_expired': 'This link has expired or has already been used. Request a new one.',
    'login.err.session_expired': 'This sign-in expired or was opened in a different browser. Please start again in this browser.',
    'login.err.reset_session_missing': 'Your reset link has expired. Request a new one to choose a password.',
    'login.apple': 'Continue with Apple',
    'login.action.send_new_link': 'Send a new link',
    'login.confirm.recoveryTitle': 'Reset your password',
    'login.confirm.recoverySub': 'Press Continue to choose a new password.',
    'login.confirm.emailTitle': 'Confirm your email',
    'login.confirm.emailSub': 'Press Continue to confirm your email.',
    'login.confirm.button': 'Continue',
    'login.confirm.pending': 'Checking…',
    // Navbar
    'nav.home': 'Home',
    'nav.features': 'Features',
    'nav.pricing': 'Pricing',
    'nav.about': 'About',
    'nav.login': 'Login',
    'nav.getStarted': 'Get Started',
    'nav.dashboard': 'Dashboard',
    'nav.credits': 'Credits',
    'nav.account': 'Account',
    'nav.logout': 'Sign out',
    // Marketing pages (landing, features, about) and the site footer.
    'nav.menu': 'Menu',
    'nav.closeMenu': 'Close menu',
    'footer.tagline': 'Product descriptions, ready to copy.',
    'footer.legal': 'Legal',
    'footer.refund': 'Refund policy',
    'home.eyebrow': 'Free to start. 3 credits, no card.',
    'home.title': 'One photo. A full product page.',
    'home.sub': 'Upload a product photo. You get the title, description, bullet points, meta description, tags and store copy, each ready to copy in one tap. In Arabic or English.',
    'home.cta': 'Start free',
    'home.cta2': 'See what you get',
    'home.out.eyebrow': 'From one photo',
    'home.out.title': 'Every part of the product page, in its own card',
    'home.out.sub': 'Nothing hides behind a tab. Each card has its own copy button.',
    'home.out.title.name': 'Title',
    'home.out.title.desc': 'A search-ready title, up to 60 characters.',
    'home.out.desc.name': 'Product description',
    'home.out.desc.desc': 'A full description written from what the model sees in the photo.',
    'home.out.bullets.name': 'Amazon bullets',
    'home.out.bullets.desc': 'Feature bullets in the Amazon format.',
    'home.out.meta.name': 'Meta description',
    'home.out.meta.desc': 'For the search snippet, up to 160 characters.',
    'home.out.shopify.name': 'Shopify HTML',
    'home.out.shopify.desc': 'Headings, paragraphs and a feature list, ready to paste.',
    'home.out.social.name': 'TikTok / Reels hook and hashtags',
    'home.out.social.desc': 'A hook, a concept and five hashtags.',
    'home.out.data.name': 'Product data',
    'home.out.data.desc': 'Material, colour, audience and care.',
    'home.out.preview.name': 'Store previews',
    'home.out.preview.desc': 'See the copy in an Amazon-style and a Shopify-style page.',
    'home.how.eyebrow': 'How it works',
    'home.how.title': 'Three steps, one credit',
    'home.how.1.name': 'Add a photo',
    'home.how.1.desc': 'Upload one, or take it with your phone camera.',
    'home.how.2.name': 'Generate the copy',
    'home.how.2.desc': 'One generation costs one credit. You start with three.',
    'home.how.3.name': 'Copy where you need it',
    'home.how.3.desc': 'Each card copies on its own. Ask for changes in plain words.',
    'home.solo.eyebrow': 'Built for the solo seller',
    'home.solo.title': 'No team, no templates, no setup',
    'home.solo.1.name': 'One tap per part',
    'home.solo.1.desc': 'Copy the title into one store and the bullets into another. Nothing to reformat.',
    'home.solo.2.name': 'Fully in Arabic',
    'home.solo.2.desc': 'Switch the app to Arabic and the copy is written in Arabic. The whole app reads right to left.',
    'home.solo.3.name': 'Works on your phone',
    'home.solo.3.desc': 'On the web and on Android. Your history stays with your account.',
    'home.end.title': 'Start with your next product photo',
    'home.end.sub': 'Three free credits. No card.',
    'feat.eyebrow': 'Features',
    'feat.title': 'What one generation gives you',
    'feat.sub': 'Everything below comes from one photo and one credit.',
    'feat.more.title': 'And also',
    'feat.refine.name': 'Ask for changes',
    'feat.refine.desc': 'Write what you want changed, in plain words: shorter, warmer, for a different buyer. Each change costs one credit.',
    'feat.history.name': 'History and CSV',
    'feat.history.desc': 'Every generation is saved to your account. Open any one again, or export them all as a CSV file.',
    'feat.camera.name': 'Photo from the camera',
    'feat.camera.desc': 'On a phone, take the photo right inside the app.',
    'feat.lang.name': 'Arabic or English',
    'feat.lang.desc': 'The copy is written in the language of the app. Arabic displays correctly.',
    'feat.end.title': 'Try it on one photo',
    'about.eyebrow': 'About',
    'about.title': 'A small tool for one job',
    'about.sub': 'UnicornApps turns a product photo into the description your store needs. That is the whole product.',
    'about.who.title': 'Who it is for',
    'about.who.body': 'The seller who photographs, lists and answers customers alone. Writing the description takes time, and this tool writes it for them.',
    'about.how.title': 'How it is built',
    'about.how.body': 'AI from Google writes the text from your photo. Your account, credits and history are stored securely, as the privacy policy explains.',
    'about.cost.title': 'What it costs',
    'about.cost.body': 'Every account starts with three free credits. One generation costs one credit.',
    'about.cost.web': 'More credits are sold on the web site.',
    'about.contact.title': 'Contact',
    'about.contact.body': 'Questions, or a problem with your account? Write to',
    // The account screen, the public deletion page, the not-found and crash screens.
    'account.title': 'Account',
    'account.email': 'Your email',
    'account.delete.title': 'Delete account',
    'account.delete.body': 'This deletes your account, your credits and everything you generated. It cannot be undone.',
    'account.delete.start': 'I want to delete my account',
    'account.delete.confirmLabel': 'Type DELETE to confirm',
    'account.delete.submit': 'Delete my account',
    'account.delete.pending': 'Deleting…',
    'account.delete.cancel': 'Cancel',
    'account.err.session': 'Your session has ended. Sign in again, then delete your account.',
    'account.err.failed': 'We could not delete your account. Try again.',
    'account.err.subscription': 'We could not cancel your subscription, so your account was not deleted. Try again in a few minutes, or write to support@unicornapps.app and we will do it for you.',
    'del.title': 'Delete your account',
    'del.intro': 'You can delete your UnicornApps account and your data at any time, from the app or the website.',
    'del.done': 'Your account is deleted.',
    'del.how.title': 'How to delete your account',
    'del.how.1': 'Sign in to UnicornApps.',
    'del.how.2': 'Open the menu and choose Account. On a wide screen, use the person icon in the top bar.',
    'del.how.3': 'Tap "I want to delete my account", type DELETE, then tap "Delete my account".',
    'del.cta': 'Open my account',
    'del.what.title': 'What gets deleted',
    'del.what.body': 'Deleting your account removes your sign-in details, your email address, your credit balance and everything you generated. This data is erased at once and cannot be recovered. We retain no backups of deleted accounts.',
    'del.what.subscription': 'If you have a subscription, deleting your account cancels it at once, so you are not charged again.',
    'del.keep.title': 'What we keep',
    'del.keep.usage': 'We keep usage counts: when a generation ran and how large it was. They are no longer linked to you.',
    'del.keep.payments': 'If you made a purchase, its record stays: the reference, the amount and the date. It is no longer linked to your account. Deleting your account does not delete the records our payment provider holds.',
    'del.help.title': 'Need help?',
    'del.help.before': 'If you cannot sign in, email',
    'del.help.after': 'from your registered email address. We will delete your account and data within 30 days.',
    'err.notFound.title': 'Page not found',
    'err.notFound.body': 'This page does not exist, or it has moved.',
    'err.crash.title': 'Something went wrong',
    'err.crash.body': 'This page failed to load. Try again, or go back home.',
    'err.retry': 'Try again',
    'dash.loading': 'Loading your dashboard…',
    'login.msg.reset_sent_title': 'Check your email',
    'hero.title2': 'Into Global Sales',
    // Dashboard
    'dash.upload': 'Drop Your Product Image Here',
    'dash.uploadSub': 'Gemini will analyze materials, colors & audience',
    'dash.generate': 'Generate Content',
    'dash.credits': 'Credits Remaining',
    'dash.history': 'Generation History',
    'dash.uploadBtn': 'Upload Photo',
    'dash.cameraBtn': 'Take Photo',
    'dash.cameraSub': 'Use your camera',
    'dash.uploadFormat': 'JPG, PNG, WEBP',
    'dash.inputSource': 'Choose how to add your product photo',
    // The one sentence on the pre-generation screen: the action and its cost.
    // It names no platform — the result covers every platform, and the picker
    // that used to fill the placeholder is gone.
    'dash.preflight': 'Generate content · 1 credit',
    'dash.photo.selected': 'Your product photo',
    'dash.removePhoto': 'Remove photo',
    'dash.open': 'Open',
    'dash.cameraClose': 'Close camera',
    'dash.cameraCapture': 'Take the photo',
    'dash.copyMatrix': 'Copy All',
    'dash.copyLogic': 'Copy Text',
    'dash.copyCode': 'Copy Code',
    'dash.analysisComplete': 'Analysis complete. Your content is ready.',
    'dash.noCredits': 'No Credits. Upgrade to Continue',
    // Neutral, non-steering limit copy shown ONLY on the native Android surface
    // (Google Play payments policy: no price, no external checkout, no website
    // steering). Web keeps the steering strings above.
    'dash.limitReached': "You've reached your free limit.",
    'dash.noCreditsNeutral': 'You have no free credit remaining.',
    'dash.aboutItem': 'About this item',
    'dash.addToCart': 'Add to Cart',
    'dash.buyNow': 'Buy Now',
    'dash.fastShipping': 'Fast worldwide shipping',
    'dash.matrixInit': 'Welcome! Upload a product photo and we will turn it into ready-to-publish content.',
    'dash.refineSuccess': 'Done, your content has been updated.',
    'dash.cameraReady': 'Ready to Analyze',
    'dash.cameraPoint': 'Point camera at your product',
    'dash.cameraVision': 'Camera Active',
    'dash.analyzing': '⟳ Gemini is analyzing your product...',
    'dash.stealthConsole': 'Refine with AI',
    'dash.enterVector': 'Tell the AI what to change…',
    'dash.processing': 'Working on it…',
    // Shown on a 503/429 from /api/generate or /api/refine: the AI did not
    // answer in time. Shown as written on both paths; the refine path used to
    // wrap it in a generic "Error: {message}. Please try a different instruction."
    // template, which gave advice that is wrong here, and dash.limitReached is
    // also wrong (that means the user is out of credits, the opposite of this).
    'dash.aiBusy': 'Our AI is unusually busy right now. Your credit was not used — please try again in a moment.',
    'dash.timestamp': 'Date',
    'dash.exportCsv': 'Export CSV',
    'dash.noHistory': 'Your generated listings will appear here',
    'dash.noSignatures': 'Nothing here yet, generate your first listing',
    'dash.vectorSent': 'Sent',
    'dash.matrixRefined': 'Updated',
    // Deliberately states NO number. The real ceiling is not a fixed file size:
    // the image is base64-encoded (+33%) and the request limit counts headers,
    // so auth-cookie size shifts it per session. Naming "4MB" was a false claim.
    'dash.filesizeError': 'This image is too large to upload. Please try a smaller image.',
    // Any other failure whose body is not JSON (502, 504, an HTML error page),
    // plus our own routes' code-only bodies that the map in src/lib/api-error.ts
    // does NOT name: every 500 (SERVER_MISCONFIGURED, AI_UNAVAILABLE,
    // INTERNAL_ERROR) and the 400 INVALID_REQUEST. UNAUTHORIZED landed here too
    // until it got dash.sessionExpired below — its "try again" was futile advice.
    // Previously surfaced as a raw English SyntaxError.
    'dash.requestFailed': 'Something went wrong. Please try again.',
    // The 422: the model answered, but its JSON did not parse. Reaches the client
    // as a CODE, never as prose — see the code map in src/lib/api-error.ts. TWO
    // keys, not one: /api/generate has no instruction to vary, so "try a different
    // instruction" is wrong advice there and right on /api/refine. The refine
    // clause is the surviving half of the deleted dash.error (PR #64), reused
    // verbatim rather than retranslated. Both routes refund on this path
    // (`settled` stays false, so the `finally` refunds), so the credit line is true.
    'dash.formatFailed': "We couldn't format the content. Your credit was not used. Please try again.",
    'dash.refineFormatFailed': "We couldn't format the content. Your credit was not used. Please try a different instruction.",
    // 401 from either route. Previously fell through to dash.requestFailed, whose
    // "please try again" is futile here: every retry 401s too. Delivered as the
    // UNAUTHORIZED code the routes ALREADY send — the 401 fires BEFORE req.json(),
    // so the route cannot know `lang` and could not localize prose even if it tried.
    'dash.sessionExpired': 'Your session has expired. Please sign in again.',
    'dash.cameraError': 'Camera access denied. Please allow camera permissions.',
    'dash.visitStore': 'Visit the Store',
    'dash.newArrival': 'New Arrival',
    'dash.liquidData': 'Shopify-ready product content',
    'dash.liquidSig': 'Shopify HTML',
    'dash.productionHistory': 'Everything you have generated so far',
    'dash.cta.sub': 'Subscribe $9.99 ↗',
    'dash.addCredits': 'Add credits',
    'dash.cta.pack': 'Credit Pack $4.99',
    'dash.refine.prof': 'Professional',
    'dash.refine.short': 'Shorten',
    'dash.refine.luxury': 'Luxury',
    'dash.refine.gulf': 'Gulf Market',
    'dash.refine.prof.v': 'Make it more professional',
    'dash.refine.short.v': 'Make it much shorter',
    'dash.refine.luxury.v': 'Add a luxury premium tone',
    'dash.refine.gulf.v': 'Optimize for the GCC/Gulf market luxury audience',
    // Detailed Dashboard
    'dash.seo.title': 'SEO & Metadata',
    'dash.seo.target': 'SEO Title',
    'dash.seo.meta': 'Meta Description',
    'dash.seo.copy': 'Copy',
    'dash.amazon.title': 'Amazon Bullet Points',
    'dash.shopify.title': 'Shopify Integration',
    'dash.shopify.preview': 'Preview',
    'dash.shopify.code': 'HTML Code',
    'dash.social.hook': 'TikTok / Reels Hook',
    'dash.social.concept': 'Visual Concept',
    'dash.social.tags': 'Hashtags',
    'dash.data.material': 'Material',
    'dash.data.color': 'Dominant Color',
    'dash.data.audience': 'Target Audience',
    'dash.data.care': 'Care Instructions',
    'dash.amazon.live': 'Amazon Listing Preview',
    'dash.shopify.live': 'Shopify Store Preview',
    'dash.copied': 'Copied',
    'dash.block.description': 'Product description',
    'dash.block.sections': 'Sections of the result',
    'dash.preview.show': 'Show store previews',
    'dash.preview.hide': 'Hide store previews',
    'dash.tab.seo': 'SEO',
    'dash.tab.shopify': 'Shopify',
    'dash.tab.amazon': 'Amazon',
    'dash.tab.social': 'Social',
    'dash.tab.data': 'Data',
    'dash.tab.preview': 'Preview',
    'dash.tab.quantity': 'Quantity',
    'dash.tab.variant': 'Variant',
    'dash.tab.standard': 'Standard',
    // Pricing
    'pricing.title': 'Simple Pricing for Global Sellers',
    'pricing.sub': 'Start free, upgrade when you need more power.',
    'pricing.badge': 'Pricing & Plans',
    'pricing.free': 'Free',
    'pricing.free.desc': 'Try the AI on a few products. No card required.',
    'pricing.cta.free': 'Start Free',
    'pricing.popular': 'Most Popular',
    'pricing.contact.title': 'Questions before you buy?',
    'pricing.contact.cta': 'Email support',
    // Free-tier features
    'pricing.f.gen3': '3 free credits',
    'pricing.f.vision.std': 'Standard Vision Analysis',
    'pricing.f.seo.basic': 'Basic SEO Titles',
    // Signup is email + password; no payment method is ever asked for.
    'pricing.f.nocard': 'No card required',
    // Subscription ($9.99/mo). Every claim below is code-backed: the grant is a
    // plain integer increment with no ceiling and no expiry, so unused credits
    // carry over. The per-credit figures are pinned by pricing-copy.test.ts to
    // the price and credit strings, so a price change fails CI instead of
    // leaving a stale comparison on a live listing.
    'pricing.sub.name': 'Subscription',
    'pricing.sub.price': '$9.99',
    'pricing.sub.period': '/month',
    'pricing.sub.desc': '100 credits every month at about $0.10 per credit. Unused credits carry over.',
    'pricing.sub.cta': 'Subscribe',
    // Credit pack ($4.99 one-time). No expiry logic exists anywhere, but the
    // balance IS removed by account deletion (delete-account page), by a
    // refund or chargeback (terms.s4), and by termination (terms.s8) — so the
    // promise is scoped to an open account rather than an unconditional "never".
    'pricing.pack.name': 'Credit Pack',
    'pricing.pack.price': '$4.99',
    'pricing.pack.period': 'one-time',
    'pricing.pack.desc': '30 credits, one-time, no subscription. They don\'t expire while your account is open.',
    'pricing.pack.cta': 'Buy credits',
    // Shared feature lines
    'pricing.f.credits100': '100 credits per month',
    'pricing.f.percredit': 'About $0.10 per credit, vs $0.17 in the pack',
    'pricing.f.allai': 'All AI generation features',
    'pricing.f.credits30': '30 credits',
    'pricing.f.noexpiry': 'No expiry while your account is open',
    // Checkout banner (transitional; webhook applies credits asynchronously)
    'pricing.banner.success': 'Payment received, your credits will appear shortly.',
    'pricing.banner.failed': 'Payment didn\'t go through. Please try again.',
    // Checkout never opened at all — Paddle.js failed to load. Distinct from
    // banner.failed (a real declined payment). Says "refresh" deliberately: the
    // Paddle SDK caches its own failed CDN load for the life of the page, so an
    // in-page retry cannot succeed. See lib/paddle.ts.
    'pricing.banner.error': "We couldn't open the checkout. Please refresh the page and try again.",
    // Payment confirmed, but the webhook grant had not landed before the
    // reconciliation ceiling. Deliberately does NOT claim the credits arrived —
    // the count on screen has not moved, so a bare success line would be a lie.
    // The only banner allowed to claim the credits arrived: set when the
    // server-rendered count has been SEEN to move (hooks/useCreditGrantPoll.ts).
    'pricing.banner.confirmed': 'Payment received. Your credits have been added.',
    // Shown after the 24s reconciliation window with the count still unmoved.
    // Names the receipt (Paddle emails one for every paid purchase) and a way to
    // get help, and stops asking for a reload: the page now catches up by itself
    // when the tab is next focused, and on any navigation.
    'pricing.banner.successPending': "Payment received. Your credits are still on their way and will show up here once applied; Paddle has emailed your receipt. If they haven't arrived within an hour, email support@unicornapps.app with that receipt.",
    'checkout.pending': 'Opening checkout…',
    // Merchant-of-record disclosure, rendered beside every web purchase surface.
    // The receipt name and the card descriptor are Paddle ACCOUNT facts (the
    // descriptor is one account-wide field, max 10 chars), so they are quoted
    // verbatim, never paraphrased: a buyer who does not recognise the charge
    // searches for the exact string. "card statements" is deliberate — PayPal
    // shows no seller name at all, so "your statement" would be false there.
    'checkout.mor': 'Payments are processed by Paddle, our merchant of record. Your receipt is issued by Paddle under the name KnowFlow, and card statements show PADDLE.NET* KNOWFLOW.',
    // Pricing Teaser
    'pricing.teaser.title': 'Ready to Scale Your Listing Speed?',
    'pricing.teaser.cta': 'View Plan',
    'footer.rights': 'All Rights Reserved',
    'footer.nav': 'Navigation',
    'footer.privacy': 'Privacy Policy',
    'footer.terms': 'Terms of Service',

    // ── Legal pages: shared chrome (reused by privacy / terms / refund) ──
    'legal.back': 'Back to home',
    'legal.eyebrow': 'Legal Documentation',
    'legal.governing': 'This document is provided in multiple languages for your convenience. The English version is the authoritative text; in the event of any discrepancy between translations, the English version prevails.',
    'legal.contact.heading': 'Have a question about this document?',
    'legal.contact.sub': 'Write to us, and we aim to respond within 48 hours.',
    'legal.contact.cta': 'Contact us',
    // ── Privacy Policy: page-specific content ──
    'privacy.title': 'Privacy Policy',
    'privacy.version': 'Version 1.3',
    'privacy.updated': 'Last updated: October 7, 2026',
    'privacy.s1.title': 'Information We Collect',
    'privacy.s1.body': 'We collect your email address for account management and authentication. When using the AI analysis features, we process the product images you upload to generate metadata, descriptions, and content. We store each photo you submit with the content generated from it, as part of your history, until you delete your account.',
    'privacy.s2.title': 'How We Use Information',
    'privacy.s2.body': 'Collected data is primarily used to provide our core services. Gemini AI analyzes your images to create Amazon titles, Shopify descriptions, and social media hooks. Usage records, such as when each generation ran, whether it succeeded and what it cost, help us run and improve the service. We do not train any AI model on your data.',
    'privacy.s3.title': 'Data Storage',
    'privacy.s3.body': 'Your data is stored securely using industry-standard encryption and cloud infrastructure. We keep your account details, credit balance and generation history, including your photos, along with records of purchases and usage, and short-lived counters used to limit abuse.',
    'privacy.s4.title': 'Third-Party Services',
    'privacy.s4.body': 'We use the following service providers, each only for the purpose stated. Vercel hosts the website and runs our servers, so every request passes through it, including the photos you upload and your IP address. On the website only, not in the Android app, Vercel Web Analytics records page views anonymously, without third-party cookies. Google Gemini analyzes the photos and text you submit to generate your content, and Google keeps these requests and its responses for a limited period to detect and prevent misuse of its service and to meet legal obligations. Supabase handles sign-in, for which it receives your IP address to limit abuse, and stores your account, credits and generation history, including the photos you submit, as well as a one-way hash of your network address used to limit account creation. When you create an account, Cloudflare Turnstile checks that you are a person and not a bot, and receives your IP address and browser details for that check and to improve it. On the website, payments are handled by Paddle, our merchant of record, which collects your payment details directly. We send Paddle only your account ID, so that your purchase is credited to you. These providers have their own privacy standards, which we monitor for compliance.',
    'privacy.s5.title': 'Data Sharing',
    'privacy.s5.body': 'UnicornApps has a strict policy against selling user data to third parties. Your information is only shared with essential service providers (like payment processors or AI engines) as required to deliver our services, or when legally mandated by law enforcement.',
    'privacy.s6.title': 'Security',
    'privacy.s6.body': 'We implement reasonable technical and organizational measures to protect your information from unauthorized access, loss, or alteration. This includes TLS encryption and secure API communication.',
    'privacy.s7.title': 'User Rights',
    'privacy.s7.body': 'You have the right to access, update, or delete your personal information at any time. You can delete your account from your Account page, or ask us by email to do it. This deletes your sign-in details, email address, credits and generation history, including your photos. Records of purchases and usage are kept with the link to your account removed.',
    'privacy.s8.title': 'Contact',
    'privacy.s8.body': 'If you have any questions or concerns regarding this Privacy Policy, please contact us at support@unicornapps.app. We aim to respond to all privacy-related inquiries within 48 business hours.',
    'privacy.s9.title': 'Updates',
    'privacy.s9.body': 'This Privacy Policy may change as we introduce new features or respond to legal requirements. We will notify users of significant changes via the email address associated with their account.',
    // ── Terms of Service: page-specific content ──
    'terms.title': 'Terms of Service',
    'terms.version': 'Version 1.2',
    'terms.updated': 'Effective date: April 1, 2026',
    'terms.s1.title': 'Acceptance of Terms',
    'terms.s1.body': 'By using UnicornApps, you agree to these Terms of Service. If you do not agree, please do not use the platform.',
    'terms.s2.title': 'Use of Service',
    'terms.s2.body': 'UnicornApps is an AI-powered tool for generating product descriptions from images. You may use it only for lawful purposes.',
    'terms.s3.title': 'User Accounts',
    'terms.s3.body': 'You are responsible for maintaining the confidentiality of your account credentials and all activity under your account.',
    'terms.s4.title': 'Credits & Payments',
    'terms.s4.body': 'Payments are processed securely via Paddle. Pricing may change with prior notice. If a purchase is refunded or charged back, the credits granted by that purchase are removed from your account in full, regardless of how many of them you have already used; if your balance is lower than the amount granted, it is reduced to zero. A refunded subscription charge also ends Pro access immediately. Refund eligibility, including our 14-day refund guarantee, is described in our Refund Policy.',
    'terms.s5.title': 'Intellectual Property',
    'terms.s5.body': 'All generated content belongs to the user. UnicornApps retains no rights over your generated descriptions or uploaded images.',
    'terms.s6.title': 'Prohibited Use',
    'terms.s6.body': 'You may not use UnicornApps to process illegal, harmful, or offensive content. Abuse will result in immediate account termination.',
    'terms.s7.title': 'Limitation of Liability',
    'terms.s7.body': 'UnicornApps is provided "as is". We are not liable for any indirect or consequential damages arising from use of the service.',
    'terms.s8.title': 'Termination',
    'terms.s8.body': 'We reserve the right to suspend or terminate accounts that violate these terms without prior notice.',
    'terms.s9.title': 'Contact',
    'terms.s9.body': 'For questions about these Terms, contact us at: support@unicornapps.app',
    // Terms-specific contact chrome: carries the acceptance acknowledgment, so it
    // deliberately does NOT reuse the generic legal.contact.heading / .sub.
    'terms.contact.heading': 'Acceptance agreement',
    'terms.contact.sub': 'By continuing to use UnicornApps, you acknowledge and agree to these terms.',
    // ── Refund Policy: page-specific content ──
    'refund.title': 'Refund Policy',
    'refund.version': 'Version 1.0',
    'refund.updated': 'Effective date: April 20, 2026',
    'refund.s1.title': 'Overview',
    'refund.s1.body': "At UnicornApps, we stand behind the quality of our AI-powered e-commerce tools. We want you to be completely satisfied with your purchase, and we've designed our refund policy to be as transparent and user-friendly as possible.",
    'refund.s2.title': 'Eligibility (14 Days)',
    'refund.s2.body': "We offer a full refund within 14 days of purchase, no questions asked. Whether you've used our services or not, if you are not satisfied within the first 14 days, you are eligible for a complete reimbursement of your payment.",
    'refund.s3.title': 'How to Request',
    'refund.s3.body': 'To request a refund, simply contact us at support@unicornapps.app. Please include the email address associated with your account and your order number to help us process your request quickly.',
    'refund.s4.title': 'Processing Time',
    'refund.s4.body': 'Once your refund request is received, it will be processed immediately. The funds will typically appear in your original payment method within 5-10 business days, depending on your bank or credit card provider.',
  },
  ar: {
    // Login / Auth
    'login.signinTitle': 'مرحبًا بعودتك',
    'login.signinSub': 'سجّل الدخول إلى حسابك في UnicornApps.',
    'login.signupTitle': 'أنشئ حسابك',
    'login.signupSub': 'ابدأ بتحويل صور منتجاتك إلى أوصاف جاهزة، مجانًا.',
    'login.resetTitle': 'إعادة تعيين كلمة المرور',
    'login.resetSub': 'أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة التعيين.',
    'login.email': 'البريد الإلكتروني',
    'login.emailPlaceholder': 'you@example.com',
    'login.password': 'كلمة المرور',
    'login.passwordPlaceholder': 'كلمة المرور الخاصة بك',
    'login.newPassword': 'كلمة المرور الجديدة',
    'login.signinButton': 'تسجيل الدخول',
    'login.signinPending': 'جارٍ تسجيل الدخول…',
    'login.signupButton': 'إنشاء حساب',
    'login.signupPending': 'جارٍ إنشاء الحساب…',
    'login.resetButton': 'إرسال رابط إعادة التعيين',
    'login.resetPending': 'جارٍ الإرسال…',
    'login.updateButton': 'حفظ كلمة المرور الجديدة',
    'login.updatePending': 'جارٍ الحفظ…',
    'login.forgot': 'هل نسيت كلمة المرور؟',
    'login.or': 'أو',
    'login.google': 'المتابعة باستخدام Google',
    'login.noAccount': 'جديد على UnicornApps؟',
    'login.createOne': 'أنشئ حسابًا',
    'login.haveAccount': 'هل لديك حساب بالفعل؟',
    'login.signinLink': 'تسجيل الدخول',
    'login.backToSignin': 'العودة إلى تسجيل الدخول',
    'login.showPassword': 'إظهار كلمة المرور',
    'login.hidePassword': 'إخفاء كلمة المرور',
    'login.agreePrefix': 'بالمتابعة، فإنك توافق على',
    'login.terms': 'الشروط',
    'login.and': 'و',
    'login.privacy': 'سياسة الخصوصية',
    'login.updateTitle': 'اختر كلمة مرور جديدة',
    'login.updateSub': 'أدخل كلمة مرور جديدة لحسابك.',
    // Auth status messages
    'login.msg.check_email_title': 'تحقّق من بريدك',
    'login.msg.check_email': 'اقتربت من الانتهاء، تحقّق من بريدك الإلكتروني واضغط على الرابط لتأكيد حسابك، ثم سجّل الدخول.',
    'login.action.back_to_sign_in': 'العودة إلى تسجيل الدخول',
    'login.msg.reset_sent': 'إذا كان هناك حساب مرتبط بهذا البريد، فقد أرسلنا إليك رابط إعادة التعيين. تحقّق من بريدك.',
    // Auth error messages
    'login.err.invalid_credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة. حاول مرة أخرى.',
    'login.err.email_not_confirmed': 'يرجى تأكيد بريدك الإلكتروني أولًا، تحقّق من بريدك بحثًا عن رابط التأكيد.',
    'login.err.already_registered': 'يوجد حساب مرتبط بهذا البريد بالفعل. جرّب تسجيل الدخول بدلًا من ذلك.',
    'login.err.weak_password': 'يجب أن تتكوّن كلمة المرور من ٦ أحرف على الأقل.',
    'login.err.missing_fields': 'يرجى ملء جميع الحقول.',
    'login.err.server_unreachable': 'يتعذّر علينا الوصول إلى الخادم حاليًا. يرجى المحاولة بعد قليل.',
    'login.err.rate_limited': 'محاولات كثيرة جدًا. يرجى الانتظار دقيقة ثم المحاولة مجددًا.',
    'login.err.captcha_failed': 'تعذّر التأكد من أنك شخص حقيقي. يرجى المحاولة مرة أخرى.',
    'login.err.signup_limited': 'أُنشئت حسابات كثيرة من هذه الشبكة اليوم. يرجى المحاولة لاحقًا.',
    'login.err.config_error': 'حدث خطأ من جانبنا. يرجى المحاولة لاحقًا.',
    'login.err.unknown': 'حدث خطأ ما. يرجى المحاولة مرة أخرى.',
    'login.err.same_password': 'يجب أن تختلف كلمة المرور الجديدة عن كلمة المرور الحالية.',
    'login.err.oauth_cancelled': 'أُلغي تسجيل الدخول. يمكنك المحاولة مجددًا متى شئت.',
    'login.err.oauth_failed': 'تعذّر تسجيل دخولك. يرجى المحاولة مرة أخرى.',
    'login.err.link_expired': 'انتهت صلاحية هذا الرابط أو سبق استخدامه. اطلب رابطًا جديدًا.',
    'login.err.session_expired': 'انتهت صلاحية جلسة الدخول، أو فُتحت في متصفح آخر. ابدأ من جديد في هذا المتصفح.',
    'login.err.reset_session_missing': 'انتهت صلاحية رابط إعادة التعيين. اطلب رابطًا جديدًا لاختيار كلمة المرور.',
    'login.apple': 'المتابعة باستخدام Apple',
    'login.action.send_new_link': 'إرسال رابط جديد',
    'login.confirm.recoveryTitle': 'إعادة تعيين كلمة المرور',
    'login.confirm.recoverySub': 'اضغط متابعة لاختيار كلمة مرور جديدة.',
    'login.confirm.emailTitle': 'تأكيد بريدك',
    'login.confirm.emailSub': 'اضغط متابعة لتأكيد بريدك.',
    'login.confirm.button': 'متابعة',
    'login.confirm.pending': 'جارٍ التحقق…',
    // Navbar
    'nav.home': 'الرئيسية',
    'nav.features': 'المميزات',
    'nav.pricing': 'الأسعار',
    'nav.about': 'من نحن',
    'nav.login': 'تسجيل الدخول',
    'nav.getStarted': 'ابدأ الآن',
    'nav.dashboard': 'لوحة التحكم',
    'nav.credits': 'رصيد',
    'nav.account': 'الحساب',
    'nav.logout': 'تسجيل الخروج',
    // Marketing pages (landing, features, about) and the site footer.
    'nav.menu': 'القائمة',
    'nav.closeMenu': 'إغلاق القائمة',
    'footer.tagline': 'أوصاف منتجات جاهزة للنسخ.',
    'footer.legal': 'قانوني',
    'footer.refund': 'سياسة الاسترداد',
    'home.eyebrow': 'ابدأ مجاناً. 3 أرصدة، بلا بطاقة.',
    'home.title': 'صورة واحدة. صفحة منتج كاملة.',
    'home.sub': 'ارفع صورة المنتج، وستحصل على العنوان والوصف والنقاط والوصف التعريفي والوسوم ونص المتجر، كل جزء جاهز للنسخ بضغطة واحدة. بالعربية أو الإنجليزية.',
    'home.cta': 'ابدأ مجاناً',
    'home.cta2': 'شاهد ما ستحصل عليه',
    'home.out.eyebrow': 'من صورة واحدة',
    'home.out.title': 'كل جزء من صفحة المنتج في بطاقة مستقلة',
    'home.out.sub': 'لا شيء مخفي خلف تبويب. لكل بطاقة زرّ نسخ خاص بها.',
    'home.out.title.name': 'العنوان',
    'home.out.title.desc': 'عنوان جاهز للبحث، حتى 60 حرفاً.',
    'home.out.desc.name': 'وصف المنتج',
    'home.out.desc.desc': 'وصف كامل مكتوب مما يراه النموذج في الصورة.',
    'home.out.bullets.name': 'نقاط Amazon',
    'home.out.bullets.desc': 'نقاط الميزات بصيغة Amazon.',
    'home.out.meta.name': 'الوصف التعريفي',
    'home.out.meta.desc': 'لمقتطف البحث، حتى 160 حرفاً.',
    'home.out.shopify.name': 'HTML لمتجر Shopify',
    'home.out.shopify.desc': 'عناوين وفقرات وقائمة ميزات، جاهزة للصق.',
    'home.out.social.name': 'افتتاحية TikTok / Reels ووسوم',
    'home.out.social.desc': 'افتتاحية، وفكرة، وخمسة وسوم.',
    'home.out.data.name': 'بيانات المنتج',
    'home.out.data.desc': 'المادة واللون والجمهور والعناية.',
    'home.out.preview.name': 'معاينات المتجر',
    'home.out.preview.desc': 'شاهد النص في صفحة بأسلوب Amazon وأخرى بأسلوب Shopify.',
    'home.how.eyebrow': 'كيف يعمل',
    'home.how.title': 'ثلاث خطوات، رصيد واحد',
    'home.how.1.name': 'أضف صورة',
    'home.how.1.desc': 'ارفعها، أو التقطها بكاميرا هاتفك.',
    'home.how.2.name': 'أنشئ المحتوى',
    'home.how.2.desc': 'كل توليد يكلّف رصيداً واحداً. تبدأ بثلاثة.',
    'home.how.3.name': 'انسخ حيث تحتاج',
    'home.how.3.desc': 'كل بطاقة تُنسخ وحدها. اطلب تعديلاً بكلمات بسيطة.',
    'home.solo.eyebrow': 'مصمم للبائع المستقل',
    'home.solo.title': 'بلا فريق، بلا قوالب، بلا إعداد',
    'home.solo.1.name': 'ضغطة لكل جزء',
    'home.solo.1.desc': 'انسخ العنوان إلى متجر والنقاط إلى آخر. لا شيء يحتاج إعادة تنسيق.',
    'home.solo.2.name': 'عربيّ بالكامل',
    'home.solo.2.desc': 'حوّل التطبيق إلى العربية فيُكتب النص بالعربية. التطبيق كله يُقرأ من اليمين إلى اليسار.',
    'home.solo.3.name': 'يعمل على هاتفك',
    'home.solo.3.desc': 'على الويب وعلى Android. سجلك يبقى مع حسابك.',
    'home.end.title': 'ابدأ بصورة منتجك التالية',
    'home.end.sub': 'ثلاثة أرصدة مجانية. بلا بطاقة.',
    'feat.eyebrow': 'المميزات',
    'feat.title': 'ما يمنحك إياه توليد واحد',
    'feat.sub': 'كل ما يلي يأتي من صورة واحدة ورصيد واحد.',
    'feat.more.title': 'وأيضاً',
    'feat.refine.name': 'اطلب تعديلات',
    'feat.refine.desc': 'اكتب ما تريد تغييره بكلمات بسيطة: أقصر، أدفأ، لمشترٍ مختلف. كل تعديل يكلّف رصيداً واحداً.',
    'feat.history.name': 'السجل وملف CSV',
    'feat.history.desc': 'كل توليد يُحفظ في حسابك. افتح أيّاً منها من جديد، أو صدّرها كلها كملف CSV.',
    'feat.camera.name': 'صورة من الكاميرا',
    'feat.camera.desc': 'على الهاتف، التقط الصورة داخل التطبيق مباشرة.',
    'feat.lang.name': 'العربية أو الإنجليزية',
    'feat.lang.desc': 'يُكتب النص بلغة التطبيق، والعربية تظهر سليمة.',
    'feat.end.title': 'جرّبه على صورة واحدة',
    'about.eyebrow': 'من نحن',
    'about.title': 'أداة صغيرة لمهمة واحدة',
    'about.sub': 'يحوّل UnicornApps صورة المنتج إلى الوصف الذي يحتاجه متجرك. هذا هو المنتج كله.',
    'about.who.title': 'لمن هو',
    'about.who.body': 'البائع الذي يصوّر ويعرض ويردّ على العملاء وحده. كتابة الوصف تأخذ وقته، وهذه الأداة تكتبه عنه.',
    'about.how.title': 'كيف بُني',
    'about.how.body': 'يكتب الذكاء الاصطناعي من Google النصّ من صورتك. حسابك ورصيدك وسجلّك محفوظة بأمان، كما تشرح سياسة الخصوصية.',
    'about.cost.title': 'كم يكلّف',
    'about.cost.body': 'كل حساب يبدأ بثلاثة أرصدة مجانية. التوليد الواحد يكلّف رصيداً واحداً.',
    'about.cost.web': 'تُباع أرصدة إضافية على موقع الويب.',
    'about.contact.title': 'تواصل',
    'about.contact.body': 'سؤال، أو مشكلة في حسابك؟ راسلنا على',
    // The account screen, the public deletion page, the not-found and crash screens.
    'account.title': 'الحساب',
    'account.email': 'بريدك الإلكتروني',
    'account.delete.title': 'حذف الحساب',
    'account.delete.body': 'يحذف هذا حسابك ورصيدك وكل ما أنشأته. لا يمكن التراجع عن ذلك.',
    'account.delete.start': 'أريد حذف حسابي',
    'account.delete.confirmLabel': 'اكتب كلمة «حذف» للتأكيد',
    'account.delete.submit': 'احذف حسابي',
    'account.delete.pending': 'جارٍ الحذف…',
    'account.delete.cancel': 'إلغاء',
    'account.err.session': 'انتهت جلستك. سجّل الدخول من جديد، ثم احذف حسابك.',
    'account.err.failed': 'تعذّر حذف حسابك. حاول مرة أخرى.',
    'account.err.subscription': 'تعذّر إلغاء اشتراكك، لذلك لم نحذف حسابك. حاول مرة أخرى بعد بضع دقائق، أو راسلنا على support@unicornapps.app وسنتولى ذلك عنك.',
    'del.title': 'حذف حسابك',
    'del.intro': 'يمكنك حذف حسابك في UnicornApps وبياناتك في أي وقت، من التطبيق أو من الموقع.',
    'del.done': 'تم حذف حسابك.',
    'del.how.title': 'كيف تحذف حسابك',
    'del.how.1': 'سجّل الدخول إلى UnicornApps.',
    'del.how.2': 'افتح القائمة واختر «الحساب». على الشاشة العريضة، استخدم أيقونة الشخص في الشريط العلوي.',
    'del.how.3': 'اضغط «أريد حذف حسابي»، واكتب كلمة «حذف»، ثم اضغط «احذف حسابي».',
    'del.cta': 'افتح حسابي',
    'del.what.title': 'ما الذي يُحذف',
    'del.what.body': 'حذف الحساب يزيل بيانات الدخول وبريدك الإلكتروني ورصيدك وكل ما أنشأته. تُمحى هذه البيانات فوراً ولا يمكن استرجاعها. ولا نحتفظ بنسخ احتياطية للحسابات المحذوفة.',
    // TODO-LEGAL-REVIEW: machine-assisted Arabic for a billing statement ('del.what.subscription').
    'del.what.subscription': 'إذا كان لديك اشتراك، فإن حذف حسابك يلغيه فوراً، فلا يُخصم منك أي مبلغ بعد ذلك.',
    'del.keep.title': 'ما الذي نحتفظ به',
    'del.keep.usage': 'نحتفظ بأرقام الاستخدام: متى جرى التوليد وما حجمه. ولا تبقى مرتبطة بك.',
    'del.keep.payments': 'إذا أجريت عملية شراء، يبقى سجلّها: المرجع والمبلغ والتاريخ. ولا يبقى مرتبطاً بحسابك. وحذف الحساب لا يحذف السجلات التي يحتفظ بها مزوّد الدفع.',
    'del.help.title': 'تحتاج مساعدة؟',
    'del.help.before': 'إذا تعذّر عليك تسجيل الدخول، راسلنا على',
    'del.help.after': 'من بريدك المسجّل. وسنحذف حسابك وبياناتك خلال 30 يوماً.',
    'err.notFound.title': 'الصفحة غير موجودة',
    'err.notFound.body': 'هذه الصفحة غير موجودة، أو تم نقلها.',
    'err.crash.title': 'حدث خطأ',
    'err.crash.body': 'تعذّر تحميل هذه الصفحة. حاول مرة أخرى، أو عُد إلى الرئيسية.',
    'err.retry': 'حاول مرة أخرى',
    'dash.loading': 'جارٍ تحميل لوحة التحكم…',
    'login.msg.reset_sent_title': 'تحقّق من بريدك',
    'hero.title2': 'إلى مبيعات عالمية',
    // Dashboard
    'dash.upload': 'أسقط صورة منتجك هنا',
    'dash.uploadSub': 'سيقوم Gemini بتحليل المواد والألوان والجمهور المستهدف',
    // Shortened to match the English ("Generate Content"). The previous string said
    // "...with artificial intelligence", which the English never claimed.
    // 🔴 THE REASON IS FIDELITY, NOT FIT — this is the faithful translation, not a
    // truncation to make it fit, and it stands on that alone. It also stopped a clip
    // (417px inside a 371px overflow-hidden button) at the 32px step the button briefly
    // carried, but that step is gone and the old string would fit again at today's size.
    // Do not restore the longer string on the grounds that it now fits: it was never
    // shortened to fit.
    'dash.generate': 'توليد المحتوى',
    'dash.credits': 'الرصيد المتبقي',
    'dash.history': 'سجل العمليات',
    'dash.uploadBtn': 'رفع صورة',
    'dash.cameraBtn': 'التقاط صورة',
    'dash.cameraSub': 'استخدم الكاميرا',
    'dash.uploadFormat': 'JPG, PNG, WEBP',
    'dash.inputSource': 'اختر طريقة إضافة صورة منتجك',
    // Counterpart of the EN 'dash.preflight' note: no platform named.
    'dash.preflight': 'توليد المحتوى، رصيد واحد',
    'dash.photo.selected': 'صورة منتجك',
    'dash.removePhoto': 'إزالة الصورة',
    'dash.open': 'فتح',
    'dash.cameraClose': 'إغلاق الكاميرا',
    'dash.cameraCapture': 'التقاط الصورة',
    'dash.copyMatrix': 'نسخ الكل',
    'dash.copyLogic': 'نسخ النص',
    'dash.copyCode': 'نسخ الكود',
    'dash.analysisComplete': 'اكتمل التحليل. المحتوى جاهز.',
    'dash.noCredits': 'نفد رصيدك. رقِّ خطّتك للمتابعة.',
    // Native-only neutral limit copy (see English block) — no steering.
    'dash.limitReached': 'لقد بلغتَ الحدّ المجاني.',
    'dash.noCreditsNeutral': 'نفد رصيدك المجانيّ.',
    'dash.aboutItem': 'حول هذا المنتج',
    'dash.addToCart': 'أضف إلى السلة',
    'dash.buyNow': 'اشتري الآن',
    'dash.fastShipping': 'شحن دولي سريع',
    'dash.matrixInit': 'مرحباً! ارفع صورة منتجك وسنحوّلها إلى محتوى جاهز للنشر.',
    'dash.refineSuccess': 'تم، جرى تحديث المحتوى بنجاح.',
    'dash.cameraReady': 'جاهز للتحليل',
    'dash.cameraPoint': 'وجه الكاميرا نحو المنتج',
    'dash.cameraVision': 'الكاميرا نشطة',
    'dash.analyzing': 'Gemini يقوم بتحليل منتجك...',
    'dash.stealthConsole': 'التحسين بالذكاء الاصطناعي',
    'dash.enterVector': 'أخبر المساعد بما تريد تعديله…',
    'dash.processing': 'جارٍ المعالجة…',
    // Counterpart of the EN 'dash.aiBusy' note above.
    'dash.aiBusy': 'الخدمة مزدحمة أكثر من المعتاد الآن. لم يُخصم من رصيدك شيء، فحاول مرّة أخرى بعد قليل.',
    'dash.timestamp': 'التاريخ',
    'dash.exportCsv': 'تصدير CSV',
    'dash.noHistory': 'ستظهر منتجاتك المُولَّدة هنا',
    'dash.noSignatures': 'لا يوجد شيء هنا بعد، أنشئ أول محتوى لك',
    'dash.vectorSent': 'تم الإرسال',
    'dash.matrixRefined': 'تم التحديث',
    // Counterparts of the EN 'dash.filesizeError' / 'dash.requestFailed' notes above.
    'dash.filesizeError': 'هذه الصورة كبيرة جداً للرفع. يرجى تجربة صورة أصغر.',
    'dash.requestFailed': 'حدث خطأ ما. يرجى المحاولة مرة أخرى.',
    // Counterparts of the EN 'dash.formatFailed' / 'dash.refineFormatFailed' /
    // 'dash.sessionExpired' notes above.
    'dash.formatFailed': 'تعذّر تنسيق المحتوى. لم يُخصم من رصيدك شيء. يرجى المحاولة مرّة أخرى.',
    'dash.refineFormatFailed': 'تعذّر تنسيق المحتوى. لم يُخصم من رصيدك شيء. يرجى تجربة تعليمات مختلفة.',
    'dash.sessionExpired': 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرّة أخرى.',
    'dash.cameraError': 'تم رفض الوصول إلى الكاميرا. يرجى السماح بأذونات الكاميرا.',
    'dash.visitStore': 'زيارة المتجر',
    'dash.newArrival': 'وصل حديثاً',
    'dash.liquidData': 'محتوى منتج جاهز لـ Shopify',
    'dash.liquidSig': 'كود Shopify HTML',
    'dash.productionHistory': 'كل ما قمت بتوليده حتى الآن',
    'dash.cta.sub': 'اشترك بـ 9.99$ ↗',
    'dash.addCredits': 'إضافة أرصدة',
    'dash.cta.pack': 'حزمة أرصدة 4.99$',
    'dash.refine.prof': 'احترافي',
    'dash.refine.short': 'تقصير',
    'dash.refine.luxury': 'فاخر',
    'dash.refine.gulf': 'سوق الخليج',
    'dash.refine.prof.v': 'اجعله أكثر احترافية',
    'dash.refine.short.v': 'اجعله أقصر بكثير',
    'dash.refine.luxury.v': 'أضف نبرة فاخرة ومميزة',
    'dash.refine.gulf.v': 'حسّنه لجمهور سوق الخليج الفاخر',
    // Detailed Dashboard
    'dash.seo.title': 'SEO والبيانات الوصفية',
    'dash.seo.target': 'عنوان SEO',
    'dash.seo.meta': 'الوصف التعريفي',
    'dash.seo.copy': 'نسخ',
    'dash.amazon.title': 'النقاط التسويقية لأمازون',
    'dash.shopify.title': 'تكامل شوبيفاي',
    'dash.shopify.preview': 'معاينة',
    'dash.shopify.code': 'كود HTML',
    'dash.social.hook': 'افتتاحية TikTok / Reels',
    'dash.social.concept': 'المفهوم البصري',
    'dash.social.tags': 'الوسوم',
    'dash.data.material': 'الخامة',
    'dash.data.color': 'اللون السائد',
    'dash.data.audience': 'الجمهور المستهدف',
    'dash.data.care': 'تعليمات العناية',
    'dash.amazon.live': 'معاينة قائمة Amazon',
    'dash.shopify.live': 'معاينة متجر Shopify',
    'dash.copied': 'تم النسخ',
    'dash.block.description': 'وصف المنتج',
    'dash.block.sections': 'أقسام النتيجة',
    'dash.preview.show': 'عرض معاينات المتجر',
    'dash.preview.hide': 'إخفاء معاينات المتجر',
    'dash.tab.seo': 'SEO',
    'dash.tab.shopify': 'شوبيفاي',
    'dash.tab.amazon': 'أمازون',
    'dash.tab.social': 'سوشيال',
    'dash.tab.data': 'بيانات',
    'dash.tab.preview': 'معاينة',
    'dash.tab.quantity': 'الكمية',
    'dash.tab.variant': 'النوع',
    'dash.tab.standard': 'قياسي',
    // Pricing
    'pricing.title': 'أسعار بسيطة للبائعين العالميين',
    'pricing.sub': 'ابدأ مجاناً، وارتقِ بخطّتك حين تحتاج إلى المزيد.',
    'pricing.badge': 'الأسعار والخطط',
    'pricing.free': 'مجاني',
    'pricing.free.desc': 'جرّب الذكاء الاصطناعي على بعض المنتجات. لا حاجة إلى بطاقة.',
    'pricing.cta.free': 'ابدأ مجاناً',
    'pricing.popular': 'الأكثر شيوعاً',
    'pricing.contact.title': 'لديك سؤال قبل الشراء؟',
    'pricing.contact.cta': 'راسل الدعم',
    // Free-tier features
    'pricing.f.gen3': '3 أرصدة مجانية',
    'pricing.f.vision.std': 'تحليل بصريّ قياسيّ',
    'pricing.f.seo.basic': 'عناوين SEO أساسية',
    // Operator-reviewed pricing copy (free/sub/pack descriptions and feature lines).
    'pricing.f.nocard': 'لا حاجة إلى بطاقة',
    // Subscription ($9.99/mo)
    'pricing.sub.name': 'الاشتراك الشهري',
    'pricing.sub.price': '$9.99',
    'pricing.sub.period': 'شهرياً',
    'pricing.sub.desc': '100 رصيد كل شهر بنحو $0.10 للرصيد الواحد. الأرصدة غير المستخدمة تبقى في حسابك.',
    'pricing.sub.cta': 'اشترك الآن',
    // Credit pack ($4.99 one-time)
    'pricing.pack.name': 'حزمة أرصدة',
    'pricing.pack.price': '$4.99',
    'pricing.pack.period': 'دفعة واحدة',
    'pricing.pack.desc': '30 رصيداً بدفعة واحدة ومن دون اشتراك. لا تنتهي صلاحيتها ما دام حسابك مفتوحاً.',
    'pricing.pack.cta': 'اشترِ أرصدة',
    // Shared feature lines
    'pricing.f.credits100': '100 رصيد شهرياً',
    'pricing.f.percredit': 'نحو $0.10 للرصيد الواحد، مقابل $0.17 في الحزمة',
    'pricing.f.allai': 'جميع ميزات التوليد بالذكاء الاصطناعي',
    'pricing.f.credits30': '30 رصيداً',
    'pricing.f.noexpiry': 'لا تنتهي الصلاحية ما دام حسابك مفتوحاً',
    // Checkout banner (transitional; webhook applies credits asynchronously)
    'pricing.banner.success': 'تم استلام الدفع، وستظهر أرصدتك قريباً.',
    'pricing.banner.failed': 'لم تتمّ عملية الدفع. يُرجى المحاولة مرة أخرى.',
    'pricing.banner.error': 'تعذّر فتح صفحة الدفع، ولم يُخصم منك أيّ مبلغ. أعد تحميل الصفحة ثمّ حاول مرّة أخرى.',
    // Operator-reviewed checkout copy ('pricing.banner.confirmed' / '.successPending').
    'pricing.banner.confirmed': 'تمّ استلام الدفع، وأُضيفت أرصدتك إلى حسابك.',
    'pricing.banner.successPending': 'تمّ استلام الدفع. لا تزال أرصدتك في طريقها إليك وستظهر هنا فور إضافتها، وقد أرسلت Paddle إيصالك بالبريد الإلكتروني. إذا لم تصل خلال ساعة، راسلنا على support@unicornapps.app وأرفق الإيصال.',
    // TODO-LEGAL-REVIEW n/a. UI copy, but still machine-assisted Arabic (item 20).
    // SCOPE: 'checkout.pending' ONLY. 'pricing.banner.error' and
    // 'pricing.banner.successPending' above were operator-reviewed in 13b2ff6 (PR #60)
    // and are NOT covered by this marker.
    'checkout.pending': 'جارٍ فتح صفحة الدفع…',
    // Operator-reviewed. "البائع الرسميّ لهذا الطلب" is deliberate: a literal
    // calque of "merchant of record" reads as jargon to an Arabic buyer.
    'checkout.mor': 'يتمّ الدفع عبر Paddle، وهي البائع الرسميّ لهذا الطلب. يصلك الإيصال من Paddle باسم KnowFlow، ويظهر المبلغ في كشف البطاقة باسم PADDLE.NET* KNOWFLOW.',
    // Pricing Teaser
    'pricing.teaser.title': 'جاهز لتسريع قوائم منتجاتك؟',
    'pricing.teaser.cta': 'عرض الباقة',
    'footer.rights': 'جميع الحقوق محفوظة',
    'footer.nav': 'روابط',
    'footer.privacy': 'سياسة الخصوصية',
    'footer.terms': 'شروط الخدمة',

    // ── Legal pages: shared chrome (reused by privacy / terms / refund) ──
    // TODO-LEGAL-REVIEW: The Arabic legal strings below (legal.* + privacy.*) are
    // MACHINE-GENERATED DRAFTS. They must be reviewed by a qualified legal/Arabic
    // translation professional before being treated as authoritative. Per
    // legal.governing, the English version prevails in case of any discrepancy.
    'legal.back': 'العودة إلى الرئيسية',
    'legal.eyebrow': 'الوثائق القانونية',
    'legal.governing': 'تُقدَّم هذه الوثيقة بعدّة لغات لتسهيل الاطّلاع عليها. تظلّ النسخة الإنجليزية هي النصّ المُلزِم، وفي حال وجود أي تعارض بين الترجمات تسود النسخة الإنجليزية.',
    'legal.contact.heading': 'هل لديك سؤال حول هذه الوثيقة؟',
    'legal.contact.sub': 'راسلنا، ونسعى إلى الردّ خلال 48 ساعة.',
    'legal.contact.cta': 'تواصل معنا',
    // ── Privacy Policy: page-specific content (machine-generated draft, see above) ──
    'privacy.title': 'سياسة الخصوصية',
    'privacy.version': 'الإصدار 1.3',
    'privacy.updated': 'آخر تحديث: 7 أكتوبر 2026',
    'privacy.s1.title': 'المعلومات التي نجمعها',
    'privacy.s1.body': 'نجمع عنوان بريدك الإلكتروني لإدارة الحساب والمصادقة. وعند استخدام ميزات التحليل بالذكاء الاصطناعي، نعالج صور المنتجات التي ترفعها لإنشاء البيانات الوصفية والأوصاف والمحتوى. ونحتفظ بكل صورة ترسلها مع المحتوى المُنشأ منها ضمن سجلّك، إلى أن تحذف حسابك.',
    'privacy.s2.title': 'كيف نستخدم المعلومات',
    'privacy.s2.body': 'تُستخدم البيانات المجموعة بشكل أساسي لتقديم خدماتنا الجوهرية. يحلّل نظام Gemini صورك لإنشاء عناوين Amazon وأوصاف Shopify ومنشورات وسائل التواصل الاجتماعي. وتساعدنا سجلات الاستخدام، مثل وقت تنفيذ كل عملية إنشاء ونجاحها وتكلفتها، على تشغيل الخدمة وتحسينها. ولا ندرّب أي نموذج ذكاء اصطناعي على بياناتك.',
    'privacy.s3.title': 'تخزين البيانات',
    'privacy.s3.body': 'تُخزَّن بياناتك بأمان باستخدام تشفير وبنية سحابية وفق معايير الصناعة. ونحتفظ ببيانات حسابك ورصيدك وسجلّ المحتوى المُنشأ، بما في ذلك صورك، إلى جانب سجلات المشتريات والاستخدام، وعدّادات قصيرة الأمد تُستخدم للحدّ من إساءة الاستخدام.',
    'privacy.s4.title': 'خدمات الأطراف الثالثة',
    'privacy.s4.body': 'نستعين بمزوّدي الخدمات التالين، كلٌّ منهم للغرض المذكور فقط. تستضيف Vercel الموقع الإلكتروني وتشغّل خوادمنا، لذا يمرّ عبرها كل طلب، بما في ذلك الصور التي ترفعها وعنوان IP الخاص بك. وعلى الموقع الإلكتروني فقط، لا في تطبيق Android، تسجّل Vercel Web Analytics مشاهدات الصفحات دون تحديد هويتك ودون ملفات تعريف ارتباط تابعة لجهات خارجية. ويحلّل Google Gemini الصور والنصوص التي ترسلها لإنشاء المحتوى الخاص بك، وتحتفظ Google بهذه الطلبات وبردودها مدةً محدودة لاكتشاف إساءة استخدام خدمتها ومنعها وللوفاء بالالتزامات القانونية. وتتولّى Supabase تسجيل الدخول، وتتلقّى لذلك عنوان IP الخاص بك للحدّ من إساءة الاستخدام، وتخزّن حسابك وأرصدتك وسجلّ المحتوى المُنشأ، بما في ذلك الصور التي ترسلها، إضافةً إلى قيمة تجزئة أحادية الاتجاه لعنوان شبكتك تُستخدم للحدّ من إنشاء الحسابات. وعند إنشاء حساب، تتحقّق Cloudflare Turnstile من أنك إنسان لا برنامج آلي، وتتلقّى عنوان IP الخاص بك وبيانات متصفّحك لإجراء هذا التحقّق وتحسينه. وعلى الموقع الإلكتروني، تتولّى Paddle، البائع الرسمي لدينا، معالجة المدفوعات وتجمع بيانات الدفع منك مباشرةً. ولا نرسل إلى Paddle سوى معرّف حسابك، لإضافة مشترياتك إلى حسابك. ولهذه الجهات معايير خصوصية خاصة بها نراقب الالتزام بها.',
    'privacy.s5.title': 'مشاركة البيانات',
    'privacy.s5.body': 'تتّبع UnicornApps سياسة صارمة تمنع بيع بيانات المستخدمين لأطراف ثالثة. ولا تُشارَك معلوماتك إلا مع مزوّدي الخدمات الأساسيين (مثل معالِجات الدفع أو محرّكات الذكاء الاصطناعي) بالقدر اللازم لتقديم خدماتنا، أو عند وجود إلزام قانوني من جهات إنفاذ القانون.',
    'privacy.s6.title': 'الأمان',
    'privacy.s6.body': 'نطبّق تدابير تقنية وتنظيمية معقولة لحماية معلوماتك من الوصول غير المصرّح به أو الفقدان أو التغيير. ويشمل ذلك تشفير TLS والاتصال الآمن عبر واجهات البرمجة.',
    'privacy.s7.title': 'حقوق المستخدم',
    'privacy.s7.body': 'يحقّ لك الوصول إلى معلوماتك الشخصية أو تحديثها أو حذفها في أي وقت. ويمكنك حذف حسابك من صفحة الحساب، أو أن تطلب منّا ذلك عبر البريد الإلكتروني. ويؤدي ذلك إلى حذف بيانات تسجيل الدخول وعنوان بريدك الإلكتروني وأرصدتك وسجلّ المحتوى المُنشأ، بما في ذلك صورك. أمّا سجلات المشتريات والاستخدام فنحتفظ بها بعد إزالة ارتباطها بحسابك.',
    'privacy.s8.title': 'التواصل',
    'privacy.s8.body': 'إذا كان لديك أي أسئلة أو مخاوف بخصوص سياسة الخصوصية هذه، يُرجى التواصل معنا على support@unicornapps.app. ونهدف إلى الرد على جميع الاستفسارات المتعلقة بالخصوصية خلال 48 ساعة عمل.',
    'privacy.s9.title': 'التحديثات',
    'privacy.s9.body': 'قد تتغيّر سياسة الخصوصية هذه مع إطلاق ميزات جديدة أو استجابةً للمتطلبات القانونية. وسنُخطر المستخدمين بأي تغييرات جوهرية عبر البريد الإلكتروني المرتبط بحساباتهم.',
    // ── Terms of Service: page-specific content ──
    // TODO-LEGAL-REVIEW: The Arabic terms.* strings below are MACHINE-GENERATED
    // DRAFTS and must be reviewed by a qualified legal/Arabic translation
    // professional before being treated as authoritative. Per legal.governing,
    // the English version prevails in case of any discrepancy.
    'terms.title': 'شروط الخدمة',
    'terms.version': 'الإصدار 1.2',
    'terms.updated': 'تاريخ السريان: 1 أبريل 2026',
    'terms.s1.title': 'قبول الشروط',
    'terms.s1.body': 'باستخدامك UnicornApps فإنك توافق على شروط الخدمة هذه. وإذا كنت لا توافق عليها، فيُرجى عدم استخدام المنصّة.',
    'terms.s2.title': 'استخدام الخدمة',
    'terms.s2.body': 'UnicornApps أداة مدعومة بالذكاء الاصطناعي لإنشاء أوصاف المنتجات من الصور. ولا يجوز لك استخدامها إلا للأغراض المشروعة.',
    'terms.s3.title': 'حسابات المستخدمين',
    'terms.s3.body': 'أنت مسؤول عن الحفاظ على سرّية بيانات اعتماد حسابك وعن جميع الأنشطة التي تجري من خلاله.',
    'terms.s4.title': 'الأرصدة والمدفوعات',
    'terms.s4.body': 'تُعالَج المدفوعات بأمان عبر Paddle. وقد تتغيّر الأسعار بعد إشعار مسبق. وفي حال ردّ قيمة عملية شراء أو الاعتراض عليها لدى مُصدِر البطاقة، تُزال الأرصدة الممنوحة بموجب تلك العملية من حسابك بالكامل، بصرف النظر عن عدد الأرصدة التي استخدمتها منها؛ وإذا كان رصيدك أقلّ من المقدار الممنوح فيُخفَّض إلى صفر. كما ينتهي اشتراك Pro فورًا عند ردّ قيمة دورة اشتراك. وتُوضَّح أحقّية الاسترداد، بما في ذلك ضمان الاسترداد خلال 14 يومًا، في سياسة الاسترداد.',
    'terms.s5.title': 'الملكية الفكرية',
    'terms.s5.body': 'جميع المحتويات المُنشأة مملوكة للمستخدم. ولا تحتفظ UnicornApps بأي حقوق على الأوصاف التي تنشئها أو الصور التي ترفعها.',
    'terms.s6.title': 'الاستخدامات المحظورة',
    'terms.s6.body': 'لا يجوز لك استخدام UnicornApps لمعالجة أي محتوى غير قانوني أو ضارّ أو مسيء. وستؤدّي إساءة الاستخدام إلى إنهاء الحساب فورًا.',
    'terms.s7.title': 'حدود المسؤولية',
    'terms.s7.body': 'تُقدَّم خدمة UnicornApps «كما هي». ولسنا مسؤولين عن أي أضرار غير مباشرة أو تبعية تنشأ عن استخدام الخدمة.',
    'terms.s8.title': 'إنهاء الحساب',
    'terms.s8.body': 'نحتفظ بالحق في تعليق أو إنهاء الحسابات التي تخالف هذه الشروط دون إشعار مسبق.',
    'terms.s9.title': 'التواصل',
    'terms.s9.body': 'للاستفسار عن هذه الشروط، تواصل معنا على: support@unicornapps.app',
    // Terms-specific contact chrome: carries the acceptance acknowledgment, so it
    // deliberately does NOT reuse the generic legal.contact.heading / .sub.
    'terms.contact.heading': 'إقرار بالموافقة',
    'terms.contact.sub': 'باستمرارك في استخدام UnicornApps، فإنك تُقرّ بهذه الشروط وتوافق عليها.',
    // ── Refund Policy: page-specific content ──
    // TODO-LEGAL-REVIEW: The Arabic refund.* strings below are MACHINE-GENERATED
    // DRAFTS and must be reviewed by a qualified legal/Arabic translation
    // professional before being treated as authoritative. Per legal.governing,
    // the English version prevails in case of any discrepancy.
    'refund.title': 'سياسة الاسترداد',
    'refund.version': 'الإصدار 1.0',
    'refund.updated': 'تاريخ السريان: 20 أبريل 2026',
    'refund.s1.title': 'نظرة عامة',
    'refund.s1.body': 'في UnicornApps نقف خلف جودة أدواتنا للتجارة الإلكترونية المدعومة بالذكاء الاصطناعي. ونريدك أن تكون راضيًا تمامًا عن عملية الشراء، ولذلك صمّمنا سياسة الاسترداد لتكون شفافة وسهلة الاستخدام قدر الإمكان.',
    'refund.s2.title': 'أحقّية الاسترداد (14 يومًا)',
    'refund.s2.body': 'نوفّر استردادًا كاملًا خلال 14 يومًا من تاريخ الشراء، دون أي أسئلة. وسواء استخدمت خدماتنا أم لم تستخدمها، إذا لم تكن راضيًا خلال الأيام الأربعة عشر الأولى فأنت مؤهّل لاسترداد كامل المبلغ الذي دفعته.',
    'refund.s3.title': 'كيفية تقديم الطلب',
    'refund.s3.body': 'لطلب الاسترداد، تواصل معنا ببساطة على support@unicornapps.app. ويُرجى تضمين عنوان البريد الإلكتروني المرتبط بحسابك ورقم طلبك لمساعدتنا على معالجة طلبك بسرعة.',
    'refund.s4.title': 'مدّة المعالجة',
    'refund.s4.body': 'بمجرّد استلام طلب الاسترداد ستتم معالجته على الفور. وتظهر الأموال عادةً في وسيلة الدفع الأصلية خلال 5 إلى 10 أيام عمل، تبعًا للبنك أو مُصدِر بطاقة الائتمان.',
  },
}

const LanguageContext = createContext<LanguageContextType | null>(null)

export function LanguageProvider({
  children,
  initialLang,
}: {
  children: ReactNode
  /**
   * Chosen by the server (lib/i18n/initial-lang.ts) from the cookie or the
   * device's Accept-Language, and already applied to <html lang> and
   * <body dir lang> in the server HTML. Starting from it here means the first
   * paint is in the right language and hydration changes nothing. It used to be
   * a hard-coded 'en', which is why the app forgot Arabic on every launch.
   */
  initialLang: Lang
}) {
  const [lang, setLang] = useState<Lang>(initialLang)
  const toggleLang = () =>
    setLang((prev) => {
      const next: Lang = prev === 'en' ? 'ar' : 'en'
      // The toggle is the only thing that writes the cookie: a device-language
      // default is recomputed each visit, an explicit choice sticks for a year.
      document.cookie = langCookieString(next, window.location.protocol === 'https:')
      return next
    })
  const t = (key: string) => translations[lang][key as keyof typeof translations['en']] || key

  // <body> and <html> are rendered by the server layout, outside this tree, so
  // a toggle has to reach them by hand. On mount this re-applies what the
  // server already set (a no-op); on toggle it flips them. Keeping dir on
  // <body> is what lets anything rendered at body level (a dialog, a toast)
  // inherit RTL without knowing about this provider.
  useEffect(() => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.body.setAttribute('dir', dir)
    document.body.setAttribute('lang', lang)
    document.documentElement.setAttribute('lang', lang)
  }, [lang])

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t }}>
      {/* The wrapper stays: globals.css keys the Arabic letter-spacing rule on a
          [dir] ancestor, and its test pins that. Removing this would not break
          the rule (body now carries dir too) but nothing would be gained. */}
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
