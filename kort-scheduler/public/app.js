const TRANSLATIONS = {
  ru: {
    appTitle: 'Планировщик WhatsApp',
    connectTitle: 'Подключение WhatsApp',
    connectHint: 'На телефоне откройте WhatsApp → Настройки → Связанные устройства → Привязать устройство, затем отсканируйте этот код.',
    qrAlt: 'QR-код',
    composeTitle: 'Запланировать сообщение',
    groupLabel: 'Группа',
    groupFilterPlaceholder: 'Поиск групп…',
    loadingGroups: 'Загрузка групп…',
    chooseGroup: '— выберите группу —',
    messageLabel: 'Сообщение',
    messagePlaceholder: 'Введите текст сообщения…',
    sendAtLabel: 'Время отправки',
    templateHint: '{{day}}, {{month}} и {{year}} заменяются датой через неделю после отправки, например: {{day}}.{{month}} 16:30 - 18:00',
    templatePreview: 'Будет отправлено: {text}',
    errUnknownPlaceholder: 'Неизвестная подстановка. Используйте {{day}}, {{month}} или {{year}}.',
    timezonePrefix: 'Часовой пояс: ',
    repeatLabel: 'Повтор',
    repeatNone: 'Не повторять',
    repeatWeekly: 'Еженедельно',
    repeatMonthly: 'Ежемесячно',
    repeatHint: 'Повторяющееся сообщение будет отправляться автоматически; следующая отправка появится в списке после текущей.',
    scheduleBtn: 'Запланировать',
    refreshGroupsBtn: 'Обновить группы',
    recentBtn: 'Последние сообщения',
    recentTitle: 'Последние сообщения в «{group}»',
    recentSince: 'Собираются с {date}, пока приложение подключено; после перезапуска список начинается заново.',
    recentEmpty: 'С {date} в этой группе сообщений не было.',
    recentNotCollecting: 'WhatsApp не подключён, сообщения не собираются.',
    recentHint: 'Время сервера WhatsApp — с точностью до секунды; «Получено» — когда сообщение дошло до нашего сервера (ваше — когда ушло). Строки идут в порядке поступления.',
    recentYou: 'Вы',
    recentUndecrypted: '[не удалось расшифровать]',
    thServerTime: 'Время сервера',
    thReceived: 'Получено',
    thFrom: 'От',
    thText: 'Текст',
    scheduledTitle: 'Запланированные сообщения',
    thWhen: 'Когда',
    thGroup: 'Группа',
    thMessage: 'Сообщение',
    thRepeat: 'Повтор',
    thStatus: 'Статус',
    nothingScheduled: 'Пока ничего не запланировано.',
    accountLogoutBtn: 'Выйти',
    logoutBtn: 'Выйти из WhatsApp',
    logoutHint: 'Выход очищает сохранённую сессию и показывает новый QR-код.',
    logoutConfirm: 'Выйти из WhatsApp? Запланированные сообщения останутся в очереди и будут отправлены после повторного подключения.',
    statusConnected: 'Подключено',
    statusConnectedAs: 'Подключено как {name}',
    statusConnecting: 'Подключение…',
    statusQr: 'Отсканируйте QR-код',
    statusDisconnected: 'Отключено — переподключение…',
    statusLoggedOut: 'Вы вышли из системы',
    statusNotLinked: 'Телефон не привязан',
    adminLink: 'Пользователи',
    stMissed: 'пропущено',
    stMissedHint: 'Не отправлено: аккаунт был приостановлен в это время.',
    serverUnreachable: 'Сервер недоступен',
    qrRefreshHint: 'Код обновляется автоматически.',
    waitingHint: 'Ожидание WhatsApp… ',
    cancelBtn: 'Отменить',
    deleteBtn: 'Удалить',
    stPending: 'в очереди',
    upcomingTitle: 'Следующие отправки',
    stSending: 'отправка…',
    stCancelled: 'отменено',
    stSent: 'отправлено {date}',
    stFailed: 'ошибка: {error}',
    stOverdue: 'в очереди (ожидание подключения)',
    stRetry: 'в очереди (попытка {n})',
    countText: '{pending} в очереди · {total} всего',
    scheduledFor: 'Запланировано на {date}',
    errWhatsappNotConnected: 'WhatsApp не подключён',
    errChooseGroup: 'Выберите группу.',
    errMessageEmpty: 'Сообщение не может быть пустым.',
    errMessageTooLong: 'Сообщение слишком длинное (максимум {max} символов).',
    errInvalidDate: 'Некорректная дата/время.',
    errPastTime: 'Указанное время уже прошло.',
    errOnlyPendingCancel: 'Отменить можно только ожидающие отправки сообщения.',
    errMessageNotFound: 'Сообщение не найдено.',
    errMessageSending: 'Сообщение сейчас отправляется.',
    errCrossSite: 'Запрос отклонён: неверный источник.',
    errInvalidRepeat: 'Некорректный вариант повтора.',
    errInternal: 'Внутренняя ошибка',
  },
  en: {
    appTitle: 'WhatsApp Scheduler',
    connectTitle: 'Connect WhatsApp',
    connectHint: 'On your phone open WhatsApp → Settings → Linked devices → Link a device, then scan this code.',
    qrAlt: 'QR code',
    composeTitle: 'Schedule a message',
    groupLabel: 'Group',
    groupFilterPlaceholder: 'Filter groups…',
    loadingGroups: 'Loading groups…',
    chooseGroup: '— choose a group —',
    messageLabel: 'Message',
    messagePlaceholder: 'Type the message to send…',
    sendAtLabel: 'Send at',
    templateHint: '{{day}}, {{month}} and {{year}} are replaced with the date one week after sending, for example: {{day}}.{{month}} 16:30 - 18:00',
    templatePreview: 'Will be sent as: {text}',
    errUnknownPlaceholder: 'Unknown placeholder. Use {{day}}, {{month}} or {{year}}.',
    timezonePrefix: 'Timezone: ',
    repeatLabel: 'Repeat',
    repeatNone: "Don't repeat",
    repeatWeekly: 'Weekly',
    repeatMonthly: 'Monthly',
    repeatHint: 'A repeating message sends automatically; the next occurrence appears in the list after the current one goes out.',
    scheduleBtn: 'Schedule',
    refreshGroupsBtn: 'Refresh groups',
    recentBtn: 'Recent messages',
    recentTitle: 'Recent messages in “{group}”',
    recentSince: 'Collected since {date} while the app is connected; the list starts over after a restart.',
    recentEmpty: 'No messages in this group since {date}.',
    recentNotCollecting: 'WhatsApp is not connected, so no messages are being collected.',
    recentHint: 'WhatsApp’s server time is to the second; “Received” is when the message reached our server (yours: when it left). Rows are in arrival order.',
    recentYou: 'You',
    recentUndecrypted: '[could not decrypt]',
    thServerTime: 'Server time',
    thReceived: 'Received',
    thFrom: 'From',
    thText: 'Text',
    scheduledTitle: 'Scheduled messages',
    thWhen: 'When',
    thGroup: 'Group',
    thMessage: 'Message',
    thRepeat: 'Repeat',
    thStatus: 'Status',
    nothingScheduled: 'Nothing scheduled yet.',
    accountLogoutBtn: 'Sign out',
    logoutBtn: 'Log out of WhatsApp',
    logoutHint: 'Logging out clears the saved session and shows a new QR code.',
    logoutConfirm: 'Log out of WhatsApp? Pending messages stay scheduled and will send once you link again.',
    statusConnected: 'Connected',
    statusConnectedAs: 'Connected as {name}',
    statusConnecting: 'Connecting…',
    statusQr: 'Scan QR code',
    statusDisconnected: 'Disconnected — reconnecting…',
    statusLoggedOut: 'Logged out',
    statusNotLinked: 'Phone not linked',
    adminLink: 'Users',
    stMissed: 'missed',
    stMissedHint: 'Not sent: the account was paused at the time.',
    serverUnreachable: 'Server unreachable',
    qrRefreshHint: 'The code refreshes automatically.',
    waitingHint: 'Waiting for WhatsApp… ',
    cancelBtn: 'Cancel',
    deleteBtn: 'Delete',
    stPending: 'pending',
    upcomingTitle: 'Next sends',
    stSending: 'sending…',
    stCancelled: 'cancelled',
    stSent: 'sent {date}',
    stFailed: 'failed: {error}',
    stOverdue: 'pending (waiting for connection)',
    stRetry: 'pending (retry {n})',
    countText: '{pending} pending · {total} total',
    scheduledFor: 'Scheduled for {date}',
    errWhatsappNotConnected: 'WhatsApp is not connected',
    errChooseGroup: 'Please choose a group.',
    errMessageEmpty: 'Message cannot be empty.',
    errMessageTooLong: 'Message is too long (max {max} characters).',
    errInvalidDate: 'Invalid date/time.',
    errPastTime: 'The scheduled time is in the past.',
    errOnlyPendingCancel: 'Only pending messages can be cancelled.',
    errMessageNotFound: 'Message not found.',
    errMessageSending: 'Message is being sent right now.',
    errCrossSite: 'Cross-site request refused.',
    errInvalidRepeat: 'Invalid repeat option.',
    errInternal: 'Internal error',
  },
}

// Maps the fixed English strings the server returns to translation keys,
// since the API itself is not localized.
const SERVER_ERROR_KEYS = {
  'WhatsApp is not connected': 'errWhatsappNotConnected',
  'Please choose a group.': 'errChooseGroup',
  'Message cannot be empty.': 'errMessageEmpty',
  'Message is too long (max 4096 characters).': 'errMessageTooLong',
  'Invalid date/time.': 'errInvalidDate',
  'The scheduled time is in the past.': 'errPastTime',
  'Only pending messages can be cancelled.': 'errOnlyPendingCancel',
  'Message not found.': 'errMessageNotFound',
  'Message is being sent right now.': 'errMessageSending',
  'Cross-site request refused.': 'errCrossSite',
  'Invalid repeat option.': 'errInvalidRepeat',
  'Unknown placeholder. Use {{day}}, {{month}} or {{year}}.': 'errUnknownPlaceholder',
  'Internal error': 'errInternal',
}

let lang = localStorage.getItem('lang') || 'ru'
if (!TRANSLATIONS[lang]) lang = 'ru'

function t(key, params) {
  let str = (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) ?? TRANSLATIONS.ru[key] ?? key
  if (params) for (const [k, v] of Object.entries(params)) str = str.replace(`{${k}}`, v)
  return str
}

function translateServerError(message) {
  const key = SERVER_ERROR_KEYS[message]
  return key ? t(key, { max: 4096 }) : message
}

function applyTranslations() {
  document.documentElement.lang = lang
  document.title = t('appTitle')
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n) })
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder) })
  document.querySelectorAll('[data-i18n-alt]').forEach((el) => { el.alt = t(el.dataset.i18nAlt) })
  $('tz').textContent = t('timezonePrefix') + zone
  $('langSwitch').value = lang
  updateTemplatePreview()
  renderGroups()
  refreshStatus()
  refreshList()
}

const $ = (id) => document.getElementById(id)
const fmt = () => new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone })

// Send times are shown and entered in the app's time zone (from /api/me), not the device's.
let zone = 'Asia/Jerusalem'
const pad = (n) => String(n).padStart(2, '0')

// 'YYYY-MM-DDTHH:MM' in the app's zone, the format of the datetime-local input.
function toInputValue(ms) {
  const p = window.MessageTemplate.zonedParts(ms, zone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

function fromInputValue(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!m) return NaN
  const [year, month, day, hour, minute] = m.slice(1).map(Number)
  return window.MessageTemplate.zonedTime({ year, month, day, hour, minute }, zone)
}
let groups = []
let lastStatus = null
let groupsLoadedFor = null

async function api(path, opts) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts })
  if (res.status === 401) {
    window.location.href = '/auth/login?lang=' + encodeURIComponent(lang)
    throw new Error('Authentication required.')
  }
  if (res.status === 403) {
    // not approved any more (or not yet): the server renders the right page on /
    window.location.href = '/'
    throw new Error('Forbidden')
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(translateServerError(data.error) || res.statusText)
  return data
}

// Shows the message with {{day}}/{{month}}/{{year}} filled in (a week after the chosen time).
function updateTemplatePreview() {
  const el = $('templatePreview')
  const text = $('message').value
  const tpl = window.MessageTemplate
  const sendAt = tpl ? fromInputValue($('sendAt').value) : NaN
  if (!tpl || !text.includes('{{') || !Number.isFinite(sendAt)) {
    el.hidden = true
    return
  }
  el.hidden = false
  el.textContent = tpl.unknownPlaceholders(text).length
    ? t('errUnknownPlaceholder')
    : t('templatePreview', { text: tpl.renderTemplate(text, sendAt, zone) })
}

// Suggests ten minutes from now; any time from the current minute on is allowed.
function setDefaultTime() {
  if (!$('sendAt').value) $('sendAt').value = toInputValue(Date.now() + 10 * 60 * 1000)
  $('sendAt').min = toInputValue(Date.now())
}

function renderGroups() {
  const q = $('groupFilter').value.trim().toLowerCase()
  const sel = $('group')
  const current = sel.value
  const items = groups.filter((g) => !q || g.name.toLowerCase().includes(q))
  sel.innerHTML = `<option value="">${esc(t('chooseGroup'))}</option>` +
    items.map((g) => `<option value="${g.jid}" ${g.jid === current ? 'selected' : ''}>${esc(g.name)} (${g.participants})</option>`).join('')
  if (items.length === 1) sel.value = items[0].jid
}

async function loadGroups(force = false) {
  const sel = $('group')
  try {
    groups = await api('/api/groups' + (force ? '?refresh=1' : ''))
    renderGroups()
    groupsLoadedFor = 'connected'
  } catch (err) {
    sel.innerHTML = `<option value="">${esc(err.message)}</option>`
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

async function refreshStatus() {
  try {
    const s = await api('/api/status')
    const badge = $('status')
    badge.className = 'badge ' + s.status
    // idle = no connection running yet; a linked phone is about to connect, an unlinked one needs a QR
    const shown = s.status === 'idle' ? (s.linked ? 'connecting' : 'not_linked') : s.status
    badge.className = 'badge ' + (shown === 'not_linked' ? 'disconnected' : shown)
    badge.textContent = {
      connected: s.me?.name ? t('statusConnectedAs', { name: s.me.name }) : t('statusConnected'),
      connecting: t('statusConnecting'),
      qr: t('statusQr'),
      disconnected: t('statusDisconnected'),
      logged_out: t('statusLoggedOut'),
      not_linked: t('statusNotLinked'),
    }[shown] || shown

    $('login').classList.toggle('hidden', s.status === 'connected')
    $('qr').classList.toggle('hidden', !s.qr)
    if (s.qr) $('qr').src = s.qr
    $('loginHint').textContent = s.status === 'qr' ? t('qrRefreshHint') :
      s.status === 'connected' ? '' : t('waitingHint') + (s.lastError ? `(${s.lastError})` : '')
    $('submit').disabled = s.status !== 'connected'

    if (s.status === 'connected' && (lastStatus !== 'connected' || groupsLoadedFor !== 'connected')) loadGroups()
    if (s.status !== 'connected') groupsLoadedFor = null
    lastStatus = s.status
  } catch (err) {
    $('status').className = 'badge disconnected'
    $('status').textContent = t('serverUnreachable')
  }
}

// Next sends of each pending row, by id, for the "?" popup.
let upcomingById = new Map()
let lastListKey = ''

async function refreshList() {
  try {
    const rows = await api('/api/messages')
    // Re-render only on a change (data, language, or the minute that decides "overdue"),
    // so an open popup is not torn down by the 5-second refresh.
    const key = `${lang}|${Math.floor(Date.now() / 60_000)}|${JSON.stringify(rows)}`
    if (key === lastListKey) return
    lastListKey = key
    hideUpcoming()
    upcomingById = new Map(rows.filter((r) => r.upcoming).map((r) => [String(r.id), r.upcoming]))
    const tbody = $('list')
    const pending = rows.filter((r) => r.status === 'pending' || r.status === 'sending').length
    $('count').textContent = rows.length ? t('countText', { pending, total: rows.length }) : ''
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="hint">${esc(t('nothingScheduled'))}</td></tr>`
      return
    }
    tbody.innerHTML = rows.map((r) => {
      const overdue = r.status === 'pending' && r.send_at < Date.now() - 60_000
      const statusText = r.status === 'sent' ? t('stSent', { date: fmt().format(r.sent_at) }) :
        r.status === 'failed' ? t('stFailed', { error: esc(r.error || '') }) :
        r.status === 'missed' ? `<span title="${esc(t('stMissedHint'))}">${esc(t('stMissed'))}</span>` :
        overdue ? t('stOverdue') :
        r.status === 'pending' && r.attempts ? t('stRetry', { n: r.attempts }) :
        r.status === 'pending' ? t('stPending') :
        r.status === 'sending' ? t('stSending') :
        r.status === 'cancelled' ? t('stCancelled') : r.status
      const repeatText = r.repeat_rule === 'weekly' ? t('repeatWeekly') :
        r.repeat_rule === 'monthly' ? t('repeatMonthly') : '—'
      const action = r.status === 'pending'
        ? `<button class="link" data-cancel="${r.id}">${esc(t('cancelBtn'))}</button>`
        : r.status !== 'sending' ? `<button class="link" data-delete="${r.id}">${esc(t('deleteBtn'))}</button>` : ''
      return `<tr>
        <td>${fmt().format(r.send_at)}</td>
        <td>${esc(r.group_name || r.group_jid)}</td>
        <td class="msg"${r.preview && r.preview !== r.message ? ` title="${esc(r.message)}"` : ''}>${esc(r.preview ?? r.message)}</td>
        <td>${esc(repeatText)}</td>
        <td><span class="st ${r.status}">${statusText}</span>${r.upcoming ? ` <button type="button" class="upcoming" data-upcoming="${r.id}" aria-label="${esc(t('upcomingTitle'))}" aria-describedby="upcomingTip">?</button>` : ''}</td>
        <td>${action}</td>
      </tr>`
    }).join('')
  } catch {}
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const msg = $('formMsg')
  msg.className = ''; msg.textContent = ''
  const sel = $('group')
  const sendAt = fromInputValue($('sendAt').value)
  try {
    await api('/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        groupJid: sel.value,
        groupName: sel.selectedOptions[0]?.textContent.replace(/ \(\d+\)$/, '') || null,
        message: $('message').value,
        sendAt,
        repeat: $('repeat').value,
      }),
    })
    msg.className = 'ok'; msg.textContent = t('scheduledFor', { date: fmt().format(sendAt) })
    $('message').value = ''
    $('repeat').value = 'none'
    updateTemplatePreview()
    refreshList()
  } catch (err) {
    msg.className = 'error'; msg.textContent = err.message
  }
})

// Last messages of the chosen group, with WhatsApp's server time (seconds) and when
// they reached us (milliseconds), in arrival order.
const locale = () => (lang === 'ru' ? 'ru-RU' : 'en-US')
const fmtSeconds = () => new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: zone })
const fmtMillis = () => new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23', timeZone: zone })

async function showRecent() {
  const box = $('recentBox')
  const sel = $('group')
  const msg = $('formMsg')
  msg.className = ''; msg.textContent = ''
  if (!sel.value) {
    msg.className = 'error'; msg.textContent = t('errChooseGroup')
    return
  }
  try {
    const { since, messages } = await api(`/api/groups/${encodeURIComponent(sel.value)}/recent`)
    const name = sel.selectedOptions[0]?.textContent.replace(/ \(\d+\)$/, '') || sel.value
    $('recentTitle').textContent = t('recentTitle', { group: name })
    const sinceText = since ? fmtSeconds().format(since) : null
    $('recentInfo').textContent = !since ? t('recentNotCollecting')
      : messages.length ? t('recentSince', { date: sinceText }) : t('recentEmpty', { date: sinceText })
    $('recentList').innerHTML = messages.map((m) => `<tr${m.fromMe ? ' class="mine"' : ''}>
        <td class="time">${m.serverTime ? esc(fmtSeconds().format(m.serverTime)) : '—'}</td>
        <td class="time">${esc(fmtMillis().format(m.receivedAt))}</td>
        <td>${esc(m.fromMe ? t('recentYou') : (m.sender || '—'))}</td>
        <td class="msg">${esc(m.undecrypted ? t('recentUndecrypted') : m.text)}</td>
      </tr>`).join('')
    box.hidden = false
  } catch (err) {
    msg.className = 'error'; msg.textContent = err.message
  }
}

function showUpcoming(button) {
  const sends = upcomingById.get(button.dataset.upcoming)
  if (!sends) return
  const tip = $('upcomingTip')
  const when = new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: zone })
  tip.innerHTML = `<div class="tip-title">${esc(t('upcomingTitle'))}</div><ol>${sends.map((s) =>
    `<li><div class="tip-when">${esc(when.format(s.sendAt))}</div><div class="tip-text">${esc(s.text)}</div></li>`).join('')}</ol>`
  tip.hidden = false
  // Below the button, kept inside the window; above it when there is no room below.
  const b = button.getBoundingClientRect()
  const left = Math.max(16, Math.min(b.left, window.innerWidth - tip.offsetWidth - 16))
  const below = b.bottom + 6
  const top = below + tip.offsetHeight > window.innerHeight - 8 ? Math.max(8, b.top - tip.offsetHeight - 6) : below
  tip.style.left = `${left}px`
  tip.style.top = `${top}px`
}

function hideUpcoming() {
  $('upcomingTip').hidden = true
}

$('list').addEventListener('mouseover', (e) => {
  const button = e.target.closest('button.upcoming')
  if (button) showUpcoming(button)
})
$('list').addEventListener('mouseout', (e) => {
  const button = e.target.closest('button.upcoming')
  if (button && !button.contains(e.relatedTarget) && document.activeElement !== button) hideUpcoming()
})
$('list').addEventListener('focusin', (e) => {
  if (e.target.matches('button.upcoming')) showUpcoming(e.target)
})
$('list').addEventListener('focusout', (e) => {
  if (e.target.matches('button.upcoming')) hideUpcoming()
})
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideUpcoming() })
// Touch screens: a tap on "?" opens the popup, a tap anywhere else closes it.
document.addEventListener('click', (e) => {
  const button = e.target.closest?.('button.upcoming')
  if (button) showUpcoming(button)
  else if (!e.target.closest?.('#upcomingTip')) hideUpcoming()
})
window.addEventListener('scroll', hideUpcoming, { passive: true })

$('list').addEventListener('click', async (e) => {
  const cancel = e.target.dataset.cancel
  const del = e.target.dataset.delete
  if (!cancel && !del) return
  try {
    if (cancel) await api(`/api/messages/${cancel}/cancel`, { method: 'POST' })
    if (del) await api(`/api/messages/${del}`, { method: 'DELETE' })
  } catch (err) { alert(err.message) }
  refreshList()
})

$('groupFilter').addEventListener('input', renderGroups)
$('message').addEventListener('input', updateTemplatePreview)
$('sendAt').addEventListener('input', updateTemplatePreview)
$('refreshGroups').addEventListener('click', () => loadGroups(true))
$('recentBtn').addEventListener('click', showRecent)
$('group').addEventListener('change', () => { $('recentBox').hidden = true })
$('logout').addEventListener('click', async () => {
  if (!confirm(t('logoutConfirm'))) return
  try { await api('/api/logout', { method: 'POST' }) } catch (err) { alert(err.message) }
  refreshStatus()
})
$('langSwitch').addEventListener('change', (e) => {
  lang = TRANSLATIONS[e.target.value] ? e.target.value : 'ru'
  localStorage.setItem('lang', lang)
  document.cookie = 'lang=' + lang + '; path=/; max-age=31536000; SameSite=Lax'
  applyTranslations()
})

async function loadMe() {
  try {
    const me = await api('/api/me')
    $('adminLink').classList.toggle('hidden', !me.isAdmin)
    if (me.timeZone && me.timeZone !== zone) {
      zone = me.timeZone
      $('sendAt').value = ''
      setDefaultTime()
      applyTranslations()
    }
  } catch {}
}

applyTranslations()
loadMe()
setDefaultTime()
setInterval(refreshStatus, 3000)
setInterval(refreshList, 5000)
