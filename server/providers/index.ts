import type { Course, ProviderResult } from '../types'
import { fetchForeUp } from './foreup'
import { fetchGolfNow } from './golfnow'
import { fetchTeeItUp } from './teeitup'

export async function fetchCourseTeeTimes(course: Course, date: string): Promise<ProviderResult> {
  try {
    if (course.provider.type === 'foreup') {
      return await fetchForeUp(course, date)
    }

    if (course.provider.type === 'teeitup') {
      return await fetchTeeItUp(course, date)
    }

    if (course.provider.type === 'golfnow') {
      return await fetchGolfNow(course, date)
    }

    if (course.provider.type === 'protected') {
      return {
        teeTimes: [],
        status: {
          courseId: course.id,
          courseName: course.name,
          provider: course.provider.name,
          status: 'blocked',
          message: course.provider.reason,
          count: 0,
          bookingUrl: course.bookingUrl,
        },
      }
    }

    return {
      teeTimes: [],
      status: {
        courseId: course.id,
        courseName: course.name,
        provider: 'Manual',
        status: 'unsupported',
        message: 'This course is saved, but no live provider adapter has been configured yet.',
        count: 0,
        bookingUrl: course.bookingUrl,
      },
    }
  } catch (error) {
    return {
      teeTimes: [],
      status: {
        courseId: course.id,
        courseName: course.name,
        provider: course.provider.type,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown provider error',
        count: 0,
        bookingUrl: course.bookingUrl,
      },
    }
  }
}
