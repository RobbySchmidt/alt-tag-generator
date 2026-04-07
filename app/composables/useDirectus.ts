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
  const storedUrl = useCookie('directus_url', { maxAge: 60 * 60 * 24 * 30 })
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
    storedUrl.value = cleanUrl
    saveInstance(cleanUrl)
    return res.data.access_token
  }

  async function fetchFiles(): Promise<{ files: EnrichedFile[]; total: number }> {
    const url = baseUrl.value
    const pageSize = 200
    let allFiles: EnrichedFile[] = []
    let page = 0

    while (true) {
      const res = await $fetch<{ data: DirectusFile[]; meta: { total_count: number } }>(
        `${url}/files`,
        {
          headers: { Authorization: `Bearer ${token.value}` },
          params: {
            filter: { type: { _starts_with: 'image/' } },
            fields: ['id', 'title', 'description', 'filename_download', 'type', 'width', 'height', 'filesize', 'uploaded_on', 'modified_on'],
            limit: pageSize,
            offset: page * pageSize,
            meta: 'total_count',
          },
        }
      )

      const batch = res.data.map(file => ({
        ...file,
        status: getAltTextStatus(file),
        imageUrl: `${url}/assets/${file.id}?width=300&height=200&fit=cover&access_token=${token.value}`,
      }))

      allFiles = [...allFiles, ...batch]
      page++

      // Stop if this batch was empty or we got fewer results than pageSize
      if (batch.length === 0 || batch.length < pageSize) break

      // Safety: stop if we somehow exceed total_count
      if (allFiles.length >= res.meta.total_count) break
    }

    return { files: allFiles, total: allFiles.length }
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