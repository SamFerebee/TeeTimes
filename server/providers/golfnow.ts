import { format, parse } from 'date-fns'
import type { Course, ProviderResult, TeeTime } from '../types'

type GolfNowMoney = {
  value?: number
  formattedValue2?: string
}

type GolfNowRate = {
  holeCount?: number
  teeTimeRateId?: number
  playerRule?: string
  singlePlayerPrice?: {
    greensFees?: GolfNowMoney
    dueAtCourse?: GolfNowMoney
    dueOnline?: GolfNowMoney
    grandTotal?: GolfNowMoney
  }
}

type GolfNowSlot = {
  time?: {
    date?: string
    formatted?: string
    formattedTimeMeridian?: string
  }
  detailUrl?: string
  playerRule?: string
  teeTimeRates?: GolfNowRate[]
}

type GolfNowResponse = {
  ttResults?: {
    teeTimes?: GolfNowSlot[]
  }
}

const headers = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Origin: 'https://www.golfnow.com',
  Referer: 'https://www.golfnow.com/',
  'User-Agent': 'Mozilla/5.0',
}

function maxPlayersFromRule(rule?: string) {
  const normalized = rule?.toLowerCase() ?? ''
  if (normalized.includes('any')) return 4
  if (normalized.includes('four')) return 4
  if (normalized.includes('three')) return 3
  if (normalized.includes('two')) return 2
  if (normalized.includes('one')) return 1
  return 4
}

function priceFrom(rate?: GolfNowRate) {
  const money =
    rate?.singlePlayerPrice?.greensFees ??
    rate?.singlePlayerPrice?.grandTotal ??
    rate?.singlePlayerPrice?.dueAtCourse ??
    rate?.singlePlayerPrice?.dueOnline

  const value = Number(money?.value)
  if (!Number.isFinite(value) || value <= 0) return undefined

  return {
    value,
    label: money?.formattedValue2 || `$${value.toFixed(2)}`,
  }
}

function parseGolfNowTime(date: string, slot: GolfNowSlot) {
  const raw = slot.time?.date
  if (raw) {
    return parse(raw.slice(0, 19), "yyyy-MM-dd'T'HH:mm:ss", new Date())
  }

  const display = slot.time?.formatted && slot.time?.formattedTimeMeridian
    ? `${slot.time.formatted} ${slot.time.formattedTimeMeridian}`
    : '12:00 AM'

  return parse(`${date} ${display}`, 'yyyy-MM-dd h:mm a', new Date())
}

function bookingUrlFrom(course: Course, slot: GolfNowSlot) {
  if (slot.detailUrl?.startsWith('/')) {
    return `https://www.golfnow.com${slot.detailUrl}`
  }

  return course.bookingUrl
}

export async function fetchGolfNow(course: Course, date: string): Promise<ProviderResult> {
  if (course.provider.type !== 'golfnow') {
    throw new Error('Invalid GolfNow course config')
  }

  const searchDate = parse(date, 'yyyy-MM-dd', new Date())
  const body = {
    pageSize: 50,
    teeTimeCount: 50,
    pageNumber: 0,
    date: format(searchDate, 'MMM d yyyy'),
    sortBy: 'Date',
    sortByRollup: 'Date.MinDate',
    sortDirection: 'Asc',
    hotDealsOnly: false,
    golfPassPerksOnly: false,
    bestDealsOnly: false,
    promotedCampaignsOnly: false,
    priceMin: 0,
    priceMax: 10000,
    players: 0,
    timePeriod: 'Any',
    timeMin: 10,
    timeMax: 42,
    holes: 'Any',
    facilityType: 'GolfCourse',
    latitude: course.provider.latitude,
    longitude: course.provider.longitude,
    radius: 35,
    facilityId: course.provider.facilityId,
    facilityIds: [],
    searchType: 'Facility',
    view: 'Grouping',
    excludeFeaturedFacilities: false,
    excludePrivateFacilities: false,
    rateType: 'all',
    currentClientDate: new Date().toISOString(),
    trackmanOnly: false,
  }

  const response = await fetch('https://www.golfnow.com/api/tee-times/tee-time-search-results', {
    method: 'POST',
    headers: {
      ...headers,
      Referer: course.bookingUrl,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`GolfNow returned ${response.status}: ${text.slice(0, 180)}`)
  }

  const payload = (await response.json()) as GolfNowResponse
  const teeTimes: TeeTime[] = []

  for (const slot of payload.ttResults?.teeTimes ?? []) {
    const startsAt = parseGolfNowTime(date, slot)
    const rate = slot.teeTimeRates?.[0]
    const price = priceFrom(rate)
    const playerRule = rate?.playerRule ?? slot.playerRule
    const maxPlayers = maxPlayersFromRule(playerRule)

    teeTimes.push({
      id: `${course.id}-${rate?.teeTimeRateId ?? startsAt.toISOString()}`,
      courseId: course.id,
      courseName: course.name,
      provider: 'GolfNow',
      time: startsAt.toISOString(),
      displayTime: format(startsAt, 'h:mm a'),
      holes: Number(rate?.holeCount ?? 18),
      availableSpots: maxPlayers,
      minPlayers: 1,
      maxPlayers,
      pricePerPlayer: price?.value,
      priceLabel: price?.label,
      bookingUrl: bookingUrlFrom(course, slot),
    })
  }

  return {
    teeTimes,
    status: {
      courseId: course.id,
      courseName: course.name,
      provider: 'GolfNow',
      status: 'ok',
      count: teeTimes.length,
      bookingUrl: course.bookingUrl,
    },
  }
}
