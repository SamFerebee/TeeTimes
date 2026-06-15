import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type BrowserContext, type Page } from 'playwright'

export type ConnectionId = 'essex' | 'bergen'

type ConnectionConfig = {
  id: ConnectionId
  label: string
  url: string
  sessionKey?: string
}

export type ConnectionStatus = {
  id: ConnectionId
  label: string
  url: string
  browserOpen: boolean
  connected: boolean
  usable: boolean
  message: string
  updatedAt?: string
}

type SavedConnection = {
  id: ConnectionId
  sessionHeader?: string
  connected: boolean
  usable: boolean
  message: string
  updatedAt: string
}

const connectionConfigs: Record<ConnectionId, ConnectionConfig> = {
  essex: {
    id: 'essex',
    label: 'Essex County',
    url: 'https://essex-group.book.teeitup.golf',
    sessionKey: 'phxprofile',
  },
  bergen: {
    id: 'bergen',
    label: 'Bergen County',
    url: 'https://golfbergencounty.com/tee-times',
  },
}

const localDir = path.resolve(process.cwd(), '.local')
const connectionsDir = path.join(localDir, 'connections')
const profilesDir = path.join(localDir, 'browser-profiles')
const contexts = new Map<ConnectionId, BrowserContext>()

async function ensureDirs() {
  await mkdir(connectionsDir, { recursive: true })
  await mkdir(profilesDir, { recursive: true })
}

function connectionPath(id: ConnectionId) {
  return path.join(connectionsDir, `${id}.json`)
}

function profilePath(id: ConnectionId) {
  return path.join(profilesDir, id)
}

function isConnectionId(id: string): id is ConnectionId {
  return id === 'essex' || id === 'bergen'
}

export function parseConnectionId(id: string): ConnectionId {
  if (!isConnectionId(id)) {
    throw new Error(`Unknown connection "${id}"`)
  }
  return id
}

async function readSavedConnection(id: ConnectionId): Promise<SavedConnection | null> {
  try {
    return JSON.parse(await readFile(connectionPath(id), 'utf8')) as SavedConnection
  } catch {
    return null
  }
}

async function writeSavedConnection(saved: SavedConnection) {
  await ensureDirs()
  await writeFile(connectionPath(saved.id), `${JSON.stringify(saved, null, 2)}\n`, 'utf8')
}

async function getContext(id: ConnectionId, visible = true) {
  const existing = contexts.get(id)
  if (existing) return existing

  await ensureDirs()
  const context = await chromium.launchPersistentContext(profilePath(id), {
    headless: !visible,
    viewport: null,
  })
  contexts.set(id, context)
  context.on('close', () => contexts.delete(id))
  return context
}

async function getPage(context: BrowserContext) {
  return context.pages()[0] ?? context.newPage()
}

async function readLocalStorage(page: Page) {
  return page.evaluate(() => {
    const values: Record<string, string> = {}
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key) values[key] = localStorage.getItem(key) ?? ''
    }
    return values
  })
}

function findSessionHeader(storage: Record<string, string>, preferredKey?: string) {
  if (preferredKey && storage[preferredKey]) return storage[preferredKey]

  for (const [key, value] of Object.entries(storage)) {
    if (/phxprofile|session/i.test(key) && value && value.length > 20) {
      return value
    }
  }

  return undefined
}

async function capture(id: ConnectionId, context: BrowserContext, page: Page) {
  const config = connectionConfigs[id]
  await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined)

  const html = await page.content().catch(() => '')
  const isChallenge = /challenge-error-text|Enable JavaScript and cookies|cf_chl/i.test(html)
  const storage = await readLocalStorage(page).catch(() => ({}))
  const sessionHeader = findSessionHeader(storage, config.sessionKey)

  let connected = false
  let usable = false
  let message = `Log in to ${config.label} in the opened browser, then click Save session.`

  if (id === 'essex') {
    connected = Boolean(sessionHeader)
    usable = connected
    message = connected
      ? 'Essex session captured. Refresh tee times to use the logged-in TeeItUp session.'
      : 'Waiting for Essex Golf ID sign-in. Log in in the browser, then click Save session.'
  } else if (id === 'bergen') {
    connected = !isChallenge
    usable = false
    message = connected
      ? 'Bergen browser session is saved. The app still needs a Bergen portal parser before it can list tee times automatically.'
      : 'Bergen is still showing a browser verification challenge. Complete it in the opened browser, then click Save session.'
  }

  const saved: SavedConnection = {
    id,
    sessionHeader,
    connected,
    usable,
    message,
    updatedAt: new Date().toISOString(),
  }
  await writeSavedConnection(saved)
  await context.storageState({ path: path.join(connectionsDir, `${id}.storage-state.json`) }).catch(() => undefined)
  return saved
}

export async function openConnection(id: ConnectionId): Promise<ConnectionStatus> {
  const config = connectionConfigs[id]
  const context = await getContext(id, true)
  const page = await getPage(context)
  await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined)
  const saved = await capture(id, context, page)
  return toStatus(id, saved)
}

export async function refreshConnection(id: ConnectionId): Promise<ConnectionStatus> {
  const config = connectionConfigs[id]
  const context = await getContext(id, true)
  const page = await getPage(context)
  if (!page.url() || page.url() === 'about:blank') {
    await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined)
  }
  const saved = await capture(id, context, page)
  return toStatus(id, saved)
}

export async function getConnectionStatuses(): Promise<ConnectionStatus[]> {
  return Promise.all((Object.keys(connectionConfigs) as ConnectionId[]).map((id) => getConnectionStatus(id)))
}

export async function getConnectionStatus(id: ConnectionId): Promise<ConnectionStatus> {
  return toStatus(id, await readSavedConnection(id))
}

export async function getConnectionSessionHeader(id: ConnectionId) {
  const saved = await readSavedConnection(id)
  return saved?.usable ? saved.sessionHeader : undefined
}

function toStatus(id: ConnectionId, saved: SavedConnection | null): ConnectionStatus {
  const config = connectionConfigs[id]
  return {
    id,
    label: config.label,
    url: config.url,
    browserOpen: contexts.has(id),
    connected: Boolean(saved?.connected),
    usable: Boolean(saved?.usable),
    message: saved?.message || `Not connected. Open ${config.label} and sign in.`,
    updatedAt: saved?.updatedAt,
  }
}
