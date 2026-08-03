import {
  PARSE_FAILURE_TAG,
  RAW_SLICE_CHARS,
  formatParseFailure,
} from '@/lib/parse-failure-log'

/** The regex both routes clean with. Duplicated here ON PURPOSE — these tests must
 *  keep proving the diagnostic is correct even if the routes' pattern changes,
 *  which is exactly why the formatter measures the delta instead of re-running it. */
const clean = (text: string) => text.replace(/```json|```/gi, '').trim()

/** Pull the JSON payload back out of the emitted line. */
const parse = (line: string) => {
  expect(line.startsWith(`${PARSE_FAILURE_TAG} `)).toBe(true)
  return JSON.parse(line.slice(PARSE_FAILURE_TAG.length + 1))
}

const emit = (raw: string, finishReason?: unknown, route: 'generate' | 'refine' = 'generate') =>
  parse(formatParseFailure({ route, raw, cleaned: clean(raw), finishReason }))

describe('the defect this replaced', () => {
  /**
   * THE WHOLE POINT OF THIS CHANGE. Both routes cleaned first and logged second, so
   * a fenced response and a bare one produced BYTE-IDENTICAL log lines. No
   * amount of reading those logs could ever have told the two apart, which is
   * why no fence conclusion drawn from a log predating this is trustworthy.
   */
  it('REGRESSION: fenced and unfenced responses were indistinguishable once cleaned', () => {
    const bare = '{"title":"x"'
    const fenced = '```json\n{"title":"x"'
    expect(clean(fenced)).toBe(clean(bare))

    expect(emit(bare).strippedChars).toBe(0)
    expect(emit(fenced).strippedChars).toBeGreaterThan(0)
    expect(emit(fenced).rawHead).toContain('```json')
  })

  it('a zero strippedChars EXONERATES the regex without anyone re-reading the pattern', () => {
    const untouched = '{"title":"unterminated'
    expect(clean(untouched)).toBe(untouched)
    expect(emit(untouched).strippedChars).toBe(0)
  })

  it('reports how much the cleaning step removed, trimmed whitespace included', () => {
    const raw = '```json\n{"a":1}\n```'
    const d = emit(raw)
    expect(d.rawLength).toBe(raw.length)
    expect(d.cleanedLength).toBe(clean(raw).length)
    expect(d.strippedChars).toBe(raw.length - clean(raw).length)
  })
})

describe('one log line, always', () => {
  /**
   * Vercel splits a multi-line console.error into separate rows, which can
   * interleave with other requests. Retention is ~1h and there is no second
   * look, so a diagnostic that arrives in pieces is a diagnostic that can be
   * lost. Model output is full of newlines; escaping them is not cosmetic.
   */
  it('escapes newlines in the raw text so the whole record survives as one row', () => {
    const raw = '```json\n{\n  "title": "line one\\nline two"\n'
    const line = formatParseFailure({ route: 'generate', raw, cleaned: clean(raw) })
    expect(line).not.toMatch(/[\n\r]/)
    expect(parse(line).rawHead).toContain('\n')
  })

  it('carries a tag that is identical on both routes, so one grep finds every failure', () => {
    for (const route of ['generate', 'refine'] as const) {
      const line = formatParseFailure({ route, raw: '{', cleaned: '{' })
      expect(line.startsWith(`${PARSE_FAILURE_TAG} `)).toBe(true)
      expect(parse(line).route).toBe(route)
    }
  })
})

describe('the tail is the evidence', () => {
  const long = (n: number) => 'a'.repeat(n)

  it('keeps BOTH ends of a long response — truncation is only visible at the end', () => {
    const raw = `HEAD_MARKER${long(RAW_SLICE_CHARS * 4)}TAIL_MARKER`
    const d = emit(raw)
    expect(d.rawHead).toContain('HEAD_MARKER')
    expect(d.rawTail).toContain('TAIL_MARKER')
    expect(d.rawHead).toHaveLength(RAW_SLICE_CHARS)
    expect(d.rawTail).toHaveLength(RAW_SLICE_CHARS)
    expect(d.elidedChars).toBe(raw.length - RAW_SLICE_CHARS * 2)
  })

  it('logs a short response whole, with nothing elided and no duplicated middle', () => {
    const raw = '{"title":"short and broken'
    const d = emit(raw)
    expect(d.rawHead).toBe(raw)
    expect(d.rawTail).toBe('')
    expect(d.elidedChars).toBe(0)
  })

  it.each([
    ['just under the head slice', RAW_SLICE_CHARS - 1],
    ['exactly the head slice', RAW_SLICE_CHARS],
    ['exactly head plus tail', RAW_SLICE_CHARS * 2],
  ])('%s is reported in full, no gap', (_label, size) => {
    const d = emit(long(size))
    expect(d.elidedChars).toBe(0)
    expect(d.rawHead.length + d.rawTail.length).toBe(size)
  })

  it('one char past head-plus-tail is the first case that elides, and it elides exactly one', () => {
    expect(emit(long(RAW_SLICE_CHARS * 2 + 1)).elidedChars).toBe(1)
  })

  it('stays bounded no matter how large the response is, so the line is never cut off', () => {
    const huge = long(2_000_000)
    const line = formatParseFailure({ route: 'refine', raw: huge, cleaned: huge })
    expect(line.length).toBeLessThan(RAW_SLICE_CHARS * 2 + 500)
    // The length is still reported truthfully even though the bytes are not kept.
    expect(parse(line).rawLength).toBe(2_000_000)
  })
})

describe('finishReason — the field that settles truncation without any content at all', () => {
  it('surfaces MAX_TOKENS, which proves the 8192 ceiling was hit', () => {
    expect(emit('{"a":1', 'MAX_TOKENS').finishReason).toBe('MAX_TOKENS')
  })

  it('surfaces STOP, which rules truncation OUT and points at the response body', () => {
    expect(emit('{"a":1', 'STOP').finishReason).toBe('STOP')
  })

  it.each([[undefined], [null], [42], [{}]])(
    'reports a missing or non-string reason (%p) as "unknown" rather than inventing one',
    (reason) => {
      expect(emit('{"a":1', reason).finishReason).toBe('unknown')
    }
  )
})

describe('never throws — a throw here would turn the 422 into a 500', () => {
  /**
   * The formatter runs inside the parse-failure catch, upstream of the route's
   * `finally`. An unswallowed throw would unwind through it and surface as a
   * server error, converting a clean formatting failure the user can retry into
   * one they cannot. Hostile input must degrade, never propagate.
   */
  it.each([
    ['undefined raw', { route: 'generate' as const, raw: undefined as any, cleaned: '' }],
    ['null raw', { route: 'generate' as const, raw: null as any, cleaned: '' }],
    ['non-string raw', { route: 'refine' as const, raw: 12345 as any, cleaned: '' }],
    ['undefined cleaned', { route: 'refine' as const, raw: '{', cleaned: undefined as any }],
  ])('%s degrades to a line instead of throwing', (_label, input) => {
    let line = ''
    expect(() => {
      line = formatParseFailure(input)
    }).not.toThrow()
    expect(line.startsWith(`${PARSE_FAILURE_TAG} `)).toBe(true)
    expect(() => parse(line)).not.toThrow()
  })

  it('survives a raw string containing a lone surrogate', () => {
    expect(() => formatParseFailure({ route: 'generate', raw: '\uD800', cleaned: '' })).not.toThrow()
  })
})

describe('content posture', () => {
  /**
   * The diagnostic must not become a place where identifiers accumulate. This
   * pins the emitted key set: adding a field is a deliberate act that fails
   * here first, rather than something a future edit does in passing.
   */
  it('emits exactly the declared fields and nothing else', () => {
    expect(Object.keys(emit('{"a":1', 'STOP')).sort()).toEqual([
      'cleanedLength',
      'elidedChars',
      'finishReason',
      'rawHead',
      'rawLength',
      'rawTail',
      'route',
      'strippedChars',
    ])
  })

  it('logs strictly less model output than the unbounded cleaned-text dump it replaced', () => {
    const raw = 'x'.repeat(RAW_SLICE_CHARS * 10)
    const d = emit(raw)
    expect(d.rawHead.length + d.rawTail.length).toBeLessThan(raw.length)
  })
})
