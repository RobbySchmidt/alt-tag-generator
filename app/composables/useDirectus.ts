// composables/useDirectus.ts
export interface DirectusFile {
  id: string
  title: string | null
  description: string | null
  filename_download: string
  type: string
  width: number | null
  height: number | null
  filesize: number
  uploaded_on: string
  modified_on: string
}

export type AltTextStatus = 'missing' | 'insufficient' | 'ok'

export interface EnrichedFile extends DirectusFile {
  status: AltTextStatus
  imageUrl: string
  generatedAlt?: string
  isGenerating?: boolean
  isSaving?: boolean
}

const INSUFFICIENT_PATTERNS = [
  /^img[_\-\s]?\d*$/i,
  /^image[_\-\s]?\d*$/i,
  /^foto[_\-\s]?\d*$/i,
  /^photo[_\-\s]?\d*$/i,
  /^dsc[_\-\s]?\d+$/i,
  /^untitled/i,
  /^\d+$/,
]

function getAltTextStatus(file: DirectusFile): AltTextStatus {
  const title = file.title?.trim()
  if (!title || title === '') return 'missing'

  const filenameWithoutExt = file.filename_download.replace(/\.[^/.]+$/, '')
  if (title.toLowerCase() === filenameWithoutExt.toLowerCase()) return 'insufficient'
  if (INSUFFICIENT_PATTERNS.some(p => p.test(title))) return 'insufficient'
  if (title.length < 10) return 'insufficient'

  return 'ok'
}

export function useDirectus() {
  const token = useCookie('directus_token', { maxAge: 60 * 60 * 8 })

  // Stores the currently active Directus URL
  const storedUrl = useCookie('directus_url', { maxAge: 60 * 60 * 24 * 30 })

  // Stores list of previously used Directus URLs (max 10)
  const savedInstances = useCookie<string[]>('directus_instances', {
    maxAge: 60 * 60 * 24 * 90,
    default: () => [],
  })

  const baseUrl = computed(() => (storedUrl.value ?? '').replace(/\/$/, ''))

  function saveInstance(url: string) {
    const clean = url.replace(/\/$/, '')
    const current = savedInstances.value ?? []
    if (!current.includes(clean)) {
      savedInstances.value = [clean, ...current].slice(0, 10)
    }
  }

  function removeInstance(url: string) {
    savedInstances.value = (savedInstances.value ?? []).filter(u => u !== url)
  }

  async function login(url: string, email: string, password: string): Promise<string> {
    const cleanUrl = url.replace(/\/$/, '')
    const res = await $fetch<{ data: { access_token: string } }>(`${cleanUrl}/auth/login`, {
      method: 'POST',
      body: { email, password },
    })
    // Persist URL only after successful login
    storedUrl.value = cleanUrl
    saveInstance(cleanUrl)
    return res.data.access_token
  }

  async function fetchFiles(page = 1, limit = 200): Promise<{ files: EnrichedFile[]; total: number }> {
    const offset = (page - 1) * limit
    const url = baseUrl.value

    const res = await $fetch<{ data: DirectusFile[]; meta: { total_count: number } }>(
      `${url}/files`,
      {
        headers: { Authorization: `Bearer ${token.value}` },
        params: {
          filter: { type: { _starts_with: 'image/' } },
          fields: ['id', 'title', 'description', 'filename_download', 'type', 'width', 'height', 'filesize', 'uploaded_on', 'modified_on'],
          limit,
          offset,
          meta: 'total_count',
        },
      }
    )

    const files: EnrichedFile[] = res.data.map(file => ({
      ...file,
      status: getAltTextStatus(file),
      imageUrl: `${url}/assets/${file.id}?width=300&height=200&fit=cover&access_token=${token.value}`,
    }))

    return { files, total: res.meta.total_count }
  }

  async function updateFileTitle(fileId: string, title: string): Promise<void> {
    await $fetch(`${baseUrl.value}/files/${fileId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: { title },
    })
  }

  function getToken() { return token.value }
  function setToken(t: string) { token.value = t }

  function clearSession() {
    token.value = null
    storedUrl.value = null
  }

  return {
    login,
    fetchFiles,
    updateFileTitle,
    getToken,
    setToken,
    clearSession,
    baseUrl,
    storedUrl,
    savedInstances,
    removeInstance,
  }
}