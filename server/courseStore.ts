import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { Course } from './types'

const dataPath = path.resolve(process.cwd(), 'data', 'courses.json')

const providerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('foreup'),
    courseId: z.coerce.number().int().positive(),
    scheduleIds: z.array(z.coerce.number().int().positive()).default([]),
    holes: z.coerce.number().int().optional(),
  }),
  z.object({
    type: z.literal('teeitup'),
    alias: z.string().min(1),
    facilityIds: z.array(z.coerce.number().int().positive()).default([]),
    courseId: z.string().optional(),
    requiresLogin: z.boolean().optional(),
    loginMessage: z.string().optional(),
    connectionId: z.enum(['essex', 'bergen']).optional(),
  }),
  z.object({
    type: z.literal('golfnow'),
    facilityId: z.coerce.number().int().positive(),
    latitude: z.coerce.number(),
    longitude: z.coerce.number(),
  }),
  z.object({
    type: z.literal('protected'),
    name: z.string().min(1),
    reason: z.string().min(1),
    connectionId: z.enum(['essex', 'bergen']).optional(),
  }),
  z.object({
    type: z.literal('manual'),
  }),
])

const courseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  location: z.string().default(''),
  bookingUrl: z.string().url(),
  provider: providerSchema,
})

export const newCourseSchema = z.object({
  name: z.string().min(1),
  location: z.string().default(''),
  bookingUrl: z.string().url(),
  provider: z
    .object({
      type: z.enum(['manual', 'foreup', 'teeitup', 'golfnow', 'protected']).default('manual'),
      courseId: z.coerce.number().int().positive().optional(),
      scheduleIds: z.array(z.coerce.number().int().positive()).optional(),
      holes: z.coerce.number().int().optional(),
      alias: z.string().optional(),
      facilityIds: z.array(z.coerce.number().int().positive()).optional(),
      facilityId: z.coerce.number().int().positive().optional(),
      latitude: z.coerce.number().optional(),
      longitude: z.coerce.number().optional(),
      requiresLogin: z.boolean().optional(),
      loginMessage: z.string().optional(),
      connectionId: z.enum(['essex', 'bergen']).optional(),
      name: z.string().optional(),
      reason: z.string().optional(),
    })
    .default({ type: 'manual' }),
})

export async function loadCourses(): Promise<Course[]> {
  const raw = await readFile(dataPath, 'utf8')
  return z.array(courseSchema).parse(JSON.parse(raw))
}

export async function saveCourses(courses: Course[]) {
  await writeFile(dataPath, `${JSON.stringify(courses, null, 2)}\n`, 'utf8')
}

export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || `course-${Date.now()}`
}

export function normalizeNewCourse(input: unknown): Course {
  const parsed = newCourseSchema.parse(input)
  const rawProvider = parsed.provider

  let provider: Course['provider'] = { type: 'manual' }
  if (rawProvider.type === 'foreup' && rawProvider.courseId) {
    provider = {
      type: 'foreup',
      courseId: rawProvider.courseId,
      scheduleIds: rawProvider.scheduleIds ?? [],
      holes: rawProvider.holes,
    }
  } else if (rawProvider.type === 'teeitup' && rawProvider.alias && rawProvider.facilityIds?.length) {
    provider = {
      type: 'teeitup',
      alias: rawProvider.alias,
      facilityIds: rawProvider.facilityIds,
      courseId: rawProvider.courseId,
      requiresLogin: rawProvider.requiresLogin,
      loginMessage: rawProvider.loginMessage,
      connectionId: rawProvider.connectionId,
    }
  } else if (
    rawProvider.type === 'golfnow' &&
    rawProvider.facilityId &&
    rawProvider.latitude !== undefined &&
    rawProvider.longitude !== undefined
  ) {
    provider = {
      type: 'golfnow',
      facilityId: rawProvider.facilityId,
      latitude: rawProvider.latitude,
      longitude: rawProvider.longitude,
    }
  } else if (rawProvider.type === 'protected') {
    provider = {
      type: 'protected',
      name: rawProvider.name || 'Protected booking provider',
      reason: rawProvider.reason || 'This provider needs a custom adapter before tee times can be read.',
      connectionId: rawProvider.connectionId,
    }
  }

  return {
    id: slugify(parsed.name),
    name: parsed.name,
    location: parsed.location,
    bookingUrl: parsed.bookingUrl,
    provider,
  }
}
