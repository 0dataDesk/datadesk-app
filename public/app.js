import { login, logout, getSession } from '../src/auth.js'
import { getRol } from '../src/roles.js'
import { vistaProductos } from './views/productos.js'
import { vistaRecetas } from './views/recetas.js'

async function init() {
  const session = await getSession()
  if (!session) {
    mostrarLogin()
  } else {
    const rol = await getRol()
    mostrarApp(rol, session.user.email)
  }
}

function mostrarLogin() {
  document.getElementById('app').innerHTML = `
    <div class="login-wrapper">
      <div class="login-box">
        <div class="login-logo">data<span>Desk</span></div>
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
      init()
    } catch (err) {
      document.getElementById('error-msg').textContent = 'Correo o contraseña incorrectos'
    }
  })
}

function mostrarApp(rol, email) {
  document.getElementById('app').innerHTML = `
    <div class="layout">
      <header class="header">
        <div class="header-logo">data<span>Desk</span></div>
        <div class="header-user">
          <span class="header-email">${email}</span>
          <span class="header-rol">${rol}</span>
          <button id="logout-btn">Cerrar sesión</button>
        </div>
      </header>
      <div class="body">
        <nav class="sidebar">
          <ul>
            <li><a href="#" data-view="productos">Productos</a></li>
            <li><a href="#" data-view="recetas">Recetas</a></li>
          </ul>
        </nav>
        <main class="content" id="content">
          <p>Selecciona una sección del menú.</p>
        </main>
      </div>
    </div>
  `

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await logout()
    init()
  })

  document.querySelectorAll('[data-view]').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault()
      const view = e.target.dataset.view
      if (view === 'productos') await vistaProductos()
      if (view === 'recetas') await vistaRecetas()
    })
  })
}

init()
