import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import ts from 'typescript'

/**
 * The "skeleton" of a source file: its exact text with the CONTENTS of every
 * Tailwind class string blanked out. Two versions of a file have the same
 * skeleton exactly when they differ only inside class strings. Everything else
 * stays byte-for-byte: logic, imports, props, translation keys, URLs, cookie
 * names, whitespace and comments.
 *
 * A string counts as a class string when every space-separated token looks like
 * a utility and at least one token starts with a known utility stem, so a
 * hyphenated identifier ('sb-localhost-auth-token', 'content-type') is not one.
 */

const TOKEN = /^[!a-z0-9:/\[\]().%#_,&>*+~=@'-]+$/i
const STEM =
  /^(?:[a-z-]+:)*-?(?:bg|text|border|rounded|shadow|ring|outline|fill|stroke|from|via|to|font|leading|tracking|p[xytrblse]?|m[xytrblse]?|w|h|size|min|max|gap|space|divide|inset|top|bottom|left|right|start|end|z|opacity|duration|ease|delay|animate|translate|scale|rotate|blur|backdrop|grid|col|row|items|justify|content-(?:none|\[)|self|place|order|basis|aspect|object|overflow|whitespace|break|line|cursor|select|pointer|placeholder|decoration|underline|transition|flex|inline|block|hidden|absolute|relative|fixed|sticky|group|peer|uppercase|lowercase|capitalize|truncate|italic|sr|not|container|mx|my|shrink|grow|list|caret|accent|appearance|resize|touch|will|isolate|mix|filter|drop|invert|tabular|antialiased)(?:-|$)/i

export function isClassString(s: string): boolean {
  const tokens = s.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return false
  return tokens.every((t) => TOKEN.test(t)) && tokens.some((t) => STEM.test(t))
}

export function skeleton(source: string, fileName = 'x.tsx'): string {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const cuts: Array<[number, number]> = []
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (isClassString(node.text)) cuts.push([node.getStart(sf) + 1, node.end - 1])
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      // Static chunks of `...${x}...`: blank the chunk when it holds utilities.
      const open = node.getStart(sf) + 1
      const close = node.end - (ts.isTemplateTail(node) ? 1 : 2)
      if (isClassString(node.text)) cuts.push([open, close])
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  cuts.sort((a, b) => b[0] - a[0])
  let out = source
  for (const [a, b] of cuts) out = out.slice(0, a) + '§' + out.slice(b)
  return out
}

export function skeletonHash(relPath: string): string {
  const text = readFileSync(join(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n')
  return createHash('sha256').update(skeleton(text, relPath)).digest('hex').slice(0, 16)
}
