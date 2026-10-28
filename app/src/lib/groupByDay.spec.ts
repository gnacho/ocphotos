import { describe, expect, it } from 'vitest'
import { groupByDay } from './groupByDay'
import type { PhotoAsset } from './types'

function photo(id: string, takenAt: string): PhotoAsset {
  return {
    id,
    path: `/Fotos/${id}.jpg`,
    filename: `${id}.jpg`,
    takenAt: new Date(takenAt),
    width: 1600,
    height: 1200,
    thumbUrl: '',
    fullUrl: '',
    isVideo: false,
    personIds: [],
    favorite: false,
  }
}

describe('groupByDay', () => {
  it('bucket by local day and sort newest first', () => {
    const buckets = groupByDay([
      photo('a', '2024-08-04T10:00:00'),
      photo('b', '2024-08-04T22:00:00'),
      photo('c', '2023-12-31T23:30:00'),
    ])

    expect(buckets.map((b) => b.key)).toEqual(['2024-08-04', '2023-12-31'])
    expect(buckets[0].assets.map((a) => a.id)).toEqual(['a', 'b'])
    expect(buckets[0].date).toEqual(new Date('2024-08-04T10:00:00'))
  })

  it('return nothing for an empty library', () => {
    expect(groupByDay([])).toEqual([])
  })
})
