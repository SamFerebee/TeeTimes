import { format, parse } from 'date-fns'
import type { Course, ProviderResult, TeeTime } from '../types'

type ForeUpTime = {
  time: string
  course_id?: number
  course_name?: string
  schedule_id?: number
  available_spots?: number
  maximum_players_per_booking?: number
  minimum_players?: number
  allowed_group_sizes?: string[]
  holes?: number
  green_fee?: number
  green_fee_18?: number
  guest_green_fee?: number
  cart_fee?: number
  pay_online?: string
}

const headers = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0',
  'X-Requested-With': 'XMLHttpRequest',
}

function parseForeUpTime(value: string) {
  return parse(value, 'yyyy-MM-dd HH:mm', new Date())
}

function priceFrom(time: ForeUpTime) {
  const greenFee = Number(time.green_fee_18 ?? time.green_fee ?? time.guest_green_fee)
  const cartFee = Number(time.cart_fee ?? 0)
  if (!Number.isFinite(greenFee) || greenFee <= 0) return undefined
  return greenFee + (Number.isFinite(cartFee) ? cartFee : 0)
}

export async function fetchForeUp(course: Course, date: string): Promise<ProviderResult> {
  if (course.provider.type !== 'foreup') {
    throw new Error('Invalid ForeUp course config')
  }

  const scheduleIds = course.provider.scheduleIds.length ? course.provider.scheduleIds : [0]
  const allTimes: TeeTime[] = []
  const dateParam = format(parse(date, 'yyyy-MM-dd', new Date()), 'MM-dd-yyyy')

  for (const scheduleId of scheduleIds) {
    if (!scheduleId) continue

    const params = new URLSearchParams({
      time: 'all',
      date: dateParam,
      holes: String(course.provider.holes ?? 'all'),
      players: '0',
      booking_class: 'false',
      schedule_id: String(scheduleId),
      specials_only: '0',
      api_key: '',
    })
    params.append('schedule_ids[]', String(scheduleId))

    const url = `https://foreupsoftware.com/index.php/api/booking/times?${params.toString()}`
    const response = await fetch(url, {
      headers: {
        ...headers,
        Referer: course.bookingUrl,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`ForeUp returned ${response.status}: ${text.slice(0, 180)}`)
    }

    const payload = (await response.json()) as ForeUpTime[] | false
    const times = Array.isArray(payload) ? payload : []
    for (const slot of times) {
      if (slot.course_id && Number(slot.course_id) !== course.provider.courseId) continue

      const startsAt = parseForeUpTime(slot.time)
      const price = priceFrom(slot)
      const allowed = slot.allowed_group_sizes?.map(Number).filter(Number.isFinite) ?? []

      allTimes.push({
        id: `${course.id}-${slot.time}-${slot.schedule_id ?? scheduleId}`,
        courseId: course.id,
        courseName: course.name,
        provider: 'ForeUp',
        time: startsAt.toISOString(),
        displayTime: format(startsAt, 'h:mm a'),
        holes: Number(slot.holes ?? course.provider.holes ?? 18),
        availableSpots: Number(slot.available_spots ?? 0),
        minPlayers: Number(slot.minimum_players ?? Math.min(...allowed, 1)),
        maxPlayers: Number(slot.maximum_players_per_booking ?? Math.max(...allowed, 4)),
        pricePerPlayer: price,
        priceLabel: price ? `$${price.toFixed(2)}` : undefined,
        bookingUrl: course.bookingUrl,
      })
    }
  }

  return {
    teeTimes: allTimes,
    status: {
      courseId: course.id,
      courseName: course.name,
      provider: 'ForeUp',
      status: 'ok',
      count: allTimes.length,
      bookingUrl: course.bookingUrl,
    },
  }
}
