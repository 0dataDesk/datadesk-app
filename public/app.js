import { login, logout, getSession } from '../src/auth.js'
import { getRol } from '../src/roles.js'

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
  document.getElement
