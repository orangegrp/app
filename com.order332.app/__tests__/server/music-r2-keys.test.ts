import { describe, it, expect, afterEach } from 'vitest'
import { toMusicObjectKey } from '@/server/lib/music-r2'

describe('toMusicObjectKey', () => {
  const prev = process.env.MUSIC_R2_KEY_PREFIX

  afterEach(() => {
    if (prev === undefined) delete process.env.MUSIC_R2_KEY_PREFIX
    else process.env.MUSIC_R2_KEY_PREFIX = prev
  })

  it('joins default music-tracks prefix and logical key', () => {
    delete process.env.MUSIC_R2_KEY_PREFIX
    expect(toMusicObjectKey('covers/u/1.jpg')).toBe(
      'music-tracks/covers/u/1.jpg',
    )
  })

  it('normalizes custom prefix without double slashes', () => {
    process.env.MUSIC_R2_KEY_PREFIX = 'music-tracks'
    expect(toMusicObjectKey('audio/u/t.mp3')).toBe('music-tracks/audio/u/t.mp3')
  })

  it('strips leading slash on logical key', () => {
    process.env.MUSIC_R2_KEY_PREFIX = 'music-tracks/'
    expect(toMusicObjectKey('/lyrics/u/x.lrc')).toBe('music-tracks/lyrics/u/x.lrc')
  })
})
