/**
 * scripts/font-class-check.cjs, the post-deploy font check.
 *
 * Fixtures are excerpts recorded from production on 2026-10-19: the same CSS
 * file (8baa55c1e57745a8.css) served first with stale HTML from a cached build
 * (body classes f367f3 / 7de87c, defined nowhere) and then, after a redeploy
 * without the cache, with matching HTML.
 */
import * as lib from '../scripts/font-class-check.cjs'

const CSS = [
  '.__className_d8ebd1{font-family:__Inter_d8ebd1,__Inter_Fallback_d8ebd1;font-style:normal}',
  '.__className_297f6e{font-family:__IBM_Plex_Sans_Arabic_297f6e,__IBM_Plex_Sans_Arabic_Fallback_297f6e;font-style:normal}',
  '.__variable_297f6e{--font-ibm-arabic:"__IBM_Plex_Sans_Arabic_297f6e","__IBM_Plex_Sans_Arabic_Fallback_297f6e"}',
  '.__className_d8d24b{font-family:__Rubik_d8d24b,__Rubik_Fallback_d8d24b;font-weight:700;font-style:normal}',
  '.__variable_d8d24b{--font-rubik:"__Rubik_d8d24b","__Rubik_Fallback_d8d24b"}',
  '.__className_730ce9{font-family:__Rubik_730ce9;font-weight:700;font-style:normal}',
  '.__variable_730ce9{--font-rubik-ar:"__Rubik_730ce9"}',
].join('')

const page = (bodyClass: string, wrapperClass = '__variable_d8d24b __variable_730ce9') =>
  `<!DOCTYPE html><html lang="en"><head>` +
  `<link rel="stylesheet" href="/_next/static/css/8baa55c1e57745a8.css" data-precedence="next"/></head>` +
  `<body dir="ltr" lang="en" class="${bodyClass}"><div dir="ltr" lang="en" class="${wrapperClass}"></div>` +
  `<script>self.__next_f.push([1,"0:[\\"$\\",\\"$L1\\",null,{\\"buildId\\":\\"uzEAtmENzVOCWf_dBrw41\\",\\"className\\":\\"__className_ffffff\\"}]"])</script>` +
  `</body></html>`

const BROKEN = page('__className_f367f3 __variable_7de87c')
const HEALTHY = page('__className_d8ebd1 __variable_297f6e')

describe('the recorded 2026-10-19 production states', () => {
  it('FAILS the stale-cache build: body classes the CSS does not define', () => {
    const v = lib.verdict(BROKEN, [CSS])
    expect(v.ok).toBe(false)
    expect(v.missing).toEqual(['__className_f367f3', '__variable_7de87c'])
  })

  it('passes the redeployed build', () => {
    const v = lib.verdict(HEALTHY, [CSS])
    expect(v).toMatchObject({ ok: true, missing: [] })
    expect(v.used).toEqual(['__className_d8ebd1', '__variable_297f6e', '__variable_730ce9', '__variable_d8d24b'])
  })
})

describe('what the check reads', () => {
  it('reads the heading-font wrapper too, so a stale Rubik class fails', () => {
    expect(lib.verdict(page('__className_d8ebd1 __variable_297f6e', '__variable_d8d24b __variable_aaaaaa'), [CSS]).missing).toEqual([
      '__variable_aaaaaa',
    ])
  })

  it('ignores class names inside the script payload, which are not tags', () => {
    expect(lib.fontClassesOnPage(HEALTHY)).not.toContain('__className_ffffff')
  })

  it('finds the linked stylesheet and the build id', () => {
    expect(lib.stylesheetPaths(HEALTHY)).toEqual(['/_next/static/css/8baa55c1e57745a8.css'])
    expect(lib.buildIdOf(HEALTHY)).toBe('uzEAtmENzVOCWf_dBrw41')
  })

  it('does not count a longer hash that only starts with a defined one', () => {
    expect(lib.fontClassesInCss('.__className_d8ebd1a{x:1}').has('__className_d8ebd1')).toBe(false)
  })
})

describe('it never passes blind', () => {
  it('fails when the page shows no font class at all', () => {
    expect(lib.verdict('<html><body class="p-4"></body></html>', [CSS]).ok).toBe(false)
  })

  it('fails when the page links no stylesheet', () => {
    expect(lib.verdict(HEALTHY, []).ok).toBe(false)
  })
})
