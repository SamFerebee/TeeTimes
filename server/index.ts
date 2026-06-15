import cors from 'cors'
import { addDays, differenceInCalendarDays, format, parse } from 'date-fns'
import express from 'express'
import { z } from 'zod'
import { loadCourses, normalizeNewCourse, saveCourses, slugify } from './courseStore'
import { fetchCourseTeeTimes } from './providers'
import type { Course, ProviderResult, SourceStatus } from './types'

const app = express()
const port = Number(process.env.PORT ?? 3001)
const cache = new Map<string, { expiresAt: number; value: ProviderResult }>()

class BadRequestError extends Error {}

app.use(cors())
app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

app.get('/api/courses', async (_request, response, next) => {
  try {
    response.json(await loadCourses())
  } catch (error) {
    next(error)
  }
})

app.post('/api/courses', async (request, response, next) => {
  try {
    const courses = await loadCourses()
    const course = normalizeNewCourse(request.body)
    const existingIds = new Set(courses.map((item) => item.id))
    let id = slugify(course.name)
    let counter = 2
    while (existingIds.has(id)) {
      id = `${slugify(course.name)}-${counter}`
      counter += 1
    }

    const saved: Course = { ...course, id }
    await saveCourses([...courses, saved])
    response.status(201).json(saved)
  } catch (error) {
    next(error)
  }
})

app.delete('/api/courses/:id', async (request, response, next) => {
  try {
    const courses = await loadCourses()
    await saveCourses(courses.filter((course) => course.id !== request.params.id))
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

function datesInRange(startDate: string, endDate: string) {
  const start = parse(startDate, 'yyyy-MM-dd', new Date())
  const end = parse(endDate, 'yyyy-MM-dd', new Date())
  const days = differenceInCalendarDays(end, start)

  if (days < 0) {
    throw new BadRequestError('End date must be on or after start date')
  }

  if (days > 13) {
    throw new BadRequestError('Date range cannot be longer than 14 days')
  }

  return Array.from({ length: days + 1 }, (_, index) => format(addDays(start, index), 'yyyy-MM-dd'))
}

function aggregateSources(results: ProviderResult[]) {
  const sources = new Map<string, SourceStatus>()

  for (const result of results) {
    const current = sources.get(result.status.courseId)
    if (!current) {
      sources.set(result.status.courseId, {
        ...result.status,
        count: result.teeTimes.length,
      })
      continue
    }

    current.count += result.teeTimes.length
    if (current.status !== 'ok' && result.status.status === 'ok') {
      current.status = 'ok'
      current.message = result.status.message
    }
  }

  return Array.from(sources.values())
}

app.get('/api/tee-times', async (request, response, next) => {
  try {
    const query = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        players: z.coerce.number().int().min(1).max(4).optional(),
        courseIds: z.string().optional(),
      })
      .parse(request.query)

    const searchDates = datesInRange(query.date, query.endDate ?? query.date)
    const selectedIds = new Set(query.courseIds?.split(',').filter(Boolean))
    const courses = (await loadCourses()).filter((course) => !selectedIds.size || selectedIds.has(course.id))

    const results = await Promise.all(
      courses.flatMap((course) => searchDates.map(async (date) => {
        const key = `${course.id}:${date}`
        const cached = cache.get(key)
        if (cached && cached.expiresAt > Date.now()) {
          return cached.value
        }

        const value = await fetchCourseTeeTimes(course, date)
        cache.set(key, { value, expiresAt: Date.now() + 60_000 })
        return value
      })),
    )

    const teeTimes = results
      .flatMap((result) => result.teeTimes)
      .filter((time) => !query.players || time.availableSpots === undefined || time.availableSpots >= query.players)
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))

    response.json({
      date: query.date,
      endDate: query.endDate ?? query.date,
      generatedAt: new Date().toISOString(),
      teeTimes,
      sources: aggregateSources(results),
    })
  } catch (error) {
    next(error)
  }
})

app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
  void next
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: 'Invalid request', details: error.issues })
    return
  }

  if (error instanceof BadRequestError) {
    response.status(400).json({ error: error.message })
    return
  }

  console.error(error)
  response.status(500).json({ error: error instanceof Error ? error.message : 'Unexpected server error' })
})

app.listen(port, () => {
  console.log(`Tee time API running at http://localhost:${port}`)
})
