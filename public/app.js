import { login, logout, getSession } from '../src/auth.js'
import { getRol } from '../src/roles.js'

async function init() {
  const session = await getSession()
  if (!session) {
    mostrarLogin()
  } else {
    const rol = await getRol()
    mostrarApp(rol)
  }
}

function mostrarLogin() {
  document.getElementById('app').innerHTML = `
    <div id="login-container">
      <h1>dataDesk</h1>
      <form id="login-form">
        <input type="email" id="email" placeholder="Correo" required />
        <input type="password" id="password" placeholder="Contraseña" required />
        <button type="submit">Entrar</button>
        <p id="error-msg"></p>
      </form>
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

function mostrarApp(rol) {
  document.getElementById('app').innerHTML = `
    <div id="main-container">
      <header>
        <h1>dataDesk</h1>
        <span>Rol: ${rol}</span>
        <button id="logout-btn">Cerrar sesión</button>
      </header>
      <main>
        <p>Bienvenido al aplicativo.</p>
      </main>
    </div>
  `
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await logout()
    init()
  })
}

init()
