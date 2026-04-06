import { describe, expect, it } from "vitest"
import { getUpcomingAutoQueue, moveItem } from "@/lib/music-queue"

describe("getUpcomingAutoQueue", () => {
  it("returns the remainder of the queue after the current track", () => {
    const queue = ["a", "b", "c", "d"]
    expect(getUpcomingAutoQueue(queue, queue, false, "b")).toEqual(["c", "d"])
  })

  it("falls back to the full queue when the current track is missing", () => {
    const queue = ["x", "y"]
    expect(getUpcomingAutoQueue(queue, queue, false, "z")).toEqual(["x", "y"])
  })

  it("uses the shuffled queue when shuffle is enabled", () => {
    const base = ["1", "2", "3"]
    const shuffled = ["3", "1", "2"]
    expect(getUpcomingAutoQueue(base, shuffled, true, "3")).toEqual(["1", "2"])
  })

  it("returns an empty list when there are no tracks", () => {
    expect(getUpcomingAutoQueue([], [], false, null)).toEqual([])
  })
})

describe("moveItem", () => {
  it("moves a value inside the array", () => {
    const arr = ["a", "b", "c"]
    expect(moveItem(arr, 0, 2)).toEqual(["b", "c", "a"])
  })

  it("returns a new array even when indices are the same", () => {
    const arr = ["x", "y"]
    const moved = moveItem(arr, 0, 0)
    expect(moved).toEqual(arr)
    expect(moved).not.toBe(arr)
  })

  it("ignores invalid indices", () => {
    const arr = ["a"]
    expect(moveItem(arr, -1, 0)).toEqual(["a"])
    expect(moveItem(arr, 0, 2)).toEqual(["a"])
  })
})
