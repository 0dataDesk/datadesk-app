// ── Vista: Checador para rol `empleado` (pantalla única, login persistente) ──
// Reusa _getLunesPersAsis / _personalFechasDesdeLunes / PERSONAL_DIAS_SEMANA
// de views/personal.js (mismo patrón de semana Lun-Dom que la pestaña Horarios).

const CHECADOR_FRASES_MOTIVACION = [
  '¡Vamos con todo el equipo!',
  'Gracias por tu puntualidad, así se construye un gran equipo.',
  'Un día más para dar lo mejor de ti.',
  'Tu esfuerzo hace la diferencia en el equipo.',
  '¡A darle con toda la actitud!',
  'Gracias por estar aquí, el equipo cuenta contigo.',
  'Hoy es un gran día para hacer un gran trabajo.',
  'Tu compromiso no pasa desapercibido, gracias.',
  '¡Que tengas un excelente turno!',
  'Cada turno cuenta, gracias por sumar.'
]

function _fraseMotivacionalAleatoria() {
  return CHECADOR_FRASES_MOTIVACION[Math.floor(Math.random() * CHECADOR_FRASES_MOTIVACION.length)]
}

async function mostrarChecadorEmpleado(tenant_id, contenedorId = 'app') {
  const { data: { user } } = await window._db.auth.getUser()
  const { data: miEmpleado } = await window._db.from('empleados')
    .select('id, nombre')
    .eq('auth_user_id', user.id)
    .eq('tenant_id', tenant_id)
    .maybeSingle()

  if (!miEmpleado) {
    _renderChecadorEmpleadoSinVinculo(contenedorId)
    return
  }

  window._checadorEmpTenant = tenant_id
  window._checadorEmpId = miEmpleado.id

  const hoyLocal = new Date().toLocaleDateString('en-CA')
  const lunesStr = _getLunesPersAsis(hoyLocal)
  const fechas = _personalFechasDesdeLunes(lunesStr)
  const esLunes = new Date(hoyLocal + 'T12:00:00').getDay() === 1

  const { data: horarios } = await window._db.from('horarios')
    .select('fecha, tipo_turno, hora_inicio, hora_fin')
    .eq('id_empleado', miEmpleado.id)
    .gte('fecha', fechas[0])
    .lte('fecha', fechas[6])
    .order('fecha')

  const porFecha = {}
  ;(horarios || []).forEach(h => { porFecha[h.fecha] = h })

  let horarioConfirmado = true
  if (esLunes) {
    const { data: confirmacion } = await window._db.from('confirmaciones_horario')
      .select('id')
      .eq('id_empleado', miEmpleado.id)
      .eq('lunes_semana', lunesStr)
      .maybeSingle()
    horarioConfirmado = !!confirmacion
  }

  const horarioHtml = fechas.map((f, i) => {
    const dia = PERSONAL_DIAS_SEMANA[i]
    const row = porFecha[f]
    let detalle = 'Sin turno asignado'
    if (row) {
      detalle = row.tipo_turno === 'descanso'
        ? 'Descanso'
        : `${row.tipo_turno.charAt(0).toUpperCase()}${row.tipo_turno.slice(1)} · ${(row.hora_inicio || '').slice(0, 5)}–${(row.hora_fin || '').slice(0, 5)}`
    }
    return `
      <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--color-border);font-size:14px;">
        <span>${dia}</span>
        <span style="color:${row ? 'var(--color-text)' : 'var(--color-text-muted)'}">${detalle}</span>
      </div>`
  }).join('')

  const hoyRow = porFecha[hoyLocal]
  const terminaHoyHtml = (hoyRow && hoyRow.tipo_turno !== 'descanso' && hoyRow.tipo_turno !== 'apoyo' && hoyRow.hora_fin)
    ? `<p style="font-size:12px;color:var(--color-text-muted);margin-top:6px">Tu horario de hoy termina a las ${hoyRow.hora_fin.slice(0, 5)}.</p>`
    : ''

  document.getElementById(contenedorId).innerHTML = `
    <div class="login-wrapper">
      <div class="receta-detalle-card" style="width:100%;max-width:420px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
          <div style="font-family:var(--font-brand);font-size:22px;font-weight:600;color:var(--color-primary);">${miEmpleado.nombre}</div>
          <button id="checador-emp-logout-btn"
            style="padding:8px 14px;font-size:12px;background:transparent;border:1px solid var(--color-border);border-radius:var(--radius);color:var(--color-text);cursor:pointer;font-family:var(--font-main);white-space:nowrap;">
            Cerrar sesión
          </button>
        </div>

        <div style="margin-bottom:24px;">
          <h4 style="font-size:10px;font-weight:600;margin:0 0 10px;color:var(--color-accent);text-transform:uppercase;">Tu horario esta semana</h4>
          <div id="checador-emp-horario">${horarioHtml}</div>
          <p style="font-size:12px;color:var(--color-text-muted);margin-top:10px;font-weight:600">El tiempo extra siempre debe autorizarlo tu gerente de sucursal.</p>
          ${terminaHoyHtml}
        </div>

        <div id="checador-emp-btn-wrap"></div>
        <div id="checador-emp-status" style="margin-top:16px;text-align:center;min-height:20px;font-size:14px;"></div>
      </div>
    </div>
  `

  document.getElementById('checador-emp-logout-btn').addEventListener('click', async () => {
    try { await logout() } catch {}
    window.location.reload()
  })

  _pintarBotonChecador(esLunes && !horarioConfirmado)
}

function _renderChecadorEmpleadoSinVinculo(contenedorId = 'app') {
  document.getElementById(contenedorId).innerHTML = `
    <div class="login-wrapper">
      <div class="receta-detalle-card" style="width:100%;max-width:380px;text-align:center;">
        <div style="font-size:44px;margin-bottom:16px;">⚠️</div>
        <p style="margin-bottom:24px;color:var(--color-text);">Tu cuenta no está vinculada a un empleado. Avisa a tu administrador.</p>
        <button id="checador-emp-logout-btn-sinvinculo"
          style="width:100%;padding:13px;background:var(--color-primary);color:#FAF7F2;border:none;border-radius:var(--radius);font-size:14px;font-weight:600;cursor:pointer;font-family:var(--font-main);">
          Cerrar sesión
        </button>
      </div>
    </div>
  `
  document.getElementById('checador-emp-logout-btn-sinvinculo').addEventListener('click', async () => {
    try { await logout() } catch {}
    window.location.reload()
  })
}

// ── Botón principal: alterna entre "Confirmar horario" (lunes sin confirmar) y "Registrar asistencia" ──
function _pintarBotonChecador(necesitaConfirmar) {
  const wrap = document.getElementById('checador-emp-btn-wrap')
  if (!wrap) return

  if (necesitaConfirmar) {
    wrap.innerHTML = `
      <button id="checador-emp-btn-confirmar"
        style="width:100%;padding:20px;font-size:16px;font-weight:700;border:none;border-radius:var(--radius);background:var(--color-primary);color:#FAF7F2;cursor:pointer;font-family:var(--font-main);">
        Confirmar mi horario de esta semana
      </button>`
    document.getElementById('checador-emp-btn-confirmar').addEventListener('click', _confirmarHorarioEmpleado)
    return
  }

  wrap.innerHTML = `
    <button id="checador-emp-btn-registrar"
      style="width:100%;padding:20px;font-size:17px;font-weight:700;border:none;border-radius:var(--radius);background:var(--color-primary);color:#FAF7F2;cursor:pointer;font-family:var(--font-main);">
      Registrar asistencia
    </button>`
  document.getElementById('checador-emp-btn-registrar').addEventListener('click', _registrarAsistenciaEmpleado)
}

async function _confirmarHorarioEmpleado() {
  const btn = document.getElementById('checador-emp-btn-confirmar')
  const status = document.getElementById('checador-emp-status')
  if (btn) btn.disabled = true
  if (status) status.textContent = 'Confirmando...'

  try {
    const { error } = await window._db.rpc('fn_confirmar_horario_propio')
    if (error) throw error
    if (status) status.textContent = ''
    _pintarBotonChecador(false)
  } catch (err) {
    if (status) status.innerHTML = `<span style="color:var(--color-highlight);">No se pudo confirmar. Intenta de nuevo.</span>`
    if (btn) btn.disabled = false
  }
}

function _registrarAsistenciaEmpleado() {
  const btn = document.getElementById('checador-emp-btn-registrar')
  const status = document.getElementById('checador-emp-status')
  if (!btn || !status) return

  btn.disabled = true
  status.textContent = 'Obteniendo ubicación...'

  if (!navigator.geolocation) {
    status.innerHTML = `<span style="color:var(--color-highlight);">Este navegador no soporta ubicación. Prueba con otro navegador.</span>`
    btn.disabled = false
    return
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      status.textContent = 'Registrando...'
      try {
        const { data, error } = await window._db.rpc('fn_checado_propio', {
          p_lat: pos.coords.latitude,
          p_lng: pos.coords.longitude
        })

        if (error) throw error

        if (data && data.error === 'empleado_no_vinculado') {
          status.innerHTML = `<span style="color:var(--color-highlight);">Tu cuenta no está vinculada, avisa a tu administrador.</span>`
          btn.disabled = false
          return
        }

        if (data && data.error === 'geocerca_no_configurada') {
          status.innerHTML = `<span style="color:var(--color-highlight);">Este negocio no tiene su ubicación configurada todavía.</span>`
          btn.disabled = false
          return
        }

        if (data && data.error === 'horario_no_confirmado') {
          status.textContent = ''
          _pintarBotonChecador(true)
          return
        }

        if (data && data.error === 'requiere_autorizacion') {
          status.textContent = ''
          btn.disabled = false
          _notificarIncidenciaPush(data.incidencia_id)
          _abrirModalNip(data.incidencia_id)
          return
        }

        if (data && data.id_registro) {
          _mostrarConfirmacionChecado(data)
          return
        }

        status.innerHTML = `<span style="color:var(--color-highlight);">No se pudo registrar. Intenta de nuevo.</span>`
        btn.disabled = false
      } catch (err) {
        status.innerHTML = `<span style="color:var(--color-highlight);">No se pudo registrar. Intenta de nuevo.</span>`
        btn.disabled = false
      }
    },
    (err) => {
      status.innerHTML = err.code === err.PERMISSION_DENIED
        ? `<span style="color:var(--color-highlight);">Necesitamos tu ubicación. Acepta el permiso del navegador e intenta de nuevo.</span>`
        : `<span style="color:var(--color-highlight);">No pudimos obtener tu ubicación. Verifica el GPS e intenta de nuevo.</span>`
      btn.disabled = false
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  )
}

// Pantalla de confirmación compartida por el flujo normal y el autorizado por NIP.
function _mostrarConfirmacionChecado(data) {
  const status = document.getElementById('checador-emp-status')
  const btn = document.getElementById('checador-emp-btn-registrar')
  if (!status) return

  const tipoLabel = data.tipo ? data.tipo.charAt(0).toUpperCase() + data.tipo.slice(1) : 'Asistencia'
  const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  const avisoGeo = data.dentro_geocerca === false
    ? `<div style="margin-top:8px;font-size:13px;color:var(--color-highlight);">Parece que no estás en el negocio, pero tu registro ya se guardó.</div>`
    : ''
  const frase = data.tipo === 'entrada'
    ? `<div style="margin-top:12px;font-size:13px;color:var(--color-primary);font-style:italic;">${_fraseMotivacionalAleatoria()}</div>`
    : ''

  status.innerHTML = `
    <div style="font-size:19px;font-weight:700;color:#3A8C3E;">✓ ${tipoLabel} registrada</div>
    <div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">${hora}</div>
    ${avisoGeo}
    ${frase}`

  if (btn) btn.disabled = false
}

// ── Notificación push al gerente (fire-and-forget, no bloquea el flujo de NIP) ──
function _notificarIncidenciaPush(incidencia_id) {
  try {
    fetch('/api/push/notificar-incidencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant: window._checadorEmpTenant, incidencia_id })
    }).catch(() => {})
  } catch (e) {}
}

// ── Modal de autorización por NIP (requiere_autorizacion) ──
function _abrirModalNip(incidencia_id) {
  const existente = document.getElementById('checador-modal-nip')
  if (existente) existente.remove()

  const div = document.createElement('div')
  div.id = 'checador-modal-nip'
  div.dataset.incidenciaId = incidencia_id
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;'
  div.innerHTML = `
    <div style="background:var(--color-surface,#fff);border-radius:20px;padding:28px 24px;width:100%;max-width:340px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
      <div style="font-size:1.1rem;font-weight:700;margin-bottom:6px;">Necesitas autorización de tu gerente para continuar.</div>
      <p style="color:var(--color-text-muted);font-size:13px;margin-bottom:16px;">Pide a tu gerente que ingrese su NIP en este celular.</p>
      <input type="password" id="checador-nip-input" inputmode="numeric" maxlength="4"
        placeholder="••••" oninput="_onNipInputChecador(this)"
        style="width:100%;padding:14px;text-align:center;font-size:26px;letter-spacing:10px;border:2px solid var(--color-border);border-radius:12px;background:var(--color-bg);font-family:var(--font-main);">
      <div id="checador-nip-err" style="color:var(--color-highlight);font-size:13px;margin-top:10px;min-height:16px"></div>
      <p style="font-size:11px;color:var(--color-text-muted);margin-top:18px;line-height:1.4">¿No hay un responsable contigo? Se puede autorizar a distancia — esta opción todavía no está disponible.</p>
      <button id="checador-nip-cancelar"
        style="margin-top:14px;padding:10px 16px;background:transparent;border:1px solid var(--color-border);border-radius:var(--radius);color:var(--color-text);cursor:pointer;font-size:13px;font-family:var(--font-main);">
        Cancelar
      </button>
    </div>
  `
  document.body.appendChild(div)
  setTimeout(() => document.getElementById('checador-nip-input')?.focus(), 100)
  document.getElementById('checador-nip-cancelar').addEventListener('click', () => div.remove())
}

function _onNipInputChecador(el) {
  if (el.value.length === 4) _validarNipChecador()
}

async function _validarNipChecador() {
  const modal = document.getElementById('checador-modal-nip')
  const input = document.getElementById('checador-nip-input')
  const err = document.getElementById('checador-nip-err')
  if (!modal || !input) return

  const pin = input.value.trim()
  const incidencia_id = modal.dataset.incidenciaId
  input.disabled = true
  if (err) err.textContent = ''

  try {
    const { data, error } = await window._db.rpc('fn_autorizar_checado_nip', {
      p_incidencia_id: incidencia_id,
      p_pin: pin
    })
    if (error) throw error

    if (data && data.error === 'pin_incorrecto') {
      if (err) err.textContent = 'PIN incorrecto'
      input.value = ''
      input.disabled = false
      input.focus()
      return
    }

    if (data && data.error === 'incidencia_no_valida') {
      if (err) err.textContent = 'Esta solicitud ya no es válida.'
      input.disabled = false
      return
    }

    if (data && data.id_registro) {
      modal.remove()
      _mostrarConfirmacionChecado(data)
      return
    }

    if (err) err.textContent = 'No se pudo autorizar. Intenta de nuevo.'
    input.value = ''
    input.disabled = false
  } catch (e) {
    if (err) err.textContent = 'No se pudo autorizar. Intenta de nuevo.'
    input.value = ''
    input.disabled = false
  }
}
