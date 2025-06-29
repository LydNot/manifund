import { ScaleContinuousNumeric, ScaleTime } from 'd3-scale'
import { Dispatch, SetStateAction } from 'react'
import { last, meanBy } from 'es-toolkit'
import { mapValues } from 'es-toolkit'

const removeUndefinedProps = <T extends object>(obj: T): T => {
  const newObj: any = {}

  for (const key of Object.keys(obj)) {
    if ((obj as any)[key] !== undefined) newObj[key] = (obj as any)[key]
  }

  return newObj
}

export type Point<X, Y, T = unknown> = { x: X; y: Y; obj?: T }
export type HistoryPoint<T = unknown> = Point<number, number, T>
export type DistributionPoint<T = unknown> = Point<number, number, T>
export type ValueKind = 'Ṁ' | 'percent' | 'amount'

/** [x, [y0, y1, ...]] */
export type MultiSerializedPoints = { [answerId: string]: [number, number][] }
/** [x, y, obj] */
export type SerializedPoint<T = unknown> =
  | Readonly<[number, number]>
  | Readonly<[number, number, T | undefined]>

export const unserializePoints = <T>(points: SerializedPoint<T>[]) => {
  return points.map(([x, y, obj]) => removeUndefinedProps({ x, y, obj }))
}

export const unserializeMultiPoints = (data: MultiSerializedPoints) => {
  return mapValues(data, (points) => points.map(([x, y]) => ({ x, y })))
}

export const serializeMultiPoints = (data: {
  [answerId: string]: HistoryPoint[]
}) => {
  return mapValues(data, (points) =>
    points.map(({ x, y }) => [x, y] as [number, number])
  )
}

export type viewScale = {
  viewXScale: ScaleTime<number, number, never> | undefined
  setViewXScale: Dispatch<
    SetStateAction<ScaleTime<number, number, never> | undefined>
  >
  viewYScale: ScaleContinuousNumeric<number, number, never> | undefined
  setViewYScale: Dispatch<
    SetStateAction<ScaleContinuousNumeric<number, number, never> | undefined>
  >
}

export type AxisConstraints = {
  min?: number
  max?: number
  minExtent?: number
}

export const maxMinBin = <P extends HistoryPoint>(
  points: P[],
  bins: number
) => {
  if (points.length < 2 || bins <= 0) return points

  const min = points[0].x
  const max = points[points.length - 1].x
  const binWidth = Math.ceil((max - min) / bins)

  //  for each bin, get the max, min, and median in that bin
  const result = []
  let lastInBin = points[0]
  for (let i = 0; i < bins; i++) {
    const binStart = min + i * binWidth
    const binEnd = binStart + binWidth
    const binPoints = points.filter((p) => p.x >= binStart && p.x < binEnd)
    if (binPoints.length === 0) {
      // insert a synthetic point at the start of the bin to prevent long diagonal lines
      result.push({ ...lastInBin, x: binEnd })
    } else if (binPoints.length <= 3) {
      lastInBin = binPoints[binPoints.length - 1]
      result.push(...binPoints)
    } else {
      lastInBin = binPoints[binPoints.length - 1]
      binPoints.sort((a, b) => a.y - b.y)
      const min = binPoints[0]
      const max = binPoints[binPoints.length - 1]
      const median = binPoints[Math.floor(binPoints.length / 2)]
      result.push(...[min, max, median].sort((a, b) => a.x - b.x))
    }
  }

  return result
}

// compresses points within a visible range, so as you zoom there's more detail.
export const compressPoints = <P extends HistoryPoint>(
  points: P[],
  min: number,
  max: number
) => {
  // add buffer of 100 points on each side for nice panning.
  const smallIndex = Math.max(points.findIndex((p) => p.x >= min) - 100, 0)
  const bigIndex = Math.min(
    points.findIndex((p) => p.x >= max) + 100,
    points.length
  )

  const toCompress = points.slice(smallIndex, bigIndex)

  if (toCompress.length < 1500) {
    return { points: toCompress, isCompressed: false }
  }

  return { points: maxMinBin(toCompress, 500), isCompressed: true }
}

export function binAvg<P extends HistoryPoint>(sorted: P[], limit = 100) {
  const length = sorted.length
  if (length <= limit) {
    return sorted
  }

  const min = sorted[0].x
  const max = last(sorted)?.x ?? 0
  const binWidth = Math.ceil((max - min) / limit)

  const newPoints = []
  let lastAvgY = sorted[0].y

  for (let i = 0; i < limit; i++) {
    const binStart = min + i * binWidth
    const binEnd = binStart + binWidth
    const binPoints = sorted.filter((p) => p.x >= binStart && p.x < binEnd)
    if (binPoints.length > 0) {
      lastAvgY = meanBy(binPoints, (p) => p.y)
    }
    newPoints.push({ x: binEnd, y: lastAvgY })
  }

  return newPoints
}
