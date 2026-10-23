// Shared bilingual helper for the small pages (the main page keeps its own copy of this logic).
// Usage: const i18n = createI18n(TRANSLATIONS); i18n.apply(); i18n.bindSwitch(document.getElementById('langSwitch'))
function createI18n(translations) {
  let lang = (document.cookie.match(/(?:^|; )lang=([a-z]{2})/) || [])[1] || localStorage.getItem('lang') || 'ru'
  if (!translations[lang]) lang = 'ru'
  const t = (key, params) => {
    let str = (translations[lang] && translations[lang][key]) ?? translations.ru[key] ?? key
    if (params) for (const [k, v] of Object.entries(params)) str = str.replace(`{${k}}`, v)
    return str
  }
  const apply = () => {
    document.documentElement.lang = lang
    if (translations[lang].title) document.title = t('title')
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n) })
    const sw = document.getElementById('langSwitch')
    if (sw) sw.value = lang
  }
  const bindSwitch = (select, onChange) => {
    if (!select) return
    select.addEventListener('change', (e) => {
      lang = translations[e.target.value] ? e.target.value : 'ru'
      localStorage.setItem('lang', lang)
      document.cookie = 'lang=' + lang + '; path=/; max-age=31536000; SameSite=Lax'
      apply()
      if (onChange) onChange()
    })
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  return { get lang() { return lang }, t, apply, bindSwitch, esc }
}
