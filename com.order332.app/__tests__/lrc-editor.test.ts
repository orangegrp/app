import { describe, expect, it } from "vitest"
import {
  isLikelyLrc,
  offsetAll,
  offsetFromLine,
  offsetLineOnly,
  parseEditableLrc,
  seedTimedLinesFromText,
  toLrcText,
} from "@/lib/lrc-editor"

const SAMPLE = `[00:10.00]Line 1\n[00:20.50]Line 2\n[00:30.00]Line 3`

describe("lrc-editor", () => {
  it("offsets only the selected line", () => {
    const parsed = parseEditableLrc(SAMPLE)
    const next = offsetLineOnly(parsed, 1, 1500)
    expect(next[0].timeMs).toBe(10_000)
    expect(next[1].timeMs).toBe(22_000)
    expect(next[2].timeMs).toBe(30_000)
  })

  it("offsets selected line and all following lines", () => {
    const parsed = parseEditableLrc(SAMPLE)
    const next = offsetFromLine(parsed, 1, -500)
    expect(next[0].timeMs).toBe(10_000)
    expect(next[1].timeMs).toBe(20_000)
    expect(next[2].timeMs).toBe(29_500)
  })

  it("offsets all lines and clamps at zero", () => {
    const parsed = parseEditableLrc(SAMPLE)
    const next = offsetAll(parsed, -12_000)
    expect(next[0].timeMs).toBe(0)
    expect(next[1].timeMs).toBe(8_500)
    expect(next[2].timeMs).toBe(18_000)
  })

  it("round-trips valid lrc text", () => {
    const parsed = parseEditableLrc(SAMPLE)
    const lrc = toLrcText(parsed)
    expect(lrc).toContain("[00:10.00]Line 1")
    expect(lrc).toContain("[00:20.50]Line 2")
    expect(lrc).toContain("[00:30.00]Line 3")
  })

  it("keeps untouched lines intact for offset-from-line operation", () => {
    const parsed = parseEditableLrc(SAMPLE)
    const before = { ...parsed[0] }
    const next = offsetFromLine(parsed, 2, 1000)
    expect(next[0]).toEqual(before)
    expect(next[1].timeMs).toBe(parsed[1].timeMs)
    expect(next[2].timeMs).toBe(parsed[2].timeMs + 1000)
  })

  it("handles timestamp collisions without dropping lines", () => {
    const parsed = parseEditableLrc(SAMPLE)
    const next = offsetLineOnly(parsed, 2, -9_500)
    expect(next).toHaveLength(3)
    expect(next[1].timeMs).toBe(20_500)
    expect(next[2].timeMs).toBe(20_500)
    const output = toLrcText(next)
    expect(output.split("\n")).toHaveLength(3)
  })

  it("seeds plain text into timed lines", () => {
    const seeded = seedTimedLinesFromText("first\n\nsecond\nthird")
    expect(seeded).toEqual([
      { timeMs: 0, text: "first" },
      { timeMs: 2500, text: "second" },
      { timeMs: 5000, text: "third" },
    ])
    expect(isLikelyLrc("[00:01.00]line")).toBe(true)
    expect(isLikelyLrc("plain words only")).toBe(false)
  })
})
