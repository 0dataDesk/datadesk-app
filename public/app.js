window.FUENTES_POR_TENANT = {
  tita: [
    { fuente: 'carga_eugenio', etiqueta: 'Cocina' },
    { fuente: 'barra_nacho',   etiqueta: 'Barra'  }
  ],
  furia: [
    { fuente: 'menu_charly', etiqueta: 'Menú Charly' }
  ]
}

let _appMontado = false

window._db.auth.onAuthStateChange(async (event, session) => {
  if (_appMontado && event !== 'SIGNED_OUT') return

  if (event === 'SIGNED_OUT') {
    _appMontado = false
    window._tenantConfig = null
    window._tenantActivo = null
    localStorage.removeItem('datadesk-view')
    localStorage.removeItem('datadesk-tenant-activo')
    await mostrarLogin()
    return
  }

  if (session) {
    _appMontado = true
    const tenants = session.user.user_metadata?.tenants
    const rol     = session.user.user_metadata?.rol || null
    const email   = session.user.email

    if (tenants && tenants.length > 1 && !window._tenantActivo) {
      const tenantGuardado = localStorage.getItem('datadesk-tenant-activo')
      if (tenantGuardado && tenants.includes(tenantGuardado)) {
        window._tenantActivo = tenantGuardado
        await mostrarApp(rol, email, tenantGuardado)
      } else {
        await mostrarSelectorTenant(tenants, rol, email)
      }
    } else {
      const tenantId = window._tenantActivo || session.user.user_metadata?.tenant_id || null
      window._tenantActivo = tenantId
      await mostrarApp(rol, email, tenantId)
    }
  } else {
    await mostrarLogin()
  }
})

document.addEventListener('visibilitychange', () => {})

async function mostrarSelectorTenant(tenants, rol, email) {
  document.title = 'dataDesk'
  setFaviconEmoji('📊')
  document.documentElement.style.setProperty('--color-primary', '#1A1A1A')

  const configs = await Promise.all(tenants.map(async t => {
    const { data } = await window._db.from('tenants')
      .select('tenant_id, nombre, color_primario, tagline')
      .eq('tenant_id', t).single()
    return data || { tenant_id: t, nombre: t, color_primario: '#1e3a5f', tagline: '' }
  }))

  document.getElementById('app').innerHTML = `
    <div class="login-wrapper">
      <div class="login-box">
        <div class="login-logo" style="font-family:'DM Sans',sans-serif"><span style="font-size:0.6em;vertical-align:middle;margin-right:6px">📊</span>dataDesk</div>
        <p class="login-tagline">Selecciona un negocio</p>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:8px">
          ${configs.map(cfg => `
            <button onclick="seleccionarTenant('${cfg.tenant_id}')"
              style="width:100%;padding:16px;background:${cfg.color_primario};color:#FFFFFF;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;font-family:var(--font-main);text-align:left">
              ${cfg.nombre}
              <small style="display:block;font-size:11px;font-weight:400;opacity:0.7;margin-top:2px">${cfg.tagline}</small>
            </button>`).join('')}
        </div>
        <button onclick="logout().then(()=>location.reload())"
          style="width:100%;margin-top:16px;padding:10px;background:#FFFFFF;border:1px solid #CCCCCC;border-radius:10px;color:#555555;font-size:13px;cursor:pointer;font-family:var(--font-main)">
          Cerrar sesión
        </button>
      </div>
    </div>
  `
}

function _limpiarCacheGlobal() {
  window._productos            = null
  window._productos_rec        = null
  window._recetas              = null
  window._recepciones          = null
  window._proveedoresCache     = null
  window._invConteo            = null
  window._invProdMap           = null
  window._nombreProv           = null
  window._sugeridoPorProveedor = null
  window._sugeridoItemsRef     = null
  window._cierresData          = null
  window._tenant_id_rec        = null
}

async function seleccionarTenant(tenantId) {
  window._tenantActivo = tenantId
  localStorage.setItem('datadesk-tenant-activo', tenantId)
  window._tenantConfig = null
  _limpiarCacheGlobal()
  // Escribir tenant_id en el JWT para que las políticas RLS de Supabase lo lean correctamente.
  // El usuario multitenant no tiene tenant_id en su metadata — solo tenants[].
  // Sin este update, auth.jwt()->'user_metadata'->>'tenant_id' es NULL y RLS devuelve vacío.
  await window._db.auth.updateUser({ data: { tenant_id: tenantId } })
  // Forzar refresh del JWT para que el nuevo tenant_id quede en el access token.
  // Sin esto, el JWT activo aún tiene las claims viejas y RLS bloquea las queries.
  await window._db.auth.refreshSession()
  const { data: { user } } = await window._db.auth.getUser()
  const rol   = user?.user_metadata?.rol || null
  const email = user?.email
  await mostrarApp(rol, email, tenantId)
}

async function mostrarLogin() {
  const cfg = await getTenantConfig()
  document.title = 'dataDesk'
  document.documentElement.style.setProperty('--color-primary', cfg.color_primario)

  document.getElementById('app').innerHTML = `
    <div class="login-wrapper">
      <div class="login-box">
        <div class="login-logo">${cfg.nombre}<span>.</span></div>
        <p class="login-tagline">${cfg.tagline}</p>
        <form id="login-form">
          <input type="email" id="email" placeholder="Correo electrónico" required />
          <input type="password" id="password" placeholder="Contraseña" required />
          <button type="submit">Entrar</button>
          <p id="error-msg"></p>
        </form>
      </div>
    </div>
  `
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = document.getElementById('email').value
    const password = document.getElementById('password').value
    try {
      await login(email, password)
    } catch (err) {
      document.getElementById('error-msg').textContent = 'Correo o contraseña incorrectos'
    }
  })
}

async function mostrarApp(rol, email, tenant_id = null) {
  const cfg = await getTenantConfig(tenant_id)
  applyTenantTheme(tenant_id)
  document.title = cfg.nombre

  window._rol   = rol || 'operador'
  window._email = email || null

  const esMultitenant = !!(await getTenants())

  document.getElementById('app').innerHTML = `
    <div class="layout">
      <header class="header">
        <div class="header-logo">${window._tenantEmoji ? window._tenantEmoji + ' ' : ''}${cfg.nombre}<small>${cfg.tagline}</small></div>
        <div class="header-user">
          <span class="header-email">${email}</span>
          <span class="header-rol">${rol}</span>
          ${esMultitenant ? `<button id="cambiar-tenant-btn">Cambiar negocio</button>` : ''}
          <button id="logout-btn">Cerrar sesión</button>
        </div>
      </header>
      <div class="body">
        <nav class="sidebar">
          <ul></ul>
        </nav>
        <main class="content" id="content">
          <p>Cargando...</p>
        </main>
      </div>
    </div>
  `

  document.getElementById('logout-btn').addEventListener('click', async () => {
    try { await logout() } catch {}
    window.location.reload()
  })

  document.getElementById('cambiar-tenant-btn')?.addEventListener('click', async () => {
    window._tenantActivo = null
    localStorage.removeItem('datadesk-tenant-activo')
    window._tenantConfig = null
    _limpiarCacheGlobal()
    const { data: { user } } = await window._db.auth.getUser()
    const tenants = user?.user_metadata?.tenants || []
    await mostrarSelectorTenant(tenants, user?.user_metadata?.rol, user?.email)
  })

  // Event delegation — cubre links dentro de dropdowns dinámicos
  document.querySelector('nav').addEventListener('click', async (e) => {
    const link = e.target.closest('[data-view]')
    if (!link) return
    e.preventDefault()
    // Cerrar todos los dropdowns
    document.querySelectorAll('.nav-grupo-items').forEach(el => el.classList.remove('abierto'))
    document.querySelectorAll('.nav-grupo-header').forEach(el => el.classList.remove('abierto'))
    document.querySelectorAll('.nav-grupo-chevron').forEach(el => el.textContent = '▸')
    document.querySelectorAll('[data-view]').forEach(l => l.classList.remove('active'))
    link.classList.add('active')
    const view = link.dataset.view
    localStorage.setItem('datadesk-view', view)
    if (view === 'inicio')           await mostrarBienvenida()
    if (view === 'productos')        await vistaProductos()
    if (view === 'recetas')          await vistaRecetas()
    if (view === 'precios')          await vistaPrecios()
    if (view === 'costeo')           await vistaCosteo()
    if (view === 'pedidos')          await vistaPedidos()
    if (view === 'ventas')           await vistaVentas()
    if (view === 'inventario')       await vistaInventarioAnalitico()
    if (view === 'inventarios')      await vistaInventariosConteo()
    if (view === 'sugerido')         await vistaSugeridoCompra()
    if (view === 'cierres')          await vistaCierres()
    if (view === 'consumo')          await vistaConsumo()
    if (view === 'recepciones')      await vistaRecepciones()
    if (view === 'incidencias')      await vistaIncidencias()
    if (view === 'tesoreria')        await vistaTesoreria()
    if (view === 'gastos')           await vistaGastos()
    if (view === 'mrp')              await vistaMRP()
  })

  // Cerrar dropdowns al hacer click fuera del nav
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-grupo')) {
      document.querySelectorAll('.nav-grupo-items').forEach(el => el.classList.remove('abierto'))
      document.querySelectorAll('.nav-grupo-header').forEach(el => el.classList.remove('abierto'))
      document.querySelectorAll('.nav-grupo-chevron').forEach(el => el.textContent = '▸')
    }
  })

  // Nav agrupado según rol
  const permitidasPorRol = {
    superadmin: ['inicio','productos','recetas','precios','costeo','pedidos','tesoreria','gastos','mrp','ventas','cierres','consumo','recepciones','incidencias','inventario','inventarios','sugerido'],
    owner:      ['inicio','productos','recetas','ventas','cierres','consumo','recepciones','incidencias','inventario','inventarios','sugerido'],
    gerente:    ['inicio','productos','recetas','ventas','cierres','consumo','recepciones','incidencias','inventario','inventarios','sugerido'],
    caja:       ['productos','recetas','ventas'],
    // legacy
    admin:      ['inicio','productos','recetas','precios','costeo','pedidos','tesoreria','gastos','mrp','ventas','cierres','consumo','recepciones','incidencias','inventario','inventarios','sugerido'],
    editor:     ['inicio','productos','recetas']
  }
  const visibles = permitidasPorRol[window._rol] || ['inicio','productos','recetas','precios','costeo','pedidos']

  const navGrupos = [
    { label: 'Menú',        vistas: ['productos','recetas'],                                 roles: ['superadmin','admin','owner','gerente','editor','caja','cocina'] },
    { label: 'Operación',   vistas: ['ventas','cierres','consumo','recepciones','incidencias'], roles: ['superadmin','admin','owner','gerente','editor'] },
    { label: 'Inventarios', vistas: ['inventario','inventarios','sugerido'], roles: ['superadmin','admin','owner','gerente','editor'] },
    { label: 'Desarrollo',  vistas: ['inicio','precios','costeo','pedidos','tesoreria','gastos','mrp'],                 roles: ['superadmin','admin'] }
  ]

  const vistaLabels = {
    inicio: 'Inicio', productos: '🧂 Insumos y Subrecetas', recetas: '📖 Recetas',
    precios: 'Precios', costeo: 'Costeo', pedidos: 'Pedidos', tesoreria: '🏦 Tesorería', gastos: '💸 Gastos', mrp: '📐 MRP',
    ventas: '🧾 Ventas', cierres: '🔒 Cierres', consumo: '🧮 Consumo', recepciones: '📦 Recepciones', incidencias: '⚠️ Incidencias',
    inventario: '🔍 Diagnóstico', inventarios: '📋 Conteos', sugerido: '🛒 Sugerido de Compra'
  }

  let navHtml = ''
  navGrupos.forEach(grupo => {
    const vistasPermitidas = grupo.vistas.filter(v =>
      grupo.roles.includes(window._rol) && visibles.includes(v)
    )
    if (!vistasPermitidas.length) return

    const grupoId = `nav-grupo-${grupo.label.toLowerCase().replace(/\s/g,'-')}`
    const abierto = false

    navHtml += `
      <li class="nav-grupo">
        <div class="nav-grupo-header${abierto ? ' abierto' : ''}" onclick="toggleNavGrupo('${grupoId}')">
          <span>${grupo.label}</span>
          <span class="nav-grupo-chevron" id="chev-${grupoId}">${abierto ? '▾' : '▸'}</span>
        </div>
        <ul class="nav-grupo-items${abierto ? ' abierto' : ''}" id="${grupoId}">
          ${vistasPermitidas.map(v => `
            <li><a href="#" data-view="${v}">${vistaLabels[v]}</a></li>
          `).join('')}
        </ul>
      </li>
    `
  })

  document.querySelector('nav ul').innerHTML = navHtml

  window.toggleNavGrupo = function(grupoId) {
    const body   = document.getElementById(grupoId)
    const chev   = document.getElementById('chev-' + grupoId)
    const header = body?.previousElementSibling
    if (!body) return
    const open = body.classList.contains('abierto')
    // Cerrar todos
    document.querySelectorAll('.nav-grupo-items').forEach(el => el.classList.remove('abierto'))
    document.querySelectorAll('.nav-grupo-header').forEach(el => el.classList.remove('abierto'))
    document.querySelectorAll('.nav-grupo-chevron').forEach(el => el.textContent = '▸')
    // Abrir el clickeado si estaba cerrado
    if (!open) {
      body.classList.add('abierto')
      if (header) header.classList.add('abierto')
      if (chev) chev.textContent = '▾'
      // Posicionar el dropdown bajo el header (position: fixed)
      const rect = header.getBoundingClientRect()
      body.style.top  = rect.bottom + 'px'
      body.style.left = rect.left + 'px'
    }
  }

  const vistaGuardada = localStorage.getItem('datadesk-view')
  const vistaInicial = visibles.includes(vistaGuardada)
    ? vistaGuardada
    : visibles.includes('recetas')
    ? 'recetas'
    : visibles[0]
  const linkActivo = document.querySelector(`[data-view="${vistaInicial}"]`)
  if (linkActivo) linkActivo.classList.add('active')

  if (vistaInicial === 'productos')        vistaProductos()
  else if (vistaInicial === 'recetas')     vistaRecetas()
  else if (vistaInicial === 'precios')     vistaPrecios()
  else if (vistaInicial === 'costeo')      vistaCosteo()
  else if (vistaInicial === 'pedidos')     vistaPedidos()
  else if (vistaInicial === 'ventas')      vistaVentas()
  else if (vistaInicial === 'inventario')  vistaInventarioAnalitico()
  else if (vistaInicial === 'inventarios') vistaInventariosConteo()
  else if (vistaInicial === 'sugerido')    vistaSugeridoCompra()
  else if (vistaInicial === 'cierres')     vistaCierres()
  else if (vistaInicial === 'consumo')     vistaConsumo()
  else if (vistaInicial === 'recepciones')    vistaRecepciones()
  else if (vistaInicial === 'incidencias')    vistaIncidencias()
  else if (vistaInicial === 'tesoreria')      vistaTesoreria()
  else if (vistaInicial === 'gastos')         vistaGastos()
  else if (vistaInicial === 'mrp')            vistaMRP()
  else                                     mostrarBienvenida()
}

async function mostrarBienvenida() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando resumen...</p>`

  try {
    const tenant_id = await getTenantId()

    const [{ data: recetas, error: errR }, { data: productos, error: errP }] = await Promise.all([
      window._db.from('catalogo_recetas').select('status').eq('tenant_id', tenant_id),
      window._db.from('productos').select('status').eq('tenant_id', tenant_id)
    ])

    if (errR) throw errR
    if (errP) throw errP

    const contarStatus = (arr, s) => arr.filter(x => (x.status || 'pendiente') === s).length

    const r = {
      total:      recetas.length,
      aprobadas:  contarStatus(recetas, 'aprobado'),
      pendientes: contarStatus(recetas, 'pendiente'),
      archivadas: contarStatus(recetas, 'archivado')
    }
    const p = {
      total:      productos.length,
      aprobados:  contarStatus(productos, 'aprobado'),
      pendientes: contarStatus(productos, 'pendiente'),
      archivados: contarStatus(productos, 'archivado')
    }

    content.innerHTML = `
      <div class="vista-header"><h2>Resumen</h2></div>

      <h3 class="seccion-titulo">Recetas</h3>
      <div class="dashboard-grid">
        <div class="dashboard-card">
          <div class="card-valor">${formatInt(r.total)}</div>
          <div class="card-label">Total</div>
        </div>
        <div class="dashboard-card aprobado">
          <div class="card-valor">${formatInt(r.aprobadas)}</div>
          <div class="card-label">Aprobadas</div>
        </div>
        <div class="dashboard-card pendiente">
          <div class="card-valor">${formatInt(r.pendientes)}</div>
          <div class="card-label">Pendientes</div>
        </div>
        <div class="dashboard-card archivado">
          <div class="card-valor">${formatInt(r.archivadas)}</div>
          <div class="card-label">Archivadas</div>
        </div>
      </div>

      <h3 class="seccion-titulo">Productos</h3>
      <div class="dashboard-grid">
        <div class="dashboard-card">
          <div class="card-valor">${formatInt(p.total)}</div>
          <div class="card-label">Total</div>
        </div>
        <div class="dashboard-card aprobado">
          <div class="card-valor">${formatInt(p.aprobados)}</div>
          <div class="card-label">Aprobados</div>
        </div>
        <div class="dashboard-card pendiente">
          <div class="card-valor">${formatInt(p.pendientes)}</div>
          <div class="card-label">Pendientes</div>
        </div>
        <div class="dashboard-card archivado">
          <div class="card-valor">${formatInt(p.archivados)}</div>
          <div class="card-label">Archivados</div>
        </div>
      </div>
    `
  } catch (err) {
    content.innerHTML = `<p>Error al cargar resumen: ${err.message}</p>`
  }
}