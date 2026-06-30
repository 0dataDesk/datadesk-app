const TENANT_PALETTES = {
  furia: {
    '--color-primary':          '#792c24',
    '--color-primary-dark':     '#5a1f19',
    '--color-primary-light':    '#a03c32',
    '--color-bg-accent':        '#ffefc5',
    '--color-text-on-primary':  '#ffffff',
    '--font-brand':             "'Bebas Neue', sans-serif",
    '--font-main':              "'DM Sans', sans-serif",
  },
  tita: {
    '--color-primary':          '#6A9BB5',
    '--color-primary-dark':     '#4A7A94',
    '--color-primary-light':    '#8BBACF',
    '--color-bg-accent':        '#F5F9FC',
    '--color-text-on-primary':  '#ffffff',
    '--font-brand':             "'Baloo 2', sans-serif",
    '--font-main':              "'DM Sans', sans-serif",
  },
}

function applyTenantTheme(tenant_id) {
  const palette = TENANT_PALETTES[tenant_id] || TENANT_PALETTES['furia']
  const root = document.documentElement
  Object.entries(palette).forEach(([key, val]) => root.style.setProperty(key, val))
}

window.applyTenantTheme = applyTenantTheme
