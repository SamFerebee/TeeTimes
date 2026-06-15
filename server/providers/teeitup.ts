import { format, parseISO } from 'date-fns'
import { getConnectionSessionHeader } from '../connections'
import type { Course, ProviderResult, TeeTime } from '../types'

type TeeItUpRate = {
  greenFeeWalking?: number
  greenFeeRiding?: number
  greenFee?: number
  price?: number
  dueOnlineWalking?: number
  dueOnlineRiding?: number
  allowedPlayers?: number[]
  golfnow?: {
    GolfFacilityId?: number
  }
  promotion?: {
    greenFeeWalking?: number
    greenFeeRiding?: number
    price?: number
  }
}

type TeeItUpSlot = {
  id?: string
  teetime?: string
  teeTime?: string
  startTime?: string
  minPlayers?: number
  maxPlayers?: number
  playersAvail?: number
  availablePlayers?: number
  holes?: number
  rates?: TeeItUpRate[]
}

type TeeItUpCourseResult = {
  teetimes?: TeeItUpSlot[]
}

function centsToDollars(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined
  return numeric > 500 ? numeric / 100 : numeric
}

function firstPrice(...values: unknown[]) {
  for (const value of values) {
    const price = centsToDollars(value)
    if (price !== undefined) return price
  }

  return undefined
}

function priceFrom(slot: TeeItUpSlot) {
  const rate = slot.rates?.[0]
  return firstPrice(
    rate?.promotion?.greenFeeRiding ??
      rate?.promotion?.greenFeeWalking ??
      rate?.promotion?.price,
    rate?.dueOnlineRiding,
    rate?.dueOnlineWalking,
    rate?.greenFeeRiding,
    rate?.greenFeeWalking,
    rate?.greenFee,
    rate?.price,
  )
}

function teeTimeBookingUrl(course: Course, startsAt: Date, slot: TeeItUpSlot, availableSpots?: number) {
  if (course.provider.type !== 'teeitup') {
    return course.bookingUrl
  }

  const url = new URL(course.bookingUrl)
  const hour = startsAt.getHours()
  const facilityId = slot.rates?.find((rate) => rate.golfnow?.GolfFacilityId)?.golfnow?.GolfFacilityId ?? course.provider.facilityIds[0]
  const holes = Number(slot.holes ?? 18)
  const golfers = Math.max(1, Math.min(Number(availableSpots ?? slot.maxPlayers ?? 4), 4))

  url.searchParams.set('date', format(startsAt, 'yyyy-MM-dd'))
  if (facilityId) url.searchParams.set('course', String(facilityId))
  url.searchParams.set('start', String(hour))
  url.searchParams.set('end', String(Math.min(hour + 1, 23)))
  url.searchParams.set('golfers', String(golfers))
  url.searchParams.set('holes', String(holes))

  return url.toString()
}

export async function fetchTeeItUp(course: Course, date: string): Promise<ProviderResult> {
  if (course.provider.type !== 'teeitup') {
    throw new Error('Invalid TeeItUp course config')
  }

  const sessionHeader = course.provider.connectionId
    ? await getConnectionSessionHeader(course.provider.connectionId)
    : undefined

  if (course.provider.requiresLogin && !sessionHeader) {
    return {
      teeTimes: [],
      status: {
        courseId: course.id,
        courseName: course.name,
        provider: 'TeeItUp',
        status: 'blocked',
        message:
          course.provider.loginMessage ||
          'This booking engine requires sign-in before tee times are exposed, so the public API cannot verify availability.',
        count: 0,
        bookingUrl: course.bookingUrl,
      },
    }
  }

  const params = new URLSearchParams({
    date,
    facilityIds: course.provider.facilityIds.join(','),
  })

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    Origin: course.bookingUrl,
    Referer: `${course.bookingUrl}/`,
    'User-Agent': 'Mozilla/5.0',
    'x-be-alias': course.provider.alias,
  }
  if (sessionHeader) {
    requestHeaders.session = sessionHeader
  }

  const response = await fetch(`https://phx-api-be-east-1b.kenna.io/v2/tee-times?${params.toString()}`, {
    headers: requestHeaders,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`TeeItUp returned ${response.status}: ${text.slice(0, 180)}`)
  }

  const results = (await response.json()) as TeeItUpCourseResult[]
  const teeTimes: TeeTime[] = []

  for (const result of results) {
    for (const slot of result.teetimes ?? []) {
      const rawTime = slot.teetime ?? slot.teeTime ?? slot.startTime
      if (!rawTime) continue

      const startsAt = parseISO(rawTime)
      const allowedPlayers = slot.rates?.[0]?.allowedPlayers ?? []
      const maxPlayers = Number(slot.maxPlayers ?? Math.max(...allowedPlayers, 4))
      const availableSpots = Number(slot.playersAvail ?? slot.availablePlayers ?? maxPlayers)
      const price = priceFrom(slot)
      const facilityId = slot.rates?.find((rate) => rate.golfnow?.GolfFacilityId)?.golfnow?.GolfFacilityId

      teeTimes.push({
        id: `${course.id}-${facilityId ?? 'facility'}-${slot.id ?? rawTime}`,
        courseId: course.id,
        courseName: course.name,
        provider: 'TeeItUp',
        time: startsAt.toISOString(),
        displayTime: format(startsAt, 'h:mm a'),
        holes: Number(slot.holes ?? 18),
        availableSpots: Number.isFinite(availableSpots) ? availableSpots : undefined,
        minPlayers: Number(slot.minPlayers ?? Math.min(...allowedPlayers, 1)),
        maxPlayers: Number.isFinite(maxPlayers) ? maxPlayers : undefined,
        pricePerPlayer: price,
        priceLabel: price ? `$${price.toFixed(2)}` : undefined,
        bookingUrl: teeTimeBookingUrl(course, startsAt, slot, availableSpots),
      })
    }
  }

  return {
    teeTimes,
    status: {
      courseId: course.id,
      courseName: course.name,
      provider: 'TeeItUp',
      status: 'ok',
      count: teeTimes.length,
      bookingUrl: course.bookingUrl,
    },
  }
}
