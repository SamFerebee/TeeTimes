export type ProviderConfig =
  | {
      type: 'foreup'
      courseId: number
      scheduleIds: number[]
      bookingClassId?: number
      holes?: number
    }
  | {
      type: 'teeitup'
      alias: string
      facilityIds: number[]
      courseId?: string
      requiresLogin?: boolean
      loginMessage?: string
      connectionId?: 'essex' | 'bergen'
    }
  | {
      type: 'golfnow'
      facilityId: number
      latitude: number
      longitude: number
    }
  | {
      type: 'protected'
      name: string
      reason: string
      connectionId?: 'essex' | 'bergen'
    }
  | {
      type: 'manual'
    }

export type Course = {
  id: string
  name: string
  location: string
  bookingUrl: string
  provider: ProviderConfig
}

export type TeeTime = {
  id: string
  courseId: string
  courseName: string
  provider: string
  time: string
  displayTime: string
  holes?: number
  availableSpots?: number
  minPlayers?: number
  maxPlayers?: number
  pricePerPlayer?: number
  priceLabel?: string
  bookingUrl: string
}

export type SourceStatus = {
  courseId: string
  courseName: string
  provider: string
  status: 'ok' | 'blocked' | 'unsupported' | 'error'
  message?: string
  count: number
  bookingUrl: string
}

export type ProviderResult = {
  teeTimes: TeeTime[]
  status: SourceStatus
}
