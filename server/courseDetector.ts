import type { Course } from './types'

export type DetectionResult = {
  status: 'live' | 'manual' | 'blocked'
  provider: Course['provider']
  providerName: string
  message: string
  name?: string
  location?: string
  bookingUrl?: string
}

type TeeItUpFacility = {
  id: number
  courseId?: string
  name?: string
  locality?: string
  region?: string
}

const headers = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'User-Agent': 'Mozilla/5.0',
}

function cleanText(value?: string) {
  return value
    ?.replace(/\\u003c[^>]*\\u003e/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\+/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function courseNameKey(value?: string) {
  return cleanText(value)
    ?.toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(golf|course|club|country|county|gc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function jsonStringFromHtml(value: string) {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/g, '&')
}

async function fetchHtml(url: string) {
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`Could not read booking page (${response.status})`)
  }

  return response.text()
}

function extractJsonArray(html: string, variableName: string) {
  const variableIndex = html.indexOf(`${variableName} = `)
  if (variableIndex < 0) return undefined

  const start = html.indexOf('[', variableIndex)
  if (start < 0) return undefined

  let depth = 0
  let inString = false
  let escape = false
  for (let index = start; index < html.length; index += 1) {
    const char = html[index]
    if (escape) {
      escape = false
      continue
    }
    if (char === '\\') {
      escape = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (char === '[') depth += 1
    if (char === ']') {
      depth -= 1
      if (depth === 0) return html.slice(start, index + 1)
    }
  }

  return undefined
}

function extractJsonObjectAfter(html: string, marker: string) {
  const markerIndex = html.indexOf(marker)
  if (markerIndex < 0) return undefined

  const start = html.indexOf('{', markerIndex)
  if (start < 0) return undefined

  let depth = 0
  let inString = false
  let escape = false
  for (let index = start; index < html.length; index += 1) {
    const char = html[index]
    if (escape) {
      escape = false
      continue
    }
    if (char === '\\') {
      escape = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return html.slice(start, index + 1)
    }
  }

  return undefined
}

function metaContent(html: string, name: string) {
  return html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1]
}

function canonicalHref(html: string) {
  return html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
}

function isSupportedProviderUrl(url: URL) {
  const hostname = url.hostname.toLowerCase()
  return (
    hostname.includes('foreupsoftware.com') ||
    hostname.includes('book.teeitup.') ||
    hostname.includes('golfnow.com') ||
    hostname.includes('teeoff.com')
  )
}

function candidateUrlFrom(value: string, baseUrl: URL) {
  const cleaned = value.replace(/&amp;/g, '&').trim()
  try {
    return new URL(cleaned, baseUrl)
  } catch {
    return undefined
  }
}

function findEmbeddedBookingUrl(html: string, baseUrl: URL) {
  const candidates = new Set<string>()
  const attributePattern = /\b(?:src|href|action)=["']([^"']+)["']/gi
  const urlPattern = /https?:\\?\/\\?\/[^"'<>\\\s]+/gi

  for (const match of html.matchAll(attributePattern)) {
    candidates.add(match[1])
  }

  for (const match of html.matchAll(urlPattern)) {
    candidates.add(match[0].replace(/\\\//g, '/'))
  }

  for (const candidate of candidates) {
    const url = candidateUrlFrom(candidate, baseUrl)
    if (url && isSupportedProviderUrl(url)) {
      return url.toString()
    }
  }

  return undefined
}

function detectBlocked(url: URL): DetectionResult {
  return {
    status: 'blocked',
    provider: {
      type: 'protected',
      name: url.hostname,
      reason: 'This booking site is not one of the supported providers yet, or it blocks server-side tee-time lookup.',
    },
    providerName: 'Protected/unknown',
    message: 'Saved, but live tee-time lookup is not configured for this booking site yet.',
  }
}

async function detectForeUp(url: URL): Promise<DetectionResult> {
  const pathMatch = url.pathname.match(/\/booking\/(\d+)(?:\/(\d+))?/)
  const urlCourseId = pathMatch?.[1] ? Number(pathMatch[1]) : undefined
  const urlScheduleId = pathMatch?.[2] ? Number(pathMatch[2]) : undefined
  const html = await fetchHtml(url.toString())
  const courseId = Number(html.match(/COURSE_ID\s*=\s*(\d+)/)?.[1] ?? urlCourseId)
  const defaultFilter = extractJsonObjectAfter(html, 'DEFAULT_FILTER = ')
  const parsedDefault = defaultFilter ? JSON.parse(defaultFilter) as { schedule_id?: number; holes?: number } : undefined
  const scheduleId = Number(urlScheduleId ?? parsedDefault?.schedule_id)
  const schedulesRaw = extractJsonArray(html, 'SCHEDULES')
  const schedules = schedulesRaw ? JSON.parse(schedulesRaw) as Array<{ teesheet_id?: string; course_id?: string; holes?: string; course_name?: string; title?: string }> : []
  const schedule = schedules.find((item) => Number(item.teesheet_id) === scheduleId) ?? schedules.find((item) => Number(item.course_id) === courseId) ?? schedules[0]
  const pageName = cleanText(html.match(/PAGE_NAME\s*=\s*'([^']+)'/)?.[1])
  const scheduleName = cleanText(schedule?.course_name || schedule?.title)

  if (!courseId || !scheduleId) {
    return detectBlocked(url)
  }

  return {
    status: 'live',
    provider: {
      type: 'foreup',
      courseId,
      scheduleIds: [scheduleId],
      holes: Number(schedule?.holes ?? parsedDefault?.holes ?? 18),
    },
    providerName: 'ForeUp',
    message: `Live tee-time lookup configured through ForeUp schedule ${scheduleId}.`,
    name: scheduleName || pageName,
    bookingUrl: url.toString(),
  }
}

async function detectTeeItUp(url: URL, intendedName?: string): Promise<DetectionResult> {
  const html = await fetchHtml(url.toString())
  const normalized = jsonStringFromHtml(html)
  const alias = html.match(/id="alias"\s+value="([^"]+)"/)?.[1] ?? normalized.match(/"alias":"([^"]+)"/)?.[1]
  const detectedFacilityIds = normalized
    .match(/"gnFacilityIds":\[([^\]]+)\]/)?.[1]
    ?.split(',')
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite)
  const requestedFacilityIds = url.searchParams
    .get('course')
    ?.split(',')
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite)
  let facilityIds = requestedFacilityIds?.length && detectedFacilityIds?.length
    ? requestedFacilityIds.filter((facilityId) => detectedFacilityIds.includes(facilityId))
    : detectedFacilityIds
  const courseId = normalized.match(/"entityId":"([^"]+)"/)?.[1]
  let name = cleanText(
    normalized.match(/"alias":"[^"]+","gnFacilityIds":\[[^\]]+\],"name":"([^"]+)"/)?.[1] ??
      normalized.match(/"gnFacilityIds":\[[^\]]+\],"name":"([^"]+)"/)?.[1],
  )
  let detectedCourseId = courseId

  if (!alias || !facilityIds?.length) {
    return detectBlocked(url)
  }

  if (facilityIds.length > 1) {
    const facilitiesResponse = await fetch(`https://phx-api-be-east-1b.kenna.io/alias/${alias}/facilities`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'x-be-alias': alias,
      },
    })
    const facilities = facilitiesResponse.ok ? await facilitiesResponse.json() as TeeItUpFacility[] : []
    const availableFacilities = facilities.filter((facility) => facilityIds?.includes(facility.id))
    const normalizedName = cleanText(intendedName)?.toLowerCase() ?? name?.toLowerCase()
    const normalizedKey = courseNameKey(intendedName) ?? courseNameKey(name)
    const matchingFacility = availableFacilities.find((facility) => (
      normalizedKey && courseNameKey(facility.name) === normalizedKey
    )) ?? availableFacilities.find((facility) => {
      const facilityName = cleanText(facility.name)?.toLowerCase()
      return Boolean(normalizedName && facilityName && facilityName.includes(normalizedName))
    }) ?? availableFacilities.find((facility) => {
      const facilityName = cleanText(facility.name)?.toLowerCase()
      return Boolean(normalizedName && facilityName && normalizedName.includes(facilityName))
    })

    if (matchingFacility) {
      facilityIds = [matchingFacility.id]
      name = cleanText(matchingFacility.name) ?? name
      detectedCourseId = matchingFacility.courseId ?? detectedCourseId
    } else if (requestedFacilityIds?.length) {
      const firstRequested = availableFacilities.find((facility) => facility.id === requestedFacilityIds[0])
      if (firstRequested) {
        facilityIds = [firstRequested.id]
        name = cleanText(firstRequested.name) ?? name
        detectedCourseId = firstRequested.courseId ?? detectedCourseId
      }
    }
  }

  return {
    status: 'live',
    provider: {
      type: 'teeitup',
      alias,
      facilityIds,
      courseId: detectedCourseId,
    },
    providerName: 'TeeItUp',
    message: `Live tee-time lookup configured through TeeItUp facility ${facilityIds.join(', ')}.`,
    name,
    bookingUrl: requestedFacilityIds?.length ? `${url.origin}?course=${facilityIds.join(',')}` : url.origin,
  }
}

async function detectGolfNow(url: URL): Promise<DetectionResult> {
  const facilityId = Number(url.pathname.match(/\/facility\/(\d+)/)?.[1])
  const html = await fetchHtml(url.toString())
  const viewOverrideMatch = html.match(/"viewOverrides":\{[^}]*"facilityId":(\d+)[^}]*"longitude":(-?\d+(?:\.\d+)?)[^}]*"latitude":(-?\d+(?:\.\d+)?)/)
  const metaCoordinates = metaContent(html, 'geo.position')?.split(',').map((value) => Number(value.trim()))
  const detectedFacilityId = Number(viewOverrideMatch?.[1] ?? facilityId)
  const longitude = Number(viewOverrideMatch?.[2] ?? metaCoordinates?.[1])
  const latitude = Number(viewOverrideMatch?.[3] ?? metaCoordinates?.[0])
  const title = cleanText(html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.replace(/\s+Tee Times.*$/i, ''))
  const name = title?.replace(/\s+-\s+.*$/, '')

  if (!detectedFacilityId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return detectBlocked(url)
  }

  return {
    status: 'live',
    provider: {
      type: 'golfnow',
      facilityId: detectedFacilityId,
      latitude,
      longitude,
    },
    providerName: 'GolfNow',
    message: `Live tee-time lookup configured through GolfNow facility ${detectedFacilityId}.`,
    name,
    bookingUrl: canonicalHref(html) ?? url.toString(),
  }
}

export async function detectCourseProvider(
  bookingUrl: string,
  intendedName?: string,
  embedDepth = 0,
): Promise<DetectionResult> {
  let url: URL
  try {
    url = new URL(bookingUrl)
  } catch {
    return {
      status: 'manual',
      provider: { type: 'manual' },
      providerName: 'Manual',
      message: 'Enter a valid booking URL to check live tee-time support.',
    }
  }

  const hostname = url.hostname.toLowerCase()

  try {
    if (hostname.includes('foreupsoftware.com')) {
      return await detectForeUp(url)
    }

    if (hostname.includes('book.teeitup.')) {
      return await detectTeeItUp(url, intendedName)
    }

    if (hostname.includes('golfnow.com') || hostname.includes('teeoff.com')) {
      return await detectGolfNow(url)
    }

    if (embedDepth < 2) {
      const html = await fetchHtml(url.toString())
      const embeddedBookingUrl = findEmbeddedBookingUrl(html, url)
      if (embeddedBookingUrl) {
        const detected = await detectCourseProvider(embeddedBookingUrl, intendedName, embedDepth + 1)
        return {
          ...detected,
          message: `Found an embedded ${detected.providerName} booking page. ${detected.message}`,
        }
      }
    }
  } catch (error) {
    return {
      status: 'manual',
      provider: { type: 'manual' },
      providerName: 'Manual',
      message: error instanceof Error ? error.message : 'Could not inspect this booking site.',
    }
  }

  return {
    status: 'manual',
    provider: { type: 'manual' },
    providerName: 'Manual',
    message: 'This booking site is saved, but automatic live tee-time setup is not available for it yet.',
  }
}
