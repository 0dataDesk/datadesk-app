// ── Vista: Personal (Empleados, Horarios, Registros de Asistencia) ──────────────
// Mismo patrón de filtro jerárquico Todo/Mes/Semana que cierres.js (helpers
// copiados y renombrados con prefijo PersAsis para no colisionar con los
// globals de cierres.js/consumo.js/incidencias.js, ya que todos comparten
// el mismo scope global).

const PERSONAL_TURNOS = {
  apertura:     { label: 'Apertura',      inicio: '11:00:00', fin: '19:00:00', color: '#CFE8F3' },
  intermedio_1: { label: 'Intermedio 1',  inicio: '12:00:00', fin: '20:00:00', color: '#FBEEC1' },
  intermedio_2: { label: 'Intermedio 2',  inicio: '13:00:00', fin: '21:00:00', color: '#F5D0A9' },
  cierre:       { label: 'Cierre',        inicio: '14:00:00', fin: '22:00:00', color: '#AEC6E8' },
  gerente:      { label: 'Gerente',       inicio: '12:00:00', fin: '22:00:00', color: '#DADADA' },
  descanso:     { label: 'Descanso',      inicio: null,       fin: null,       color: '#CFE8CF' },
  apoyo:        { label: 'Apoyo',         inicio: null,       fin: null,       color: '#F0E0D0' }
}
const PERSONAL_HORARIOS_PISO = '2026-07-20' // lunes de la primera semana real — tope fijo, no depende de "hoy"
const PERSONAL_DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

// Secciones de la tabla de Horarios, en este orden fijo — un puesto que no
// matchee ninguna cae en 'Otros' (ej. Jorge RH / Sistemas, cuenta de
// pruebas, no un turno real).
const PERSONAL_SECCIONES = [
  { label: 'Cocina',         puestos: ['Chef', 'Cocinero A', 'Auxiliar de Cocina'] },
  { label: 'Servicio',       puestos: ['Cajero Multifuncional'] },
  { label: 'Administración', puestos: ['Gerente', 'Subgerente'] }
]
const PERSONAL_SECCION_ORDEN = ['Cocina', 'Servicio', 'Administración', 'Otros']

function _personalSeccionDe(puesto) {
  const sec = PERSONAL_SECCIONES.find(s => s.puestos.includes(puesto))
  return sec ? sec.label : 'Otros'
}

// Un 'Gerente' solo puede elegir gerente/descanso; cualquier otro puesto
// puede elegir cualquier turno operativo menos 'gerente'.
function _personalTurnosPermitidos(puesto) {
  return puesto === 'Gerente'
    ? ['gerente', 'descanso']
    : ['apertura', 'intermedio_1', 'intermedio_2', 'cierre', 'descanso', 'apoyo']
}

const PERSASIS_MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const PERSASIS_MESES_CORTOS  = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

// Convierte un Date a 'YYYY-MM-DD' en la zona horaria LOCAL del navegador, a
// diferencia de .toISOString() que pasa por UTC — usar toISOString() para
// esto descuadra el día cuando se ejecuta de tarde/noche en México (UTC-6):
// la hora local, al pasar a UTC, salta al día siguiente.
function _fechaLocalISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'),
        day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function _getLunesPersAsis(fechaStr) {
  const d = new Date(fechaStr + 'T12:00:00')
  const day = d.getDay() || 7
  d.setDate(d.getDate() - (day - 1))
  return _fechaLocalISO(d)
}

function _semLabelPersAsis(lunesStr) {
  const lun = new Date(lunesStr + 'T12:00:00')
  const dom = new Date(lun); dom.setDate(dom.getDate() + 6)
  const sufijo = dom.getMonth() !== lun.getMonth()
    ? `${PERSASIS_MESES_CORTOS[dom.getMonth()]}`
    : PERSASIS_MESES_CORTOS[lun.getMonth()]
  return `Semana del ${lun.getDate()} al ${dom.getDate()} ${sufijo}`
}

function _agruparPersAsisPorMes(arr) {
  const porMes = {}
  arr.forEach(r => {
    const mes = r.fecha_hora.slice(0, 7)
    if (!porMes[mes]) porMes[mes] = []
    porMes[mes].push(r)
  })
  const meses = Object.keys(porMes).sort().reverse()
  return { meses, porMes }
}

function _agruparPersAsisPorSemana(arr) {
  const porSemana = {}
  arr.forEach(r => {
    const lunes = _getLunesPersAsis(r.fecha_hora.slice(0, 10))
    if (!porSemana[lunes]) porSemana[lunes] = []
    porSemana[lunes].push(r)
  })
  const semanas = Object.keys(porSemana).sort().reverse()
  return { semanas, porSemana }
}

function _persAsisMesLabelDe(mes, soloUnAño) {
  const [year, month] = mes.split('-')
  return soloUnAño ? PERSASIS_MESES_NOMBRES[Number(month) - 1] : `${PERSASIS_MESES_NOMBRES[Number(month) - 1]} ${year}`
}

// ── Entrada de la vista ──────────────────────────────────────────────────────
async function vistaPersonal() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando personal...</p>`

  try {
    await window._db.auth.refreshSession()
    const tenant_id = await getTenantId()
    window._personalTenant = tenant_id
    window._personalTab = window._personalTab || 'empleados'

    content.innerHTML = `
      <div class="vista-header"><h2>👥 Personal</h2></div>
      <div class="cierres-segmented" id="personal-tabs" style="margin-bottom:20px"></div>
      <div id="personal-tab-content"></div>
    `

    renderPersonalTabs()
    await renderPersonalTabContent()
  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function renderPersonalTabs() {
  const cont = document.getElementById('personal-tabs')
  if (!cont) return
  const tabs = [
    { id: 'empleados', label: 'Empleados' },
    { id: 'horarios',  label: 'Horarios' },
    { id: 'registros', label: 'Registros de asistencia' },
    { id: 'checador',  label: 'Checador' }
  ]
  cont.innerHTML = tabs.map(t => `
    <button class="btn-periodo${window._personalTab === t.id ? ' active' : ''}" onclick="setPersonalTab('${t.id}')">${t.label}</button>`).join('')
}

async function setPersonalTab(tab) {
  window._personalTab = tab
  renderPersonalTabs()
  document.getElementById('personal-tab-content').innerHTML = `<p style="color:var(--color-text-muted)">Cargando...</p>`
  await renderPersonalTabContent()
}

async function renderPersonalTabContent() {
  _personalCerrarPopoverTurno()
  _personalQuitarBotonGuardarFlotante()
  if (window._personalTab === 'empleados') await renderPersonalEmpleados()
  if (window._personalTab === 'horarios')  await renderPersonalHorarios()
  if (window._personalTab === 'registros') await renderPersonalRegistros()
  if (window._personalTab === 'checador') {
    await mostrarChecadorEmpleado(window._personalTenant, 'personal-tab-content')
    _renderBotonPersonalPush()
  }
}

// ── Notificaciones push (Android) para gerentes: se agrega debajo del checador ──
function _renderBotonPersonalPush() {
  const cont = document.getElementById('personal-tab-content')
  if (!cont) return
  const activo = typeof Notification !== 'undefined' && Notification.permission === 'granted'

  const div = document.createElement('div')
  div.style.cssText = 'max-width:420px;margin:20px auto 0;text-align:center'
  div.innerHTML = activo
    ? `<span style="font-size:13px;font-weight:600;color:#3A8C3E">✓ Notificaciones activas</span>`
    : `<button class="btn-accion" style="border:1px solid var(--color-border)" onclick="_personalActivarPush()">Activar notificaciones en este celular</button>`
  cont.appendChild(div)
}

async function _personalActivarPush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Este navegador no soporta notificaciones push.')
      return
    }

    const reg = await navigator.serviceWorker.register('/sw.js')
    const permiso = await Notification.requestPermission()
    if (permiso !== 'granted') {
      alert('No se concedió el permiso de notificaciones.')
      return
    }

    const resp = await fetch('/api/push/vapid-public-key')
    const { publicKey } = await resp.json()

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: _personalVapidKeyABuffer(publicKey)
    })
    const keys = sub.toJSON().keys

    const { data: { session } } = await window._db.auth.getSession()
    await fetch('/api/push/suscribir', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        tenant: window._personalTenant,
        endpoint: sub.endpoint,
        p256dh: keys.p256dh,
        auth_key: keys.auth
      })
    })

    await renderPersonalTabContent()
  } catch (err) {
    alert('No se pudo activar las notificaciones. Intenta de nuevo.')
  }
}

function _personalVapidKeyABuffer(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

// ══════════════════════════════════════════════════════════════════════════
// ── TAB: EMPLEADOS ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

async function renderPersonalEmpleados() {
  const cont = document.getElementById('personal-tab-content')
  const tenant_id = window._personalTenant

  const { data: empleados, error } = await window._db
    .from('empleados')
    .select('id, nombre, puesto, activo, auth_user_id, email')
    .eq('tenant_id', tenant_id)
    .order('activo', { ascending: false })
    .order('nombre')

  if (error) {
    cont.innerHTML = `<p style="color:var(--color-highlight)">Error: ${error.message}</p>`
    return
  }

  window._personalEmpleados = empleados || []

  cont.innerHTML = `
    <div class="vista-header" style="margin-bottom:16px">
      <div></div>
      <button id="btn-nuevo-empleado" class="btn-accion btn-aprobar" onclick="mostrarFormEmpleado()">+ Nuevo empleado</button>
    </div>
    <div id="personal-form-empleado-wrap"></div>
    <div id="personal-empleados-tabla-wrap">
      <div class="tabla-wrapper card-surface">
        <table class="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Puesto</th>
              <th>Estado</th>
              <th>Estatus</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${!empleados || !empleados.length
              ? `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted)">Sin empleados registrados.</td></tr>`
              : empleados.map(e => `
                <tr>
                  <td style="font-weight:600">${e.nombre}</td>
                  <td>${e.puesto}</td>
                  <td>
                    <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;${e.activo ? 'background:rgba(76,153,80,0.12);color:#3A8C3E' : 'background:rgba(184,92,42,0.1);color:var(--color-highlight)'}">
                      ${e.activo ? 'Activo' : 'Baja'}
                    </span>
                  </td>
                  <td style="font-size:12px;white-space:nowrap;${e.auth_user_id ? 'color:#3A8C3E;font-weight:600' : 'color:var(--color-text-muted)'}">
                    ${e.auth_user_id ? '✓ Cuenta activa' : '— Sin cuenta'}
                  </td>
                  <td style="text-align:right">
                    <button class="btn-accion" style="border:1px solid var(--color-border);font-size:11px;padding:4px 10px" onclick="mostrarFormEmpleado('${e.id}')">Editar</button>
                  </td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `
}

function cerrarFormEmpleado() {
  const wrap = document.getElementById('personal-form-empleado-wrap')
  if (wrap) wrap.innerHTML = ''
  const tablaWrap = document.getElementById('personal-empleados-tabla-wrap')
  if (tablaWrap) tablaWrap.style.display = ''
  const btnNuevo = document.getElementById('btn-nuevo-empleado')
  if (btnNuevo) btnNuevo.style.display = ''
}

function mostrarFormEmpleado(id = null) {
  const wrap = document.getElementById('personal-form-empleado-wrap')
  const tablaWrap = document.getElementById('personal-empleados-tabla-wrap')
  const btnNuevo = document.getElementById('btn-nuevo-empleado')
  if (!wrap) return
  const empleado = id ? (window._personalEmpleados || []).find(e => e.id === id) : null
  if (tablaWrap) tablaWrap.style.display = 'none'
  if (btnNuevo) btnNuevo.style.display = 'none'

  wrap.innerHTML = `
    <div class="receta-detalle-card" style="margin-bottom:20px">
      <h3 style="margin-bottom:16px">${empleado ? 'Editar empleado' : 'Nuevo empleado'}</h3>
      <div class="filtros-cascada">
        <div class="filtro-cascada-item">
          <label class="filtro-label">Nombre</label>
          <input type="text" id="pe-nombre" class="filtro-select" value="${empleado ? empleado.nombre.replace(/"/g, '&quot;') : ''}">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Puesto</label>
          <input type="text" id="pe-puesto" class="filtro-select" value="${empleado ? empleado.puesto.replace(/"/g, '&quot;') : ''}">
        </div>
      </div>
      ${empleado ? `
      <div style="margin-top:24px;padding-top:20px;border-top:1px solid var(--color-border)">
        <div id="personal-cuenta-inline-wrap">${_htmlSeccionCuentaEmpleado(empleado)}</div>
      </div>
      <div style="margin-top:24px;padding-top:20px;border-top:1px solid var(--color-border)">
        ${_htmlSeccionEstadoEmpleado(empleado)}
      </div>` : ''}
      <div style="display:flex;gap:10px;margin-top:24px;padding-top:20px;border-top:1px solid var(--color-border)">
        <button class="btn-accion btn-aprobar" onclick="guardarEmpleado(${empleado ? `'${empleado.id}'` : 'null'})">Guardar</button>
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="cerrarFormEmpleado()">Cancelar</button>
      </div>
    </div>
  `
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function _htmlSeccionCuentaEmpleado(empleado) {
  const titulo = `<div style="font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;margin-bottom:8px">Cuenta de checador</div>`
  if (empleado.auth_user_id) {
    return `
      <div>
        ${titulo}
        <div style="font-size:13px;color:var(--color-text);margin-bottom:10px">✓ ${empleado.email || 'Cuenta activa'}</div>
        <button class="btn-accion" style="border:1px solid var(--color-border);font-size:12px;padding:6px 12px" onclick="mostrarRestablecerPassword('${empleado.id}', '${(empleado.email || empleado.nombre).replace(/'/g, "\\'")}')">Restablecer contraseña</button>
      </div>`
  }
  return `
    <div>
      ${titulo}
      <button class="btn-accion" style="border:1px solid var(--color-border);font-size:12px;padding:6px 12px" onclick="mostrarCrearCuentaEmpleado('${empleado.id}', '${empleado.nombre.replace(/'/g, "\\'")}')">Crear cuenta de checador</button>
    </div>`
}

function _htmlSeccionEstadoEmpleado(empleado) {
  return `
    <div>
      <div style="font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;margin-bottom:8px">Estado del empleado</div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span style="font-size:13px;font-weight:600;${empleado.activo ? 'color:#3A8C3E' : 'color:var(--color-highlight)'}">Estado: ● ${empleado.activo ? 'Activo' : 'Inactivo'}</span>
        ${empleado.activo
          ? `<button class="btn-accion btn-archivar" style="font-size:11px;padding:4px 10px" onclick="darDeBajaEmpleado('${empleado.id}')">Dar de baja</button>`
          : `<button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 10px" onclick="reactivarEmpleado('${empleado.id}')">Reactivar empleado</button>`}
      </div>
    </div>`
}

async function guardarEmpleado(id) {
  const tenant_id = window._personalTenant
  const nombre = document.getElementById('pe-nombre')?.value?.trim()
  const puesto = document.getElementById('pe-puesto')?.value?.trim()

  if (!nombre || !puesto) { alert('Nombre y puesto son obligatorios'); return }

  const { error } = id
    ? await window._db.from('empleados').update({ nombre, puesto }).eq('id', id).eq('tenant_id', tenant_id)
    : await window._db.from('empleados').insert({ tenant_id, nombre, puesto, activo: true })

  if (error) { alert(`Error: ${error.message}`); return }

  document.getElementById('personal-form-empleado-wrap').innerHTML = ''
  await renderPersonalEmpleados()
}

async function darDeBajaEmpleado(id) {
  if (!confirm('¿Dar de baja a este empleado? No se borrará su historial.')) return
  const { error } = await window._db.from('empleados').update({ activo: false }).eq('id', id).eq('tenant_id', window._personalTenant)
  if (error) { alert(`Error: ${error.message}`); return }
  await renderPersonalEmpleados()
}

async function reactivarEmpleado(id) {
  const { error } = await window._db.from('empleados').update({ activo: true }).eq('id', id).eq('tenant_id', window._personalTenant)
  if (error) { alert(`Error: ${error.message}`); return }
  await renderPersonalEmpleados()
}

function mostrarCrearCuentaEmpleado(id, nombre) {
  const wrap = document.getElementById('personal-cuenta-inline-wrap')
  if (!wrap) return

  wrap.innerHTML = `
    <div>
      <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:12px">Correo y contraseña reales para que ${nombre} entre desde su celular.</p>
      <div class="filtros-cascada">
        <div class="filtro-cascada-item">
          <label class="filtro-label">Correo</label>
          <input type="email" id="pca-email" class="filtro-select" placeholder="nombre@gmail.com">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Contraseña</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="pca-password" class="filtro-select" placeholder="Contraseña" style="flex:1">
            <button class="btn-accion" style="border:1px solid var(--color-border);font-size:12px;white-space:nowrap" onclick="_personalGenerarPassword()">Generar</button>
          </div>
        </div>
      </div>
      <div id="personal-cuenta-error" style="color:var(--color-highlight);font-size:13px;margin-top:10px"></div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn-accion btn-aprobar" onclick="crearCuentaEmpleado('${id}')">Crear cuenta</button>
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="mostrarFormEmpleado('${id}')">Cancelar</button>
      </div>
    </div>
  `
}

function _personalGenerarPassword(inputId = 'pca-password') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let pass = ''
  for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)]
  const input = document.getElementById(inputId)
  if (input) input.value = pass
}

function mostrarRestablecerPassword(id, label) {
  const wrap = document.getElementById('personal-cuenta-inline-wrap')
  if (!wrap) return

  wrap.innerHTML = `
    <div>
      <div style="font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;margin-bottom:8px">Cuenta de checador</div>
      <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:12px">Nueva contraseña para ${label}.</p>
      <div class="filtros-cascada">
        <div class="filtro-cascada-item">
          <label class="filtro-label">Contraseña nueva</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="prp-password" class="filtro-select" placeholder="Contraseña" style="flex:1">
            <button class="btn-accion" style="border:1px solid var(--color-border);font-size:12px;white-space:nowrap" onclick="_personalGenerarPassword('prp-password')">Generar</button>
          </div>
        </div>
      </div>
      <div id="personal-reset-error" style="color:var(--color-highlight);font-size:13px;margin-top:10px"></div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn-accion btn-aprobar" onclick="restablecerPasswordEmpleado('${id}')">Restablecer</button>
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="mostrarFormEmpleado('${id}')">Cancelar</button>
      </div>
    </div>
  `
}

async function restablecerPasswordEmpleado(id) {
  const password = document.getElementById('prp-password')?.value
  const errEl = document.getElementById('personal-reset-error')
  if (errEl) errEl.textContent = ''

  if (!password) {
    if (errEl) errEl.textContent = 'Captura una contraseña.'
    return
  }

  const { data: { session } } = await window._db.auth.getSession()
  if (!session) {
    if (errEl) errEl.textContent = 'Sesión inválida, recarga la página.'
    return
  }

  try {
    const resp = await fetch('/api/admin/restablecer-password-empleado', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ tenant: window._personalTenant, id_empleado: id, password })
    })
    const data = await resp.json()

    if (!resp.ok || data.error) {
      const mensajes = {
        no_autorizado: 'No tienes permiso para restablecer contraseñas.',
        sin_cuenta: 'Este empleado no tiene cuenta de checador.',
        no_se_pudo_restablecer: `No se pudo restablecer: ${data.detalle || ''}`
      }
      if (errEl) errEl.textContent = mensajes[data.error] || 'No se pudo restablecer la contraseña.'
      return
    }

    alert(`Contraseña restablecida.\n\nContraseña nueva: ${password}\n\nCopia este dato ahora — no se va a volver a mostrar.`)
    await renderPersonalEmpleados()
  } catch (err) {
    if (errEl) errEl.textContent = 'No se pudo restablecer la contraseña. Intenta de nuevo.'
  }
}

async function crearCuentaEmpleado(id) {
  const email = document.getElementById('pca-email')?.value?.trim()
  const password = document.getElementById('pca-password')?.value
  const errEl = document.getElementById('personal-cuenta-error')
  if (errEl) errEl.textContent = ''

  if (!email || !password) {
    if (errEl) errEl.textContent = 'Correo y contraseña son obligatorios.'
    return
  }

  const { data: { session } } = await window._db.auth.getSession()
  if (!session) {
    if (errEl) errEl.textContent = 'Sesión inválida, recarga la página.'
    return
  }

  try {
    const resp = await fetch('/api/admin/crear-empleado-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ tenant: window._personalTenant, id_empleado: id, email, password })
    })
    const data = await resp.json()

    if (!resp.ok || data.error) {
      const mensajes = {
        ya_tiene_cuenta: 'Este empleado ya tiene una cuenta.',
        no_autorizado: 'No tienes permiso para crear cuentas.',
        empleado_no_encontrado: 'No se encontró el empleado.',
        no_se_pudo_crear_cuenta: `No se pudo crear la cuenta: ${data.detalle || ''}`
      }
      if (errEl) errEl.textContent = mensajes[data.error] || 'No se pudo crear la cuenta.'
      return
    }

    alert(`Cuenta creada.\n\nCorreo: ${data.email}\nContraseña: ${password}\n\nCopia estos datos ahora — no se van a volver a mostrar.`)
    await renderPersonalEmpleados()
  } catch (err) {
    if (errEl) errEl.textContent = 'No se pudo crear la cuenta. Intenta de nuevo.'
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ── TAB: HORARIOS ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

// Default al abrir la vista: la semana actual (lunes a domingo que contiene
// hoy). La navegación manual (‹ Semana anterior / Siguiente semana ›) parte
// de acá pero puede moverse a cualquier otra semana.
function _personalSemanaActual() {
  const hoy = new Date()
  const day = hoy.getDay() || 7 // Lunes=1 ... Domingo=7
  const lunesActual = new Date(hoy)
  lunesActual.setDate(hoy.getDate() - (day - 1))
  return _personalFechasDesdeLunes(_fechaLocalISO(lunesActual))
}

// Construye las 7 fechas (lunes a domingo) a partir de un lunes dado.
function _personalFechasDesdeLunes(lunesStr) {
  const lunes = new Date(lunesStr + 'T12:00:00')
  const fechas = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes)
    d.setDate(lunes.getDate() + i)
    fechas.push(_fechaLocalISO(d))
  }
  return fechas
}

// Mueve la semana mostrada 7 días atrás/adelante desde la que está en pantalla.
// No permite ir antes de PERSONAL_HORARIOS_PISO (tope fijo, no depende de "hoy").
async function _personalCambiarSemanaHorarios(deltaDias) {
  const actual = window._personalHorariosFechas || _personalSemanaActual()
  const lunesActual = new Date(actual[0] + 'T12:00:00')
  lunesActual.setDate(lunesActual.getDate() + deltaDias)
  const lunesResultante = _fechaLocalISO(lunesActual)
  if (deltaDias < 0 && lunesResultante < PERSONAL_HORARIOS_PISO) return
  await renderPersonalHorarios(_personalFechasDesdeLunes(lunesResultante))
}

async function renderPersonalHorarios(fechasOverride) {
  const cont = document.getElementById('personal-tab-content')
  const tenant_id = window._personalTenant
  const fechas = fechasOverride || _personalSemanaActual()
  window._personalHorariosFechas = fechas

  const [{ data: empleados, error: errE }, { data: horarios, error: errH }] = await Promise.all([
    window._db.from('empleados').select('id, nombre, puesto').eq('tenant_id', tenant_id).eq('activo', true).order('nombre'),
    window._db.from('horarios').select('id_empleado, fecha, tipo_turno').eq('tenant_id', tenant_id).in('fecha', fechas)
  ])

  if (errE || errH) {
    cont.innerHTML = `<p style="color:var(--color-highlight)">Error: ${(errE || errH).message}</p>`
    return
  }

  window._personalEmpleadosActivos = empleados || []

  const valores = {} // valores[id_empleado][fecha] = tipo_turno
  ;(horarios || []).forEach(h => {
    if (!valores[h.id_empleado]) valores[h.id_empleado] = {}
    valores[h.id_empleado][h.fecha] = h.tipo_turno
  })
  window._personalHorariosValores = valores
  window._personalHorariosValoresOriginal = JSON.stringify(valores)

  const lunes = fechas[0], domingo = fechas[6]
  const lunLabel = new Date(lunes + 'T12:00:00')
  const domLabel = new Date(domingo + 'T12:00:00')
  const esSemanaActual = lunes === PERSONAL_HORARIOS_PISO

  // Agrupa a los empleados activos por sección, en el orden fijo de
  // PERSONAL_SECCION_ORDEN — una sección sin empleados no se muestra.
  const porSeccion = {}
  ;(empleados || []).forEach(e => {
    const sec = _personalSeccionDe(e.puesto)
    if (!porSeccion[sec]) porSeccion[sec] = []
    porSeccion[sec].push(e)
  })

  function celdaTurno(e, f) {
    const valor = valores[e.id]?.[f]
    const t = PERSONAL_TURNOS[valor]
    return `
      <td style="padding:0">
        <div class="turno-celda" data-empleado="${e.id}" data-fecha="${f}"
          style="width:100%;min-height:44px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;text-align:center;padding:12px 6px;cursor:pointer;font-size:12px;font-weight:600;color:var(--color-text);background:${t ? t.color : 'var(--color-border)'};user-select:none"
          onclick="_personalAbrirPopoverTurno(this, '${e.id}', '${f}', '${e.puesto}')">
          ${t ? t.label : '—'}
        </div>
      </td>`
  }

  function filaEmpleado(e) {
    return `
      <tr>
        <td style="font-weight:600;white-space:nowrap">
          ${e.nombre}
          <span id="foco-sin-descanso-${e.id}" style="display:none;font-size:10px;margin-left:6px" title="Sin día de descanso asignado esta semana">🔴</span>
        </td>
        ${fechas.map(f => celdaTurno(e, f)).join('')}
      </tr>`
  }

  function filaSeccion(label) {
    return `
      <tr>
        <td colspan="8" style="background:var(--color-secondary);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--color-text-muted)">${label}</td>
      </tr>`
  }

  const filasTabla = !empleados || !empleados.length
    ? `<tr><td colspan="8" style="text-align:center;color:var(--color-text-muted)">No hay empleados activos.</td></tr>`
    : PERSONAL_SECCION_ORDEN
        .filter(sec => (porSeccion[sec] || []).length > 0)
        .map(sec => filaSeccion(sec) + porSeccion[sec].map(filaEmpleado).join(''))
        .join('')

  cont.innerHTML = `
    <div class="vista-header" style="margin-bottom:16px;flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <button class="btn-accion" style="border:1px solid var(--color-border);${esSemanaActual ? 'opacity:0.4;cursor:not-allowed' : ''}" ${esSemanaActual ? 'disabled' : ''} onclick="_personalCambiarSemanaHorarios(-7)">‹ Semana anterior</button>
        <h3 style="font-family:var(--font-brand);font-size:18px;margin:0">Semana del ${lunLabel.getDate()} al ${domLabel.getDate()} de ${PERSASIS_MESES_NOMBRES[domLabel.getMonth()]} ${domLabel.getFullYear()}</h3>
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="_personalCambiarSemanaHorarios(7)">Siguiente semana ›</button>
      </div>
    </div>
    <div id="personal-horarios-avisos"></div>
    <div class="tabla-wrapper card-surface">
      <table class="tabla" id="personal-horarios-tabla">
        <thead>
          <tr>
            <th>Empleado</th>
            ${fechas.map(f => {
              const d = new Date(f + 'T12:00:00')
              return `<th style="text-align:center">${PERSONAL_DIAS_SEMANA[d.getDay() === 0 ? 6 : d.getDay() - 1]}<br><span style="font-weight:400;text-transform:none">${d.getDate()}</span></th>`
            }).join('')}
          </tr>
        </thead>
        <tbody>
          ${filasTabla}
        </tbody>
      </table>
    </div>
  `

  renderPersonalAvisosDescanso()
  _personalRenderBotonGuardarFlotante()
}

function onChangePersonalTurno(idEmpleado, fecha, valor) {
  if (!window._personalHorariosValores[idEmpleado]) window._personalHorariosValores[idEmpleado] = {}
  if (valor) window._personalHorariosValores[idEmpleado][fecha] = valor
  else delete window._personalHorariosValores[idEmpleado][fecha]
  renderPersonalAvisosDescanso()
  _personalActualizarEstadoGuardar()
}

// ── Celda de color + popover de selección de turno ──────────────────────────
function _personalAbrirPopoverTurno(celdaEl, idEmpleado, fecha, puesto) {
  _personalCerrarPopoverTurno()

  const permitidos = _personalTurnosPermitidos(puesto)
  const pop = document.createElement('div')
  pop.id = 'personal-turno-popover'
  pop.style.cssText = 'position:absolute;z-index:2000;background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius);box-shadow:0 8px 24px rgba(0,0,0,0.18);padding:6px;min-width:170px'

  const opcionHtml = (key, label, color) => `
    <button type="button" style="display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:8px 10px;border:none;background:transparent;border-radius:6px;cursor:pointer;font-family:var(--font-main);font-size:13px;color:var(--color-text)"
      onmouseover="this.style.background='var(--color-secondary)'" onmouseout="this.style.background='transparent'"
      onclick="_personalElegirTurno('${idEmpleado}', '${fecha}', '${key}')">
      ${color ? `<span style="width:14px;height:14px;border-radius:4px;background:${color};display:inline-block;flex-shrink:0;border:1px solid var(--color-border)"></span>` : `<span style="width:14px;height:14px;flex-shrink:0"></span>`}
      ${label}
    </button>`

  pop.innerHTML = opcionHtml('', 'Sin asignar', null) +
    permitidos.map(key => opcionHtml(key, PERSONAL_TURNOS[key].label, PERSONAL_TURNOS[key].color)).join('')

  document.body.appendChild(pop)

  const rect = celdaEl.getBoundingClientRect()
  pop.style.left = `${rect.left + window.scrollX}px`
  pop.style.top = `${rect.bottom + window.scrollY + 4}px`

  setTimeout(() => document.addEventListener('click', _personalCerrarPopoverTurnoListener), 0)
}

function _personalCerrarPopoverTurnoListener(ev) {
  const pop = document.getElementById('personal-turno-popover')
  if (pop && !pop.contains(ev.target)) _personalCerrarPopoverTurno()
}

function _personalCerrarPopoverTurno() {
  const pop = document.getElementById('personal-turno-popover')
  if (pop) pop.remove()
  document.removeEventListener('click', _personalCerrarPopoverTurnoListener)
}

function _personalElegirTurno(idEmpleado, fecha, valor) {
  _personalCerrarPopoverTurno()
  onChangePersonalTurno(idEmpleado, fecha, valor)
  const celda = document.querySelector(`.turno-celda[data-empleado="${idEmpleado}"][data-fecha="${fecha}"]`)
  if (!celda) return
  const t = PERSONAL_TURNOS[valor]
  celda.style.background = t ? t.color : 'var(--color-border)'
  celda.textContent = t ? t.label : '—'
}

// ── Botón flotante "Guardar horarios" — solo se habilita si hay cambios ──────
function _personalRenderBotonGuardarFlotante() {
  let wrap = document.getElementById('personal-guardar-flotante-wrap')
  if (!wrap) {
    wrap = document.createElement('div')
    wrap.id = 'personal-guardar-flotante-wrap'
    wrap.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:1500'
    document.body.appendChild(wrap)
  }
  wrap.innerHTML = `
    <button id="btn-guardar-horarios-flotante" class="btn-accion btn-aprobar" disabled
      style="position:relative;box-shadow:0 4px 16px rgba(0,0,0,0.2);padding:14px 22px;font-size:14px;opacity:0.4;cursor:not-allowed"
      onclick="guardarPersonalHorarios()">
      Guardar horarios
      <span id="btn-guardar-horarios-badge" style="display:none;position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;background:var(--color-highlight);border:2px solid var(--color-bg)"></span>
    </button>
  `
}

function _personalQuitarBotonGuardarFlotante() {
  const wrap = document.getElementById('personal-guardar-flotante-wrap')
  if (wrap) wrap.remove()
}

function _personalActualizarEstadoGuardar() {
  const btn = document.getElementById('btn-guardar-horarios-flotante')
  if (!btn) return
  const hayCambios = JSON.stringify(window._personalHorariosValores) !== window._personalHorariosValoresOriginal
  btn.disabled = !hayCambios
  btn.style.opacity = hayCambios ? '1' : '0.4'
  btn.style.cursor = hayCambios ? 'pointer' : 'not-allowed'
  const badge = document.getElementById('btn-guardar-horarios-badge')
  if (badge) badge.style.display = hayCambios ? '' : 'none'
}

// Un empleado se marca "sin descanso" si ninguno de sus turnos asignados es
// 'descanso' — salvo que todos sus días asignados sean 'apoyo' (empleados de
// apoyo a otro negocio, sin horario esperado en este, no aplica la regla).
function _personalEmpleadoSinDescanso(idEmpleado) {
  const valores = window._personalHorariosValores || {}
  const dias = Object.values(valores[idEmpleado] || {})
  const tieneDescanso = dias.includes('descanso')
  const todosApoyo = dias.length > 0 && dias.every(v => v === 'apoyo')
  return !tieneDescanso && !todosApoyo
}

function renderPersonalAvisosDescanso() {
  const cont = document.getElementById('personal-horarios-avisos')
  if (!cont) return
  const empleados = window._personalEmpleadosActivos || []

  let algunoSinDescanso = false
  empleados.forEach(e => {
    const sinDescanso = _personalEmpleadoSinDescanso(e.id)
    if (sinDescanso) algunoSinDescanso = true
    const foco = document.getElementById(`foco-sin-descanso-${e.id}`)
    if (foco) foco.style.display = sinDescanso ? 'inline' : 'none'
  })

  cont.innerHTML = algunoSinDescanso
    ? `<div class="banner-aviso" style="margin-bottom:16px">⚠ Hay empleados sin día de descanso asignado esta semana</div>`
    : ''
}

async function guardarPersonalHorarios() {
  const tenant_id = window._personalTenant
  const fechas    = window._personalHorariosFechas || []
  const empleados = window._personalEmpleadosActivos || []
  const valores   = window._personalHorariosValores || {}

  if (!empleados.length) return

  // Defensa adicional: aunque el popover ya restringe las opciones por
  // puesto, si de alguna forma llega un tipo_turno fuera de lo permitido
  // (ej. manipulación del DOM) se ignora esa celda en vez de guardarla.
  const rows = []
  let ignoradosGerente = 0
  empleados.forEach(e => {
    const dias = valores[e.id] || {}
    const permitidos = _personalTurnosPermitidos(e.puesto)
    fechas.forEach(f => {
      const tipo = dias[f]
      if (!tipo) return
      if (!permitidos.includes(tipo)) {
        if (tipo === 'gerente') ignoradosGerente++
        return
      }
      const turno = PERSONAL_TURNOS[tipo]
      rows.push({
        tenant_id,
        id_empleado: e.id,
        fecha: f,
        tipo_turno: tipo,
        hora_inicio: turno.inicio,
        hora_fin: turno.fin,
        created_by: window._email || null
      })
    })
  })

  const idsEmpleados = empleados.map(e => e.id)

  try {
    const { error: errDel } = await window._db.from('horarios')
      .delete()
      .eq('tenant_id', tenant_id)
      .in('id_empleado', idsEmpleados)
      .in('fecha', fechas)
    if (errDel) throw errDel

    if (rows.length > 0) {
      const { error: errIns } = await window._db.from('horarios').insert(rows)
      if (errIns) throw errIns
    }

    if (ignoradosGerente > 0) alert(`Se ignoraron ${ignoradosGerente} asignaciones inválidas de turno Gerente.`)
    alert('Horarios guardados.')
    await renderPersonalHorarios(fechas)
  } catch (err) {
    alert(`Error al guardar: ${err.message}`)
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ── TAB: REGISTROS DE ASISTENCIA ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

async function renderPersonalRegistros() {
  const cont = document.getElementById('personal-tab-content')
  const tenant_id = window._personalTenant

  const [{ data: registros, error: errR }, { data: empleados, error: errE }] = await Promise.all([
    window._db.from('registros_asistencia')
      .select('id, id_empleado, tipo, fecha_hora, dentro_geocerca, distancia_m, id_horario')
      .eq('tenant_id', tenant_id)
      .order('fecha_hora', { ascending: false }),
    window._db.from('empleados').select('id, nombre').eq('tenant_id', tenant_id)
  ])

  if (errR || errE) {
    cont.innerHTML = `<p style="color:var(--color-highlight)">Error: ${(errR || errE).message}</p>`
    return
  }

  const nombrePorId = {}
  ;(empleados || []).forEach(e => { nombrePorId[e.id] = e.nombre })

  window._persAsisData       = registros || []
  window._persAsisNombrePorId = nombrePorId
  window._persAsisNivel1     = 'Todo'
  window._persAsisMesSel     = null
  window._persAsisSemanaSel  = null

  cont.innerHTML = `
    <div id="persasis-filtro" style="margin-bottom:16px"></div>
    <div id="persasis-lista-wrap"></div>
  `

  renderPersAsisFiltro()
  renderPersAsisVista()
}

function _filtrarPersAsisPorPeriodo() {
  const todos = window._persAsisData || []
  const nivel1 = window._persAsisNivel1 || 'Todo'
  if (nivel1 === 'Todo') return todos
  if (nivel1 === 'Mes') {
    if (!window._persAsisMesSel) return todos
    return todos.filter(r => r.fecha_hora.slice(0, 7) === window._persAsisMesSel)
  }
  if (nivel1 === 'Semana') {
    if (!window._persAsisMesSel) return todos
    const delMes = todos.filter(r => r.fecha_hora.slice(0, 7) === window._persAsisMesSel)
    if (!window._persAsisSemanaSel) return delMes
    return delMes.filter(r => _getLunesPersAsis(r.fecha_hora.slice(0, 10)) === window._persAsisSemanaSel)
  }
  return todos
}

function renderPersAsisFiltro() {
  const cont = document.getElementById('persasis-filtro')
  if (!cont) return
  const todos = window._persAsisData || []
  const { meses, porMes } = _agruparPersAsisPorMes(todos)
  const añosDistintos = [...new Set(meses.map(m => m.split('-')[0]))]
  const soloUnAño = añosDistintos.length === 1
  const nivel1 = window._persAsisNivel1 || 'Todo'

  let html = `
    <div class="cierres-segmented">
      ${['Todo', 'Mes', 'Semana'].map(p => `
        <button class="btn-periodo${nivel1 === p ? ' active' : ''}" onclick="setPersAsisNivel1('${p}')">${p}</button>`).join('')}
    </div>`

  if (nivel1 === 'Mes' || nivel1 === 'Semana') {
    html += `
    <div class="cierres-segmented cierres-segmented-sub" style="margin-top:10px">
      ${meses.map(mes => `
        <button class="btn-periodo${window._persAsisMesSel === mes ? ' active' : ''}" onclick="setPersAsisMes('${mes}')">${_persAsisMesLabelDe(mes, soloUnAño)}</button>`).join('')}
    </div>`
  }

  if (nivel1 === 'Semana' && window._persAsisMesSel) {
    const { semanas } = _agruparPersAsisPorSemana(porMes[window._persAsisMesSel] || [])
    html += `
    <div class="cierres-segmented cierres-segmented-sub" style="margin-top:8px">
      ${semanas.map(lunes => `
        <button class="btn-periodo${window._persAsisSemanaSel === lunes ? ' active' : ''}" onclick="setPersAsisSemana('${lunes}')">${_semLabelPersAsis(lunes)}</button>`).join('')}
    </div>`
  }

  cont.innerHTML = html
}

function setPersAsisNivel1(nivel) {
  window._persAsisNivel1    = nivel
  window._persAsisMesSel    = null
  window._persAsisSemanaSel = null
  renderPersAsisFiltro()
  renderPersAsisVista()
}

function setPersAsisMes(mes) {
  window._persAsisMesSel    = mes
  window._persAsisSemanaSel = null
  renderPersAsisFiltro()
  renderPersAsisVista()
}

function setPersAsisSemana(lunes) {
  window._persAsisSemanaSel = lunes
  renderPersAsisFiltro()
  renderPersAsisVista()
}

function renderPersAsisVista() {
  const wrap = document.getElementById('persasis-lista-wrap')
  if (!wrap) return
  const registros = _filtrarPersAsisPorPeriodo()
  const nombrePorId = window._persAsisNombrePorId || {}

  if (!registros.length) {
    wrap.innerHTML = `<p style="color:var(--color-text-muted);text-align:center;padding:24px 0">Sin registros para este periodo.</p>`
    return
  }

  wrap.innerHTML = `
    <div class="tabla-wrapper card-surface">
      <table class="tabla">
        <thead>
          <tr>
            <th>Empleado</th>
            <th>Tipo</th>
            <th>Fecha y hora</th>
            <th>Ubicación</th>
            <th>Horario asignado</th>
          </tr>
        </thead>
        <tbody>
          ${registros.map(r => {
            const fecha = new Date(r.fecha_hora)
            const fechaLabel = fecha.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            const tipoLabel = r.tipo ? r.tipo.charAt(0).toUpperCase() + r.tipo.slice(1) : '—'
            const geocercaIcon = r.dentro_geocerca === false
              ? `<span title="Fuera de la geocerca">⚠️ Fuera</span>`
              : r.dentro_geocerca === true
              ? `<span title="Dentro de la geocerca" style="color:#3A8C3E">✓ Dentro</span>`
              : '—'
            const horarioIcon = r.id_horario ? '✓' : '—'
            return `
              <tr>
                <td>${nombrePorId[r.id_empleado] || '—'}</td>
                <td>${tipoLabel}</td>
                <td>${fechaLabel}</td>
                <td style="font-size:12px">${geocercaIcon}</td>
                <td style="text-align:center">${horarioIcon}</td>
              </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
  `
}
