/**
 * Lite mode: the same layout without the costly paint. On a low-memory device
 * the layered clay shadows, gradient fills and page wash are swapped for flat
 * values with no blur.
 *
 * WHEN. `navigator.deviceMemory` <= 2 (GB). It is rounded and capped by the
 * browser and exists only in Chromium (Chrome, Android WebView, Edge, Opera).
 * Where it is missing, an Android device with <= 4 logical cores counts as low
 * end; anything else keeps the full skin. `localStorage.ua_lite` set to '1'
 * or '0' forces the decision either way, for testing on a real device.
 *
 * HOW. A constructed stylesheet appended to document.adoptedStyleSheets. It
 * adds no element and no attribute, so React hydration never sees it, and it
 * cascades after the page's own sheets, so its :root values win. Any failure
 * (an engine without constructable stylesheets, storage blocked) leaves the
 * full skin in place.
 *
 * The script is inlined at the top of <body> (components/Providers.tsx), so it
 * runs while the page is still parsing, before the content below it paints.
 */

const NO_BLUR_RIM = 'inset 0 1px 0 rgb(255 255 255 / 0.1)'

/** Token overrides applied in lite mode. Every shadow here has zero blur. */
export const LITE_TOKENS: Readonly<Record<string, string>> = {
  '--ua-page-image': 'none',
  '--ua-fill-btn': 'none',
  '--ua-fill-btn-hover': 'none',
  '--ua-fill-ghost': 'none',
  '--ua-fill-tap': 'none',
  '--ua-fill-icon': 'none',
  '--ua-fill-credits': 'none',
  '--ua-shadow-container': 'inset 0 1px 0 rgb(255 255 255 / 0.06)',
  '--ua-shadow-tap': NO_BLUR_RIM,
  '--ua-shadow-icon': NO_BLUR_RIM,
  '--ua-shadow-btn': 'inset 0 1px 0 rgb(255 255 255 / 0.3)',
  '--ua-shadow-ghost': NO_BLUR_RIM,
  '--ua-shadow-well': 'inset 0 0 0 1px rgb(255 255 255 / 0.06)',
  '--ua-shadow-credits': 'inset 0 1px 0 rgb(255 255 255 / 0.3)',
  '--ua-shadow-mark': 'inset 0 1px 0 rgb(255 255 255 / 0.3)',
}

export const LITE_CSS = `:root{${Object.entries(LITE_TOKENS)
  .map(([k, v]) => `${k}:${v}`)
  .join(';')}}`

export const LITE_SCRIPT = `(function(){try{var f=null;try{f=localStorage.getItem('ua_lite')}catch(e){}var n=navigator,m=n.deviceMemory,c=n.hardwareConcurrency;var lite=f==='1'||(f!=='0'&&((typeof m==='number'&&m<=2)||(typeof m!=='number'&&/Android/i.test(n.userAgent)&&typeof c==='number'&&c<=4)));if(!lite)return;var s=new CSSStyleSheet();s.replaceSync(${JSON.stringify(
  LITE_CSS
)});document.adoptedStyleSheets=document.adoptedStyleSheets.concat([s]);window.__uaLite=true}catch(e){}})();`
