<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: false })

const { login, setToken, savedInstances, removeInstance, storedUrl } = useDirectus()
const router = useRouter()

const directusUrl = ref(storedUrl.value ?? '')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const showSaved = ref(false)

// Pre-fill URL from saved instance on click
function selectInstance(url: string) {
  directusUrl.value = url
  showSaved.value = false
}

async function handleLogin() {
  if (!directusUrl.value || !email.value || !password.value) return
  loading.value = true
  error.value = ''
  try {
    const token = await login(directusUrl.value.trim(), email.value, password.value)
    setToken(token)
    await router.push('/')
  } catch (e: any) {
    error.value = e?.data?.errors?.[0]?.message || 'Login fehlgeschlagen. URL, E-Mail oder Passwort prüfen.'
  } finally {
    loading.value = false
  }
}

function deleteSaved(e: Event, url: string) {
  e.stopPropagation()
  removeInstance(url)
}
</script>

<template>
  <div class="login-root">
    <div class="login-bg">
      <div class="login-grid"></div>
    </div>

    <div class="login-card">
      <div class="login-brand">
        <div class="brand-icon">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor" opacity="0.9"/>
            <rect x="16" y="2" width="10" height="10" rx="2" fill="currentColor" opacity="0.5"/>
            <rect x="2" y="16" width="10" height="10" rx="2" fill="currentColor" opacity="0.5"/>
            <rect x="16" y="16" width="10" height="10" rx="2" fill="currentColor" opacity="0.9"/>
          </svg>
        </div>
        <div>
          <h1 class="brand-title">AltScan</h1>
          <p class="brand-sub">Barrierefreiheits-Dashboard</p>
        </div>
      </div>

      <h2 class="login-heading">Verbinden</h2>
      <p class="login-desc">Gib deine Directus-URL und Zugangsdaten ein</p>

      <form class="login-form" @submit.prevent="handleLogin">

        <!-- URL field with saved dropdown -->
        <div class="field-group">
          <label class="field-label" for="url">Directus URL</label>
          <div class="url-field-wrap">
            <svg class="field-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M2 7h10M7 2c-1.5 1.5-2 3-2 5s.5 3.5 2 5M7 2c1.5 1.5 2 3 2 5s-.5 3.5-2 5" stroke="currentColor" stroke-width="1.3"/>
            </svg>
            <input
              id="url"
              v-model="directusUrl"
              type="url"
              class="field-input has-icon"
              placeholder="https://directus.meinprojekt.de"
              autocomplete="off"
              required
            />
            <button
              v-if="savedInstances && savedInstances.length > 0"
              type="button"
              class="saved-toggle"
              :class="{ open: showSaved }"
              @click="showSaved = !showSaved"
              title="Gespeicherte Instanzen"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M2 4.5l4.5 4 4.5-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <!-- Saved instances dropdown -->
            <Transition name="dropdown">
              <div v-if="showSaved" class="saved-dropdown">
                <div class="saved-label">Zuletzt verwendet</div>
                <button
                  v-for="inst in savedInstances"
                  :key="inst"
                  type="button"
                  class="saved-item"
                  @click="selectInstance(inst)"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2"/>
                    <path d="M3 6h6M6 3c-1 1-1.5 2-1.5 3s.5 2 1.5 3M6 3c1 1 1.5 2 1.5 3s-.5 2-1.5 3" stroke="currentColor" stroke-width="1.2"/>
                  </svg>
                  <span class="saved-url">{{ inst }}</span>
                  <button
                    type="button"
                    class="saved-delete"
                    @click="deleteSaved($event, inst)"
                    title="Entfernen"
                  >
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M2.5 2.5l6 6M8.5 2.5l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                    </svg>
                  </button>
                </button>
              </div>
            </Transition>
          </div>
        </div>

        <div class="field-divider">
          <span>Zugangsdaten</span>
        </div>

        <div class="field-group">
          <label class="field-label" for="email">E-Mail</label>
          <input
            id="email"
            v-model="email"
            type="email"
            class="field-input"
            placeholder="admin@beispiel.de"
            autocomplete="email"
            required
          />
        </div>

        <div class="field-group">
          <label class="field-label" for="password">Passwort</label>
          <input
            id="password"
            v-model="password"
            type="password"
            class="field-input"
            placeholder="••••••••"
            autocomplete="current-password"
            required
          />
        </div>

        <div v-if="error" class="login-error">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 5v3M8 11h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          {{ error }}
        </div>

        <button type="submit" class="login-btn" :disabled="loading || !directusUrl || !email || !password">
          <span v-if="!loading">Verbinden & Anmelden</span>
          <span v-else class="btn-loading">
            <svg class="spin" width="15" height="15" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-dasharray="20" stroke-dashoffset="5"/>
            </svg>
            Verbinde…
          </span>
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-root {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0a0a0f;
  font-family: 'DM Sans', 'Inter', sans-serif;
  position: relative;
  overflow: hidden;
}

.login-bg {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 70%);
}

.login-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 48px 48px;
}

.login-card {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 440px;
  margin: 1.5rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 20px;
  padding: 2.5rem;
  backdrop-filter: blur(20px);
  box-shadow: 0 32px 64px rgba(0,0,0,0.4);
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  margin-bottom: 2rem;
}

.brand-icon {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.brand-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.02em;
  margin: 0;
}

.brand-sub {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.4);
  margin: 0;
}

.login-heading {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.03em;
  margin: 0 0 0.375rem;
}

.login-desc {
  font-size: 0.875rem;
  color: rgba(255,255,255,0.4);
  margin: 0 0 1.75rem;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field-label {
  font-size: 0.8rem;
  font-weight: 500;
  color: rgba(255,255,255,0.5);
}

.url-field-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.field-icon {
  position: absolute;
  left: 0.875rem;
  color: rgba(255,255,255,0.3);
  pointer-events: none;
  z-index: 1;
}

.field-input {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  padding: 0.75rem 1rem;
  color: #fff;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s, background 0.2s;
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
}

.field-input.has-icon {
  padding-left: 2.25rem;
  padding-right: 2.75rem;
}

.field-input::placeholder { color: rgba(255,255,255,0.22); }
.field-input:focus {
  border-color: rgba(99,102,241,0.6);
  background: rgba(99,102,241,0.08);
}

/* Saved toggle button (chevron inside URL field) */
.saved-toggle {
  position: absolute;
  right: 0.625rem;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: none;
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.saved-toggle:hover { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.7); }
.saved-toggle.open { background: rgba(99,102,241,0.2); color: #a5b4fc; }
.saved-toggle svg { transition: transform 0.2s; }
.saved-toggle.open svg { transform: rotate(180deg); }

/* Saved dropdown */
.saved-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: #1a1a26;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  overflow: hidden;
  z-index: 50;
  box-shadow: 0 12px 32px rgba(0,0,0,0.5);
}

.saved-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: rgba(255,255,255,0.3);
  letter-spacing: 0.07em;
  text-transform: uppercase;
  padding: 0.625rem 0.875rem 0.375rem;
}

.saved-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.6rem 0.875rem;
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.65);
  font-size: 0.8375rem;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
  font-family: inherit;
}
.saved-item:hover { background: rgba(99,102,241,0.12); color: #c7d2fe; }
.saved-item svg { flex-shrink: 0; color: rgba(255,255,255,0.3); }

.saved-url {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'DM Mono', 'Fira Mono', monospace;
  font-size: 0.8rem;
}

.saved-delete {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: rgba(255,255,255,0.25);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
  padding: 0;
}
.saved-delete:hover { background: rgba(239,68,68,0.2); color: #fca5a5; }

/* Divider */
.field-divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.25rem 0;
}
.field-divider::before,
.field-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(255,255,255,0.08);
}
.field-divider span {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.25);
  white-space: nowrap;
  letter-spacing: 0.04em;
}

.login-error {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  background: rgba(239,68,68,0.1);
  border: 1px solid rgba(239,68,68,0.25);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  color: #fca5a5;
  font-size: 0.8125rem;
  line-height: 1.4;
}
.login-error svg { flex-shrink: 0; margin-top: 1px; }

.login-btn {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border: none;
  border-radius: 10px;
  padding: 0.875rem 1.5rem;
  color: #fff;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
  width: 100%;
  margin-top: 0.25rem;
  font-family: inherit;
}
.login-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.login-btn:active:not(:disabled) { transform: translateY(0); }
.login-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.spin { animation: spin 0.8s linear infinite; }

/* Transitions */
.dropdown-enter-active,
.dropdown-leave-active { transition: all 0.15s ease; }
.dropdown-enter-from,
.dropdown-leave-to { opacity: 0; transform: translateY(-4px); }

@keyframes spin { to { transform: rotate(360deg); } }
</style>