// Admin page: the approval inbox and the pause switch for every account.
const TRANSLATIONS = {
  ru: {
    title: 'Пользователи',
    backLink: 'К расписанию',
    signOut: 'Выйти',
    intro: 'Новые пользователи появляются здесь после первого входа. Одобрите их, чтобы открыть доступ.',
    thEmail: 'Email', thState: 'Статус', thSignedUp: 'Зарегистрирован', thLastSignIn: 'Последний вход',
    loading: 'Загрузка…',
    empty: 'Пока нет ни одного пользователя.',
    loadError: 'Не удалось загрузить список. Попробуйте обновить страницу.',
    statePending: 'ожидает', stateApproved: 'активен', stateDisabled: 'отключён',
    you: '(это вы)',
    never: '—',
    approve: 'Одобрить', reject: 'Отклонить', disable: 'Отключить', enable: 'Включить',
    confirmReject: 'Отклонить {email}? Этот человек не сможет войти.',
    confirmDisable: 'Отключить {email}? Сессии будут завершены, WhatsApp отключён, очередь приостановлена.',
    done: 'Готово.',
    errAdminRequired: 'Нужны права администратора.',
    errNotFound: 'Аккаунт не найден.',
    errSelf: 'Нельзя изменить собственный аккаунт.',
    errInternal: 'Внутренняя ошибка',
    errCrossSite: 'Запрос отклонён: неверный источник.',
  },
  en: {
    title: 'Users',
    backLink: 'Back to schedule',
    signOut: 'Sign out',
    intro: 'New people appear here after their first sign-in. Approve them to grant access.',
    thEmail: 'Email', thState: 'State', thSignedUp: 'Signed up', thLastSignIn: 'Last sign-in',
    loading: 'Loading…',
    empty: 'No accounts yet.',
    loadError: 'Could not load the list. Try reloading the page.',
    statePending: 'pending', stateApproved: 'active', stateDisabled: 'disabled',
    you: '(you)',
    never: '—',
    approve: 'Approve', reject: 'Reject', disable: 'Disable', enable: 'Enable',
    confirmReject: 'Reject {email}? This person will not be able to sign in.',
    confirmDisable: 'Disable {email}? Their sessions end, WhatsApp disconnects and the queue is held.',
    done: 'Done.',
    errAdminRequired: 'Admin access required.',
    errNotFound: 'Account not found.',
    errSelf: 'You cannot change your own account.',
    errInternal: 'Internal error',
    errCrossSite: 'Cross-site request refused.',
  },
}
const SERVER_ERROR_KEYS = {
  'Admin access required.': 'errAdminRequired',
  'Account not found.': 'errNotFound',
  'You cannot change your own account.': 'errSelf',
  'Internal error': 'errInternal',
  'Cross-site request refused.': 'errCrossSite',
}
const ACTIONS_BY_STATE = { pending: ['approve', 'reject'], approved: ['disable'], disabled: ['enable'] }
const i18n = createI18n(TRANSLATIONS)
const { t, esc } = i18n
const $ = (id) => document.getElementById(id)
const fmt = () => new Intl.DateTimeFormat(i18n.lang === 'ru' ? 'ru-RU' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
let me = null
let rows = []
const inFlight = new Set()

async function api(path, opts) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts })
  if (res.status === 401) { window.location.href = '/auth/login?lang=' + encodeURIComponent(i18n.lang); throw new Error('Authentication required.') }
  if (res.status === 403 && path.startsWith('/api/me')) { window.location.href = '/'; throw new Error('Forbidden') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const key = SERVER_ERROR_KEYS[data.error]
    const err = new Error(key ? t(key) : (data.error || t('errInternal')))
    err.status = res.status
    throw err
  }
  return data
}

function showMsg(text, kind) {
  const el = $('msg')
  el.className = 'msg ' + (kind || '')
  el.textContent = text
}

function render() {
  i18n.apply()
  const tbody = $('list')
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="5" class="hint">${esc(t('empty'))}</td></tr>`; return }
  tbody.innerHTML = rows.map((u) => {
    const isMe = me && u.email === me.email
    const actions = isMe ? '' : (ACTIONS_BY_STATE[u.state] || []).map((a) =>
      `<button type="button" data-action="${a}" data-id="${u.id}" data-email="${esc(u.email)}" ${inFlight.has(u.id) ? 'disabled' : ''}>${esc(t(a))}</button>`).join('')
    const stateKey = { pending: 'statePending', approved: 'stateApproved', disabled: 'stateDisabled' }[u.state] || u.state
    return `<tr>
      <td>${esc(u.email)} ${isMe ? `<span class="hint">${esc(t('you'))}</span>` : ''}</td>
      <td><span class="state-badge ${esc(u.state)}">${esc(t(stateKey))}</span></td>
      <td>${u.created_at ? fmt().format(u.created_at) : t('never')}</td>
      <td>${u.last_sign_in_at ? fmt().format(u.last_sign_in_at) : t('never')}</td>
      <td class="actions-cell">${actions}</td>
    </tr>`
  }).join('')
}

async function load() {
  try {
    if (!me) me = await api('/api/me')
    if (!me.isAdmin) { window.location.href = '/'; return }
    rows = await api('/api/admin/users')
    render()
  } catch (err) {
    if (err.message !== 'Authentication required.' && err.message !== 'Forbidden') {
      $('list').innerHTML = `<tr><td colspan="5" class="error">${esc(t('loadError'))}</td></tr>`
      showMsg(err.message, 'error')
    }
  }
}

$('list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]')
  if (!btn) return
  const { action, email } = btn.dataset
  const id = Number(btn.dataset.id)
  if (action === 'reject' && !confirm(t('confirmReject', { email }))) return
  if (action === 'disable' && !confirm(t('confirmDisable', { email }))) return
  inFlight.add(id); render()
  try {
    await api(`/api/admin/users/${id}/${action}`, { method: 'POST' })
    showMsg(t('done'), 'ok')
  } catch (err) {
    showMsg(err.message, 'error')
  } finally {
    inFlight.delete(id)
    await load() // the list is authoritative after success or a 409
  }
})

i18n.bindSwitch($('langSwitch'), render)
i18n.apply()
load()
