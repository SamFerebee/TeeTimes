import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  CalendarDays,
  CalendarRange,
  ChevronDown,
  CheckCircle2,
  ExternalLink,
  Filter,
  ListOrdered,
  Plus,
  RefreshCw,
  Rows3,
  Search,
  Trash2,
  Users,
  Wand2,
} from 'lucide-react'
import './App.css'

type Course = {
  id: string
  name: string
  location: string
  bookingUrl: string
  provider: { type: string; [key: string]: unknown }
}

type TeeTime = {
  id: string
  courseId: string
  courseName: string
  provider: string
  time: string
  displayTime: string
  holes?: number
  availableSpots?: number
  priceLabel?: string
  bookingUrl: string
}

type SourceStatus = {
  courseId: string
  courseName: string
  provider: string
  status: 'ok' | 'blocked' | 'unsupported' | 'error'
  message?: string
  count: number
  bookingUrl: string
}

type TeeTimeResponse = {
  date: string
  endDate: string
  generatedAt: string
  teeTimes: TeeTime[]
  sources: SourceStatus[]
}

type DetectionResult = {
  status: 'live' | 'manual' | 'blocked'
  providerName: string
  message: string
  name?: string
  location?: string
  bookingUrl?: string
}

const today = new Date().toISOString().slice(0, 10)
type DateMode = 'single' | 'range'
type ResultView = 'time' | 'course'

function shortDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value))
}

function longDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(value))
}

function localDateKey(value: string) {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toggleSetValue(current: Set<string>, value: string) {
  const next = new Set(current)
  if (next.has(value)) {
    next.delete(value)
  } else {
    next.add(value)
  }
  return next
}

function App() {
  const [courses, setCourses] = useState<Course[]>([])
  const [dateMode, setDateMode] = useState<DateMode>('single')
  const [selectedDate, setSelectedDate] = useState(today)
  const [selectedEndDate, setSelectedEndDate] = useState(today)
  const [players, setPlayers] = useState(1)
  const [selectedCourses, setSelectedCourses] = useState<string[]>([])
  const [startTime, setStartTime] = useState('05:00')
  const [endTime, setEndTime] = useState('20:00')
  const [resultView, setResultView] = useState<ResultView>('time')
  const [collapsedCourseIds, setCollapsedCourseIds] = useState<Set<string>>(new Set())
  const [collapsedDayKeys, setCollapsedDayKeys] = useState<Set<string>>(new Set())
  const [data, setData] = useState<TeeTimeResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newCourse, setNewCourse] = useState({ name: '', location: '', bookingUrl: '' })
  const [detection, setDetection] = useState<DetectionResult | null>(null)
  const [detecting, setDetecting] = useState(false)
  const searchEndDate = selectedEndDate < selectedDate ? selectedDate : selectedEndDate

  async function loadCourses() {
    const response = await fetch('/api/courses')
    if (!response.ok) throw new Error('Could not load courses')
    const courseList = (await response.json()) as Course[]
    setCourses(courseList)
    setSelectedCourses((current) => current.length ? current : courseList.map((course) => course.id))
  }

  async function searchTeeTimes() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        date: selectedDate,
        players: String(players),
        courseIds: selectedCourses.join(','),
      })
      if (dateMode === 'range') {
        params.set('endDate', searchEndDate)
      }

      const response = await fetch(`/api/tee-times?${params.toString()}`)
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'Tee time search failed')
      }
      setData((await response.json()) as TeeTimeResponse)
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Tee time search failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCourses().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Could not load courses'))
  }, [])

  useEffect(() => {
    if (selectedCourses.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      searchTeeTimes()
    } else {
      setData(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMode, selectedDate, searchEndDate, players, selectedCourses])

  const filteredTimes = useMemo(() => {
    return (data?.teeTimes ?? []).filter((time) => {
      const slot = new Date(time.time)
      const local = `${String(slot.getHours()).padStart(2, '0')}:${String(slot.getMinutes()).padStart(2, '0')}`
      return local >= startTime && local <= endTime
    })
  }, [data, startTime, endTime])

  const groupedTimes = useMemo(() => {
    return courses
      .map((course) => ({
        course,
        teeTimes: filteredTimes.filter((time) => time.courseId === course.id),
      }))
      .filter((group) => group.teeTimes.length)
  }, [courses, filteredTimes])

  const timesByDay = useMemo(() => {
    const groups = new Map<string, TeeTime[]>()
    for (const teeTime of filteredTimes) {
      const key = localDateKey(teeTime.time)
      groups.set(key, [...(groups.get(key) ?? []), teeTime])
    }

    return Array.from(groups.entries()).map(([dateKey, teeTimes]) => ({ dateKey, teeTimes }))
  }, [filteredTimes])

  async function addCourse(event: FormEvent) {
    event.preventDefault()
    const response = await fetch('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newCourse,
        provider: { type: 'manual' },
      }),
    })

    if (!response.ok) {
      setError('Could not add course')
      return
    }

    const added = (await response.json()) as Course
    setCourses((current) => [...current, added])
    setSelectedCourses((current) => [...current, added.id])
    setNewCourse({ name: '', location: '', bookingUrl: '' })
    setDetection(null)
    setShowAdd(false)
  }

  async function detectNewCourse() {
    if (!newCourse.bookingUrl) return

    setDetecting(true)
    setError('')
    try {
      const response = await fetch('/api/courses/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingUrl: newCourse.bookingUrl, name: newCourse.name }),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'Could not check course support')
      }

      const result = (await response.json()) as DetectionResult
      setDetection(result)
      setNewCourse((current) => ({
        ...current,
        name: current.name || result.name || '',
        location: current.location || result.location || '',
        bookingUrl: result.bookingUrl || current.bookingUrl,
      }))
    } catch (detectError) {
      setDetection(null)
      setError(detectError instanceof Error ? detectError.message : 'Could not check course support')
    } finally {
      setDetecting(false)
    }
  }

  async function removeCourse(courseId: string) {
    const response = await fetch(`/api/courses/${courseId}`, { method: 'DELETE' })
    if (!response.ok) {
      setError('Could not remove course')
      return
    }

    setCourses((current) => current.filter((course) => course.id !== courseId))
    setSelectedCourses((current) => current.filter((id) => id !== courseId))
  }

  function toggleCourse(courseId: string) {
    setSelectedCourses((current) =>
      current.includes(courseId) ? current.filter((id) => id !== courseId) : [...current, courseId],
    )
  }

  return (
    <main className="app-shell">
      <section className="toolbar-band">
        <div className="toolbar">
          <div>
            <p className="eyebrow">Local tee sheet</p>
            <h1>Tee Time Finder</h1>
          </div>

          <div className="actions">
            <button className="icon-button" type="button" onClick={() => setShowAdd((value) => !value)} title="Add course">
              <Plus size={18} />
            </button>
            <button className="primary-button" type="button" onClick={searchTeeTimes} disabled={loading || !selectedCourses.length}>
              <RefreshCw size={18} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="search-grid">
          <div className="filter-control">
            <span><CalendarRange size={16} /> Dates</span>
            <div className="segmented-control">
              <button
                type="button"
                className={dateMode === 'single' ? 'active' : ''}
                onClick={() => setDateMode('single')}
              >
                Single
              </button>
              <button
                type="button"
                className={dateMode === 'range' ? 'active' : ''}
                onClick={() => setDateMode('range')}
              >
                Range
              </button>
            </div>
          </div>

          <label>
            <span><CalendarDays size={16} /> Date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                setSelectedDate(event.target.value)
                if (selectedEndDate < event.target.value) setSelectedEndDate(event.target.value)
              }}
            />
          </label>

          {dateMode === 'range' && (
            <label>
              <span><CalendarDays size={16} /> Through</span>
              <input
                type="date"
                value={searchEndDate}
                min={selectedDate}
                onChange={(event) => setSelectedEndDate(event.target.value)}
              />
            </label>
          )}

          <label>
            <span><Users size={16} /> Players</span>
            <select value={players} onChange={(event) => setPlayers(Number(event.target.value))}>
              {[1, 2, 3, 4].map((count) => (
                <option key={count} value={count}>{count}</option>
              ))}
            </select>
          </label>

          <label>
            <span><Filter size={16} /> Earliest</span>
            <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </label>

          <label>
            <span><Filter size={16} /> Latest</span>
            <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </label>

          <div className="filter-control">
            <span><Rows3 size={16} /> Results</span>
            <div className="segmented-control">
              <button
                type="button"
                className={resultView === 'time' ? 'active' : ''}
                onClick={() => setResultView('time')}
                title="Show all selected courses together by tee time"
              >
                <ListOrdered size={15} />
                Time
              </button>
              <button
                type="button"
                className={resultView === 'course' ? 'active' : ''}
                onClick={() => setResultView('course')}
                title="Group tee times by course"
              >
                <Rows3 size={15} />
                Course
              </button>
            </div>
          </div>
        </div>
      </section>

      {showAdd && (
        <form className="add-course" onSubmit={addCourse}>
          <label>
            <span>Course name</span>
            <input required placeholder="Neshanic Valley" value={newCourse.name} onChange={(event) => setNewCourse({ ...newCourse, name: event.target.value })} />
          </label>
          <label>
            <span>Location</span>
            <input placeholder="Neshanic Station, NJ" value={newCourse.location} onChange={(event) => setNewCourse({ ...newCourse, location: event.target.value })} />
          </label>
          <label className="booking-url-field">
            <span>Booking URL</span>
            <input
              required
              type="url"
              placeholder="Paste the tee-time booking page URL"
              value={newCourse.bookingUrl}
              onChange={(event) => {
                setNewCourse({ ...newCourse, bookingUrl: event.target.value })
                setDetection(null)
              }}
            />
          </label>
          <button type="button" className="secondary-add-button" onClick={detectNewCourse} disabled={detecting || !newCourse.bookingUrl}>
            <Wand2 size={16} />
            {detecting ? 'Checking' : 'Check'}
          </button>
          <button type="submit"><Plus size={16} /> Add</button>
          <div className="booking-url-help">
            <p>Use the page where you pick a tee time, including pages with an embedded tee-time widget. General course homepages usually will not work.</p>
            <div className="supported-platforms" aria-label="Supported live booking platforms">
              <span>Live lookup works with</span>
              <strong>TeeItUp</strong>
              <strong>ForeUp</strong>
              <strong>GolfNow / TeeOff</strong>
            </div>
          </div>
          {detection && (
            <div className={`add-course-status ${detection.status}`}>
              <CheckCircle2 size={16} />
              <span>
                <strong>{detection.providerName}</strong>
                <small>{detection.message}</small>
              </span>
            </div>
          )}
        </form>
      )}

      <section className="content-grid">
        <aside className="courses-panel">
          <div className="panel-heading">
            <h2>Courses</h2>
            <span>{selectedCourses.length}/{courses.length}</span>
          </div>

          <div className="course-selection-actions">
            <button
              type="button"
              onClick={() => setSelectedCourses(courses.map((course) => course.id))}
              disabled={selectedCourses.length === courses.length}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedCourses([])
                setData(null)
              }}
              disabled={!selectedCourses.length}
            >
              Deselect all
            </button>
          </div>

          <div className="course-list">
            {courses.map((course) => (
              <div className="course-row" key={course.id}>
                <label>
                  <input type="checkbox" checked={selectedCourses.includes(course.id)} onChange={() => toggleCourse(course.id)} />
                  <span>
                    <strong>{course.name}</strong>
                    <small>{course.location || course.provider.type}</small>
                  </span>
                </label>
                <button type="button" title="Remove course" onClick={() => removeCourse(course.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="source-list">
            {data?.sources.map((source) => (
              <a className={`source ${source.status}`} key={source.courseId} href={source.bookingUrl} target="_blank" rel="noreferrer">
                <span>
                  <strong>{source.courseName}</strong>
                  <small>{source.status === 'ok' ? `${source.count} tee times via ${source.provider}` : source.message}</small>
                </span>
                <ExternalLink size={14} />
              </a>
            ))}
          </div>
        </aside>

        <section className="results-panel">
          <div className="panel-heading">
            <h2>Available Tee Times</h2>
            <span>{filteredTimes.length} matches</span>
          </div>

          {error && <div className="error">{error}</div>}

          {!loading && filteredTimes.length === 0 && (
            <div className="empty-state">
              <Search size={28} />
              <p>No matching tee times found for the current filters.</p>
            </div>
          )}

          <div className="tee-list">
            {resultView === 'time' && timesByDay.map((group) => {
              const isCollapsed = collapsedDayKeys.has(group.dateKey)
              return (
                <div className="result-group" key={group.dateKey}>
                  <button
                    type="button"
                    className="result-group-heading"
                    onClick={() => setCollapsedDayKeys((current) => toggleSetValue(current, group.dateKey))}
                    aria-expanded={!isCollapsed}
                  >
                    <strong>
                      <ChevronDown size={17} className={isCollapsed ? 'collapsed' : ''} />
                      {longDate(group.teeTimes[0].time)}
                    </strong>
                    <span>{group.teeTimes.length} matches</span>
                  </button>

                  {!isCollapsed && group.teeTimes.map((time) => (
                    <TeeTimeRow time={time} key={time.id} />
                  ))}
                </div>
              )
            })}

            {resultView === 'course' && groupedTimes.map((group) => {
              const isCollapsed = collapsedCourseIds.has(group.course.id)
              return (
                <div className="result-group" key={group.course.id}>
                  <button
                    type="button"
                    className="result-group-heading"
                    onClick={() => setCollapsedCourseIds((current) => toggleSetValue(current, group.course.id))}
                    aria-expanded={!isCollapsed}
                  >
                    <strong>
                      <ChevronDown size={17} className={isCollapsed ? 'collapsed' : ''} />
                      {group.course.name}
                    </strong>
                    <span>{group.teeTimes.length} matches</span>
                  </button>

                  {!isCollapsed && group.teeTimes.map((time) => (
                    <TeeTimeRow time={time} key={time.id} />
                  ))}
                </div>
              )
            })}
          </div>
        </section>
      </section>
    </main>
  )
}

function TeeTimeRow({ time }: { time: TeeTime }) {
  return (
    <a className="tee-row" href={time.bookingUrl} target="_blank" rel="noreferrer">
      <span className="time">{time.displayTime}</span>
      <span className="date-chip">{shortDate(time.time)}</span>
      <span className="course-name">{time.courseName}</span>
      <span>{time.availableSpots ?? '-'} spots</span>
      <span>{time.holes ?? 18} holes</span>
      <span>{time.priceLabel ?? 'Price n/a'}</span>
      <ExternalLink size={16} />
    </a>
  )
}

export default App
