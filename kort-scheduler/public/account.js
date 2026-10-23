// Waiting / disabled page. The server injects the account state into <body data-state>.
const TRANSLATIONS = {
  ru: {
    title: 'Планировщик WhatsApp',
    signOut: 'Выйти',
    pendingText: 'Ваш аккаунт ожидает подтверждения администратором.',
    pendingHint: 'Эта страница обновится автоматически, как только доступ будет открыт.',
    disabledText: 'Ваш аккаунт отключён.',
    disabledHint: 'Обратитесь к администратору, если считаете, что это ошибка.',
  },
  en: {
    title: 'WhatsApp Scheduler',
    signOut: 'Sign out',
    pendingText: 'Your account is waiting for the administrator’s approval.',
    pendingHint: 'This page refreshes on its own as soon as access is granted.',
    disabledText: 'Your account is disabled.',
    disabledHint: 'Contact the administrator if you think this is a mistake.',
  },
}
const POLL_MS = 5000
const i18n = createI18n(TRANSLATIONS)
const $ = (id) => document.getElementById(id)
let state = document.body.dataset.state === 'disabled' ? 'disabled' : 'pending'
let timer = null

function render() {
  i18n.apply()
  document.body.dataset.state = state
  $('stateText').textContent = i18n.t(state === 'disabled' ? 'disabledText' : 'pendingText')
  $('stateHint').textContent = i18n.t(state === 'disabled' ? 'disabledHint' : 'pendingHint')
}

async function poll() {
  if (state !== 'pending' || document.hidden) return
  try {
    const res = await fetch('/api/me', { headers: { Accept: 'application/json' } })
    if (res.status === 401) { window.location.href = '/auth/login?lang=' + encodeURIComponent(i18n.lang); return }
    if (!res.ok) return // keep the current text and try again later
    const me = await res.json()
    if (me.state === 'approved') { window.location.reload(); return }
    if (me.state === 'disabled') { state = 'disabled'; render(); clearInterval(timer) }
  } catch {
    // network hiccup: keep polling
  }
}

i18n.bindSwitch($('langSwitch'), render)
render()
if (state === 'pending') {
  timer = setInterval(poll, POLL_MS)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll() })
}
