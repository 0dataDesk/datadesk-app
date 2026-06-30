const TENANT_PALETTES = {
  furia: {
    '--color-primary':          '#792c24',
    '--color-primary-dark':     '#5a1f19',
    '--color-primary-light':    '#a03c32',
    '--color-bg-accent':        '#ffefc5',
    '--color-text-on-primary':  '#ffffff',
    '--font-brand':             "'Bebas Neue', sans-serif",
    '--font-main':              "'DM Sans', sans-serif",
    emoji: '🔥',
  },
  tita: {
    '--color-primary':          '#6A9BB5',
    '--color-primary-dark':     '#4A7A94',
    '--color-primary-light':    '#8BBACF',
    '--color-bg-accent':        '#F5F9FC',
    '--color-text-on-primary':  '#ffffff',
    '--font-brand':             "'Baloo 2', sans-serif",
    '--font-main':              "'DM Sans', sans-serif",
    emoji: '🥐',
  },
}

function setFaviconEmoji(emoji) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.font = '54px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, 32, 36)
  let link = document.querySelector("link[rel='icon']")
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = canvas.toDataURL('image/png')
}

function applyTenantTheme(tenant_id) {
  const palette = TENANT_PALETTES[tenant_id] || TENANT_PALETTES['furia']
  const root = document.documentElement
  Object.entries(palette).forEach(([key, val]) => {
    if (key.startsWith('--')) root.style.setProperty(key, val)
  })
  window._tenantEmoji = palette.emoji || ''
  if (palette.emoji) setFaviconEmoji(palette.emoji)
}

window.applyTenantTheme = applyTenantTheme
