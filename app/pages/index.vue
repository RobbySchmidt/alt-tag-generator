<script setup lang="ts">
import type { EnrichedFile } from '~/composables/useDirectus'

definePageMeta({ middleware: 'auth' })

const { fetchFiles, updateFileTitle, clearSession, getToken, baseUrl } = useDirectus()
const config = useRuntimeConfig()

// State
const files = ref<EnrichedFile[]>([])
const total = ref(0)
const page = ref(1)
const limit = 24
const loading = ref(false)
const scanDone = ref(false)
const filterStatus = ref<'all' | 'missing' | 'insufficient' | 'ok'>('all')
const searchQuery = ref('')
const selectedFile = ref<EnrichedFile | null>(null)
const editingAlt = ref('')
const generatingAll = ref(false)
const generatingAllProgress = ref(0)
const generatingAllTotal = ref(0)
const savingAll = ref(false)
const savingAllProgress = ref(0)
const savingAllTotal = ref(0)

const pendingSave = computed(() =>
  files.value.filter(f => f.generatedAlt)
)

// Stats
const stats = computed(() => ({
  total: files.value.length,
  missing: files.value.filter(f => f.status === 'missing').length,
  insufficient: files.value.filter(f => f.status === 'insufficient').length,
  ok: files.value.filter(f => f.status === 'ok').length,
}))

// Filtered files
const filteredFiles = computed(() => {
  let list = files.value
  if (filterStatus.value !== 'all') {
    list = list.filter(f => f.status === filterStatus.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(f =>
      (f.title ?? '').toLowerCase().includes(q) ||
      f.filename_download.toLowerCase().includes(q)
    )
  }
  return list
})

const needsAttention = computed(() =>
  files.value.filter(f => f.status === 'missing' || f.status === 'insufficient')
)

// Load images
async function scan() {
  loading.value = true
  scanDone.value = false
  files.value = []
  try {
    const res = await fetchFiles(1, 200) // fetch up to 200 for full overview
    files.value = res.files
    total.value = res.total
    scanDone.value = true
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

// Generate alt text for a single file
async function generateAlt(file: EnrichedFile) {
  file.isGenerating = true
  try {
    const res = await $fetch<{ altText: string }>('/api/generate-alt', {
      method: 'POST',
      body: {
        fileId: file.id,
        filename: file.filename_download,
        directusToken: getToken(),
        directusBaseUrl: baseUrl.value,
      },
    })
    file.generatedAlt = res.altText
    if (selectedFile.value?.id === file.id) {
      editingAlt.value = res.altText
    }
  } catch (e) {
    console.error('Alt generation failed', e)
  } finally {
    file.isGenerating = false
  }
}

// Generate for all files that need attention
async function generateAllAlt() {
  const targets = needsAttention.value.filter(f => !f.isGenerating)
  if (!targets.length) return
  generatingAll.value = true
  generatingAllTotal.value = targets.length
  generatingAllProgress.value = 0

  for (const file of targets) {
    await generateAlt(file)
    generatingAllProgress.value++
  }
  generatingAll.value = false
}

// Save alt text to Directus
async function saveAlt(file: EnrichedFile, altText: string) {
  file.isSaving = true
  try {
    await updateFileTitle(file.id, altText)
    file.title = altText
    // Re-evaluate status
    const { useDirectus: _ud } = await import('~/composables/useDirectus')
    // inline re-check
    const t = altText.trim()
    if (!t) file.status = 'missing'
    else if (t.length < 10) file.status = 'insufficient'
    else file.status = 'ok'

    file.generatedAlt = undefined
  } catch (e) {
    console.error(e)
  } finally {
    file.isSaving = false
    // Update selectedFile AFTER isSaving is reset so the panel reflects correct state
    if (selectedFile.value?.id === file.id) {
      selectedFile.value = { ...file, isSaving: false }
      editingAlt.value = ''
    }
  }
}

function openDetail(file: EnrichedFile) {
  selectedFile.value = file
  editingAlt.value = file.generatedAlt ?? file.title ?? ''
}

function closeDetail() {
  selectedFile.value = null
  editingAlt.value = ''
}

async function logout() {
  clearSession()
  await navigateTo('/login')
}

// Save all generated alt texts at once
async function saveAllAlt() {
  // Snapshot before loop so mutations during saving don't affect iteration
  const targets = files.value
    .filter(f => f.generatedAlt)
    .map(f => ({ id: f.id, altText: f.generatedAlt! }))

  if (!targets.length) return

  savingAll.value = true
  savingAllProgress.value = 0
  savingAllTotal.value = targets.length

  for (const { id, altText } of targets) {
    const file = files.value.find(f => f.id === id)
    if (file) await saveAlt(file, altText)
    savingAllProgress.value++
  }

  savingAll.value = false
}


const statusConfig = {
  missing: { label: 'Fehlend', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' },
  insufficient: { label: 'Unzureichend', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
  ok: { label: 'Korrekt', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)' },
}
</script>

<template>
  <div class="dashboard">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="brand-icon">
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
            <rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor" opacity="0.9"/>
            <rect x="16" y="2" width="10" height="10" rx="2" fill="currentColor" opacity="0.5"/>
            <rect x="2" y="16" width="10" height="10" rx="2" fill="currentColor" opacity="0.5"/>
            <rect x="16" y="16" width="10" height="10" rx="2" fill="currentColor" opacity="0.9"/>
          </svg>
        </div>
        <span class="brand-name">AltScan</span>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-section-label">Übersicht</div>
        <button
          class="nav-item"
          :class="{ active: filterStatus === 'all' }"
          @click="filterStatus = 'all'"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor"/>
            <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.5"/>
            <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.5"/>
            <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor"/>
          </svg>
          Alle Bilder
          <span class="nav-badge">{{ stats.total }}</span>
        </button>

        <div class="nav-section-label" style="margin-top: 1.25rem">Status</div>

        <button
          class="nav-item nav-missing"
          :class="{ active: filterStatus === 'missing' }"
          @click="filterStatus = 'missing'"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 5v3M8 11h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          Fehlend
          <span class="nav-badge badge-red">{{ stats.missing }}</span>
        </button>

        <button
          class="nav-item nav-warn"
          :class="{ active: filterStatus === 'insufficient' }"
          @click="filterStatus = 'insufficient'"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L14.5 13H1.5L8 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M8 6v3M8 11h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          Unzureichend
          <span class="nav-badge badge-amber">{{ stats.insufficient }}</span>
        </button>

        <button
          class="nav-item nav-ok"
          :class="{ active: filterStatus === 'ok' }"
          @click="filterStatus = 'ok'"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Korrekt
          <span class="nav-badge badge-green">{{ stats.ok }}</span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <button class="logout-btn" @click="logout">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M9 2H3a1 1 0 00-1 1v9a1 1 0 001 1h6M11 5l3 2.5L11 10M6 7.5h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Abmelden
        </button>
      </div>
    </aside>

    <!-- Main content -->
    <main class="main">
      <!-- Header -->
      <header class="main-header">
        <div class="header-left">
          <h1 class="page-title">Bild-Alt-Texte</h1>
          <p class="page-sub" v-if="scanDone">
            {{ filteredFiles.length }} von {{ stats.total }} Bildern angezeigt
          </p>
        </div>

        <div class="header-actions">
          <div v-if="scanDone" class="search-wrap">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" class="search-icon">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M10.5 10.5L13 13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Bilder suchen…"
              class="search-input"
            />
          </div>

          <button
            v-if="scanDone && needsAttention.length > 0"
            class="btn-generate-all"
            :disabled="generatingAll"
            @click="generateAllAlt"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 1L9 5.5H14L10.5 8.5L12 13L7.5 10L3 13L4.5 8.5L1 5.5H6L7.5 1Z" fill="currentColor"/>
            </svg>
            <span v-if="generatingAll">
              {{ generatingAllProgress }}/{{ generatingAllTotal }} generiert…
            </span>
            <span v-else>Alle KI-Alt-Texte generieren ({{ needsAttention.length }})</span>
          </button>

          <button
            v-if="scanDone && pendingSave.length > 0"
            class="btn-save-all"
            :disabled="savingAll"
            @click="saveAllAlt"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M11 1H2a1 1 0 00-1 1v11a1 1 0 001 1h11a1 1 0 001-1V4l-3-3z" stroke="currentColor" stroke-width="1.2"/>
              <path d="M4 1v4h7V1M4 9h7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            <span v-if="savingAll">{{ savingAllProgress }}/{{ savingAllTotal }} gespeichert…</span>
            <span v-else>Alle speichern ({{ pendingSave.length }})</span>
          </button>

          <button class="btn-scan" :disabled="loading" @click="scan">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" :class="{ 'spin': loading }">
              <path d="M13 7.5A5.5 5.5 0 112 7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M13 4v3.5h-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ loading ? 'Scannt…' : scanDone ? 'Erneut scannen' : 'Directus scannen' }}
          </button>
        </div>
      </header>

      <!-- Stats bar -->
      <div v-if="scanDone" class="stats-bar">
        <div class="stat-card">
          <div class="stat-value">{{ stats.total }}</div>
          <div class="stat-label">Bilder gesamt</div>
          <div class="stat-bar-track">
            <div class="stat-bar-fill fill-indigo" style="width: 100%"></div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-red">{{ stats.missing }}</div>
          <div class="stat-label">Kein Alt-Text</div>
          <div class="stat-bar-track">
            <div class="stat-bar-fill fill-red" :style="{ width: stats.total ? (stats.missing / stats.total * 100) + '%' : '0%' }"></div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-amber">{{ stats.insufficient }}</div>
          <div class="stat-label">Unzureichend</div>
          <div class="stat-bar-track">
            <div class="stat-bar-fill fill-amber" :style="{ width: stats.total ? (stats.insufficient / stats.total * 100) + '%' : '0%' }"></div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-green">{{ stats.ok }}</div>
          <div class="stat-label">Barrierefrei</div>
          <div class="stat-bar-track">
            <div class="stat-bar-fill fill-green" :style="{ width: stats.total ? (stats.ok / stats.total * 100) + '%' : '0%' }"></div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!scanDone && !loading" class="empty-state">
        <div class="empty-icon">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect x="4" y="8" width="32" height="24" rx="4" stroke="currentColor" stroke-width="2"/>
            <circle cx="14" cy="18" r="3" stroke="currentColor" stroke-width="1.5"/>
            <path d="M4 28l8-6 6 5 6-8 12 9" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
        </div>
        <h2 class="empty-title">Bereit zum Scannen</h2>
        <p class="empty-desc">
          Starte den Scan, um alle Bilder aus deiner Directus-Instanz zu analysieren
          und Alt-Texte zu überprüfen.
        </p>
        <button class="btn-scan btn-scan-large" @click="scan">
          <svg width="16" height="16" viewBox="0 0 15 15" fill="none">
            <path d="M13 7.5A5.5 5.5 0 112 7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M13 4v3.5h-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Directus jetzt scannen
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="loading-state">
        <div class="loading-spinner"></div>
        <p>Bilder werden geladen…</p>
      </div>

      <!-- Image grid -->
      <div v-if="scanDone && !loading" class="image-grid">
        <div
          v-for="file in filteredFiles"
          :key="file.id"
          class="image-card"
          :class="[`card-${file.status}`]"
          @click="openDetail(file)"
        >
          <div class="card-image-wrap">
            <img
              :src="file.imageUrl"
              :alt="file.title || ''"
              class="card-image"
              loading="lazy"
            />
            <div class="card-status-badge" :class="`badge-${file.status}`">
              <!-- Missing -->
              <svg v-if="file.status === 'missing'" width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M8 5v3M8 11h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <!-- Insufficient -->
              <svg v-else-if="file.status === 'insufficient'" width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14.5 13H1.5L8 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                <path d="M8 6v3M8 11h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <!-- OK -->
              <svg v-else width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>

            <div v-if="file.isGenerating" class="card-generating">
              <div class="mini-spinner"></div>
            </div>
          </div>

          <div class="card-meta">
            <p class="card-filename">{{ file.filename_download }}</p>
            <p class="card-alt" :class="{ 'alt-empty': !file.title }">
              {{ file.generatedAlt || file.title || 'Kein Alt-Text vorhanden' }}
            </p>
          </div>

          <div class="card-actions" @click.stop>
            <button
              class="card-btn"
              title="KI-Alt-Text generieren"
              :disabled="file.isGenerating"
              @click="generateAlt(file)"
            >
              <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
                <path d="M7.5 1L9 5.5H14L10.5 8.5L12 13L7.5 10L3 13L4.5 8.5L1 5.5H6L7.5 1Z" fill="currentColor"/>
              </svg>
            </button>
            <button
              v-if="file.generatedAlt"
              class="card-btn card-btn-save"
              title="Speichern"
              :disabled="file.isSaving"
              @click="saveAlt(file, file.generatedAlt!)"
            >
              <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
                <path d="M11 1H2a1 1 0 00-1 1v11a1 1 0 001 1h11a1 1 0 001-1V4l-3-3z" stroke="currentColor" stroke-width="1.2"/>
                <path d="M4 1v4h7V1M4 9h7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- Detail Panel -->
    <Transition name="panel">
      <div v-if="selectedFile" class="detail-overlay" @click.self="closeDetail">
        <div class="detail-panel">
          <div class="detail-header">
            <h2 class="detail-title">Alt-Text bearbeiten</h2>
            <button class="close-btn" @click="closeDetail">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div class="detail-image-wrap">
            <img :src="selectedFile.imageUrl" :alt="selectedFile.title || ''" class="detail-image"/>
          </div>

          <div class="detail-info">
            <div class="detail-row">
              <span class="detail-key">Datei</span>
              <span class="detail-val">{{ selectedFile.filename_download }}</span>
            </div>
            <div class="detail-row" v-if="selectedFile.width">
              <span class="detail-key">Auflösung</span>
              <span class="detail-val">{{ selectedFile.width }} × {{ selectedFile.height }} px</span>
            </div>
            <div class="detail-row">
              <span class="detail-key">Status</span>
              <span
                class="status-pill"
                :class="`pill-${selectedFile.status}`"
              >
                {{ statusConfig[selectedFile.status].label }}
              </span>
            </div>
          </div>

          <div class="detail-alt-section">
            <label class="detail-label">Alt-Text</label>
            <textarea
              v-model="editingAlt"
              class="alt-textarea"
              placeholder="Barrierefreier Alt-Text…"
              rows="3"
              maxlength="125"
            ></textarea>
            <div class="char-count" :class="{ 'char-warn': editingAlt.length > 100 }">
              {{ editingAlt.length }}/125 Zeichen
            </div>
          </div>

          <div class="detail-footer">
            <button
              class="btn-gen"
              :disabled="selectedFile.isGenerating"
              @click="generateAlt(selectedFile)"
            >
              <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
                <path d="M7.5 1L9 5.5H14L10.5 8.5L12 13L7.5 10L3 13L4.5 8.5L1 5.5H6L7.5 1Z" fill="currentColor"/>
              </svg>
              {{ selectedFile.isGenerating ? 'Generiert…' : 'KI-Vorschlag' }}
            </button>
            <button
              class="btn-save"
              :disabled="!editingAlt || selectedFile.isSaving"
              @click="saveAlt(selectedFile, editingAlt)"
            >
              {{ selectedFile.isSaving ? 'Speichert…' : 'In Directus speichern' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Layout */
.dashboard {
  display: flex;
  min-height: 100vh;
  background: #0a0a0f;
  color: #e8e8f0;
  font-family: 'DM Sans', 'Inter', sans-serif;
}

/* Sidebar */
.sidebar {
  width: 240px;
  flex-shrink: 0;
  background: rgba(255,255,255,0.03);
  border-right: 1px solid rgba(255,255,255,0.07);
  display: flex;
  flex-direction: column;
  padding: 1.5rem 1rem;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0 0.5rem;
  margin-bottom: 2rem;
}

.brand-icon {
  width: 34px;
  height: 34px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.brand-name {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #fff;
}

.nav-section-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: rgba(255,255,255,0.3);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0 0.75rem;
  margin-bottom: 0.375rem;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: rgba(255,255,255,0.5);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  margin-bottom: 2px;
}

.nav-item:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.8); }
.nav-item.active { background: rgba(99,102,241,0.15); color: #a5b4fc; }
.nav-missing.active { background: rgba(239,68,68,0.12); color: #fca5a5; }
.nav-warn.active { background: rgba(245,158,11,0.12); color: #fcd34d; }
.nav-ok.active { background: rgba(16,185,129,0.12); color: #6ee7b7; }

.nav-badge {
  margin-left: auto;
  font-size: 0.7rem;
  font-weight: 600;
  background: rgba(255,255,255,0.1);
  padding: 0.125rem 0.5rem;
  border-radius: 99px;
}
.badge-red { background: rgba(239,68,68,0.2); color: #fca5a5; }
.badge-amber { background: rgba(245,158,11,0.2); color: #fcd34d; }
.badge-green { background: rgba(16,185,129,0.2); color: #6ee7b7; }

.sidebar-footer {
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid rgba(255,255,255,0.06);
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: rgba(255,255,255,0.35);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.15s;
}
.logout-btn:hover { background: rgba(239,68,68,0.1); color: #fca5a5; }

/* Main */
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 1.75rem 2rem;
  overflow-x: hidden;
}

.main-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.75rem;
  flex-wrap: wrap;
}

.page-title {
  font-size: 1.375rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: #fff;
  margin: 0;
}

.page-sub {
  font-size: 0.8125rem;
  color: rgba(255,255,255,0.4);
  margin: 0.125rem 0 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  color: rgba(255,255,255,0.3);
  pointer-events: none;
}

.search-input {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 0.5rem 0.875rem 0.5rem 2.25rem;
  color: #fff;
  font-size: 0.875rem;
  outline: none;
  width: 200px;
  transition: all 0.2s;
}
.search-input::placeholder { color: rgba(255,255,255,0.25); }
.search-input:focus { border-color: rgba(99,102,241,0.5); background: rgba(99,102,241,0.08); }

.btn-scan {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  color: rgba(255,255,255,0.8);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.btn-scan:hover:not(:disabled) { background: rgba(255,255,255,0.12); color: #fff; }
.btn-scan:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-scan-large { padding: 0.75rem 1.5rem; font-size: 0.9375rem; }

.btn-generate-all {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3));
  border: 1px solid rgba(99,102,241,0.4);
  border-radius: 8px;
  color: #a5b4fc;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.btn-generate-all:hover:not(:disabled) { background: linear-gradient(135deg, rgba(99,102,241,0.45), rgba(139,92,246,0.45)); }
.btn-generate-all:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-save-all {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, rgba(16,185,129,0.2), rgba(5,150,105,0.2));
  border: 1px solid rgba(16,185,129,0.35);
  border-radius: 8px;
  color: #6ee7b7;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  font-family: inherit;
}
.btn-save-all:hover:not(:disabled) { background: linear-gradient(135deg, rgba(16,185,129,0.32), rgba(5,150,105,0.32)); }
.btn-save-all:disabled { opacity: 0.5; cursor: not-allowed; }

/* Stats */
.stats-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1.75rem;
}

.stat-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  padding: 1rem 1.25rem;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.04em;
  color: #fff;
  line-height: 1;
}
.text-red { color: #f87171; }
.text-amber { color: #fbbf24; }
.text-green { color: #34d399; }

.stat-label {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.4);
  margin: 0.25rem 0 0.75rem;
}

.stat-bar-track {
  height: 3px;
  background: rgba(255,255,255,0.08);
  border-radius: 99px;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.5s ease;
}
.fill-indigo { background: #6366f1; }
.fill-red { background: #ef4444; }
.fill-amber { background: #f59e0b; }
.fill-green { background: #10b981; }

/* Empty / Loading */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 4rem 2rem;
  gap: 1rem;
}

.empty-icon {
  width: 72px;
  height: 72px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,0.3);
  margin-bottom: 0.5rem;
}

.empty-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.empty-desc {
  font-size: 0.9rem;
  color: rgba(255,255,255,0.4);
  max-width: 360px;
  line-height: 1.6;
  margin: 0;
}

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: rgba(255,255,255,0.4);
  font-size: 0.875rem;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 2px solid rgba(255,255,255,0.1);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Image Grid */
.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}

.image-card {
  background: rgba(255,255,255,0.04);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid rgba(255,255,255,0.07);
  display: flex;
  flex-direction: column;
}

.image-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255,255,255,0.15);
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}

.card-missing { border-color: rgba(239,68,68,0.2); }
.card-insufficient { border-color: rgba(245,158,11,0.2); }
.card-ok { border-color: rgba(16,185,129,0.15); }

.card-image-wrap {
  position: relative;
  aspect-ratio: 16/9;
  background: rgba(255,255,255,0.03);
  overflow: hidden;
}

.card-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.card-status-badge {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.badge-missing { background: rgba(239,68,68,0.85); color: white; }
.badge-insufficient { background: rgba(245,158,11,0.85); color: white; }
.badge-ok { background: rgba(16,185,129,0.85); color: white; }

.card-generating {
  position: absolute;
  inset: 0;
  background: rgba(10,10,15,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.mini-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255,255,255,0.15);
  border-top-color: #a5b4fc;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.card-meta {
  padding: 0.75rem 0.875rem;
  flex: 1;
}

.card-filename {
  font-size: 0.7rem;
  color: rgba(255,255,255,0.35);
  margin: 0 0 0.25rem;
  truncate: true;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-alt {
  font-size: 0.8125rem;
  color: rgba(255,255,255,0.7);
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.alt-empty {
  color: rgba(255,255,255,0.25);
  font-style: italic;
}

.card-actions {
  display: flex;
  gap: 0.375rem;
  padding: 0 0.875rem 0.75rem;
}

.card-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  transition: all 0.15s;
}

.card-btn:hover:not(:disabled) { background: rgba(99,102,241,0.2); border-color: rgba(99,102,241,0.4); color: #a5b4fc; }
.card-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.card-btn-save {
  background: rgba(16,185,129,0.1);
  border-color: rgba(16,185,129,0.3);
  color: #34d399;
}
.card-btn-save:hover:not(:disabled) { background: rgba(16,185,129,0.25); }

/* Detail Panel */
.detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
}

.detail-panel {
  width: 400px;
  background: #13131a;
  border-left: 1px solid rgba(255,255,255,0.1);
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  overflow-y: auto;
  gap: 1.25rem;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.detail-title {
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.close-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }

.detail-image-wrap {
  aspect-ratio: 16/9;
  background: rgba(255,255,255,0.03);
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.07);
}

.detail-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.detail-key {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.35);
  flex-shrink: 0;
}

.detail-val {
  font-size: 0.8125rem;
  color: rgba(255,255,255,0.7);
  text-align: right;
  word-break: break-all;
}

.status-pill {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 99px;
  letter-spacing: 0.02em;
}
.pill-missing { background: rgba(239,68,68,0.15); color: #fca5a5; border: 1px solid rgba(239,68,68,0.3); }
.pill-insufficient { background: rgba(245,158,11,0.15); color: #fcd34d; border: 1px solid rgba(245,158,11,0.3); }
.pill-ok { background: rgba(16,185,129,0.15); color: #6ee7b7; border: 1px solid rgba(16,185,129,0.3); }

.detail-alt-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.detail-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(255,255,255,0.5);
  letter-spacing: 0.02em;
}

.alt-textarea {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 0.75rem;
  color: #fff;
  font-size: 0.875rem;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  font-family: inherit;
  transition: border-color 0.2s;
  width: 100%;
  box-sizing: border-box;
}
.alt-textarea:focus { border-color: rgba(99,102,241,0.5); }

.char-count {
  font-size: 0.7rem;
  color: rgba(255,255,255,0.3);
  text-align: right;
}
.char-warn { color: #fbbf24; }

.detail-footer {
  display: flex;
  gap: 0.75rem;
  margin-top: auto;
  padding-top: 0.5rem;
}

.btn-gen {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: rgba(99,102,241,0.15);
  border: 1px solid rgba(99,102,241,0.3);
  border-radius: 8px;
  color: #a5b4fc;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.btn-gen:hover:not(:disabled) { background: rgba(99,102,241,0.25); }
.btn-gen:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-save {
  flex: 1;
  padding: 0.625rem 1rem;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-save:hover:not(:disabled) { opacity: 0.9; }
.btn-save:disabled { opacity: 0.4; cursor: not-allowed; }

/* Transitions */
.panel-enter-active,
.panel-leave-active {
  transition: all 0.25s ease;
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
}
.panel-enter-from .detail-panel,
.panel-leave-to .detail-panel {
  transform: translateX(100%);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spin { animation: spin 0.8s linear infinite; }

/* Responsive */
@media (max-width: 900px) {
  .sidebar { display: none; }
  .stats-bar { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 600px) {
  .main { padding: 1rem; }
  .detail-panel { width: 100%; }
  .image-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
}

</style>