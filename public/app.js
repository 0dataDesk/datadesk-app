let _appMontado = false

window._db.auth.onAuthStateChange(async (event, session) => {
  if (_appMontado && event !== 'SIGNED_OUT') return

  if (event === 'SIGNED_OUT') {
    _appMontado = false
    window._tenantConfig = null
    localStorage.removeItem('datadesk-view')
    await mostrarLogin()
    return
  }

  if (session) {
    _appMontado = true
    await mostrarApp(
      session.user.user_metadata?.rol || null,
      session.user.email,
      session.user.user_metadata?.tenant_id || null
    )
  } else {
    await mostrarLogin()
  }
})

document.addEventListener('visibilitychange', () => {})

async function mostrarLogin() {
  const cfg = await getTenantConfig()
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
  document.documentElement.style.setProperty('--color-primary', cfg.color_primario)
  document.title = cfg.nombre

  window._rol   = rol || 'operador'
  window._email = email || null

  document.getElementById('app').innerHTML = `
    <div class="layout">
      <header class="header">
        <div class="header-logo">${cfg.nombre}<span>.</span><small>${cfg.tagline}</small></div>
        <div class="header-user">
          <span class="header-email">${email}</span>
          <span class="header-rol">${rol}</span>
          <button id="logout-btn">Cerrar sesión</button>
        </div>
      </header>
      <div class="body">
        <nav class="sidebar">
          <ul>
            <li><a href="#" data-view="inicio">Inicio</a></li>
            <li><a href="#" data-view="productos">Insumos</a></li>
            <li><a href="#" data-view="recetas">Recetas</a></li>
            <li><a href="#" data-view="precios">Precios</a></li>
            <li><a href="#" data-view="costeo">Costeo</a></li>
            <li><a href="#" data-view="pedidos">Pedidos</a></li>
          </ul>
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

  document.querySelectorAll('[data-view]').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault()
      document.querySelectorAll('[data-view]').forEach(l => l.classList.remove('active'))
      e.target.classList.add('active')
      const view = e.target.dataset.view
      localStorage.setItem('datadesk-view', view)
      if (view === 'inicio')    await mostrarBienvenida()
      if (view === 'productos') await vistaProductos()
      if (view === 'recetas')   await vistaRecetas()
      if (view === 'precios')   await vistaPrecios()
      if (view === 'costeo')    await vistaCosteo()
      if (view === 'pedidos')   await vistaPedidos()
    })
  })

  // Ocultar nav items según rol
  const permitidasPorRol = {
    admin:  ['inicio','productos','recetas','precios','costeo','pedidos'],
    editor: ['inicio','productos','recetas'],
    cocina: ['productos','recetas']
  }
  const visibles = permitidasPorRol[window._rol] || ['inicio','productos','recetas','precios','costeo','pedidos']
  document.querySelectorAll('nav [data-view]').forEach(item => {
    const view = item.getAttribute('data-view')
    item.closest('li').style.display = visibles.includes(view) ? '' : 'none'
  })

  const vistaGuardada = localStorage.getItem('datadesk-view')
  const vistaInicial  = visibles.includes(vistaGuardada) ? vistaGuardada : (window._rol === 'cocina' ? 'productos' : 'inicio')
  const linkActivo = document.querySelector(`[data-view="${vistaInicial}"]`)
  if (linkActivo) linkActivo.classList.add('active')

  if (vistaInicial === 'productos')    vistaProductos()
  else if (vistaInicial === 'recetas') vistaRecetas()
  else if (vistaInicial === 'precios') vistaPrecios()
  else if (vistaInicial === 'costeo')  vistaCosteo()
  else if (vistaInicial === 'pedidos') vistaPedidos()
  else                                 mostrarBienvenida()
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
          <div class="card-valor">${r.total}</div>
          <div class="card-label">Total</div>
        </div>
        <div class="dashboard-card aprobado">
          <div class="card-valor">${r.aprobadas}</div>
          <div class="card-label">Aprobadas</div>
        </div>
        <div class="dashboard-card pendiente">
          <div class="card-valor">${r.pendientes}</div>
          <div class="card-label">Pendientes</div>
        </div>
        <div class="dashboard-card archivado">
          <div class="card-valor">${r.archivadas}</div>
          <div class="card-label">Archivadas</div>
        </div>
      </div>

      <h3 class="seccion-titulo">Productos</h3>
      <div class="dashboard-grid">
        <div class="dashboard-card">
          <div class="card-valor">${p.total}</div>
          <div class="card-label">Total</div>
        </div>
        <div class="dashboard-card aprobado">
          <div class="card-valor">${p.aprobados}</div>
          <div class="card-label">Aprobados</div>
        </div>
        <div class="dashboard-card pendiente">
          <div class="card-valor">${p.pendientes}</div>
          <div class="card-label">Pendientes</div>
        </div>
        <div class="dashboard-card archivado">
          <div class="card-valor">${p.archivados}</div>
          <div class="card-label">Archivados</div>
        </div>
      </div>
    `
  } catch (err) {
    content.innerHTML = `<p>Error al cargar resumen: ${err.message}</p>`
  }
}
