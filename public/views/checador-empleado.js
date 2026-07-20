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

const CHECADOR_EMOJI_TURNO = { apertura: '🌅', intermedio_1: '🌤️', intermedio_2: '🌥️', cierre: '🌙', gerente: '👔', descanso: '🌿', apoyo: '🤝' }

// "Domingo, 19 de julio" — reusa los mismos nombres de días/meses que ya usa Horarios.
function _checadorFechaLarga(d) {
  const diaSemana = PERSONAL_DIAS_SEMANA[d.getDay() === 0 ? 6 : d.getDay() - 1]
  const mes = PERSASIS_MESES_NOMBRES[d.getMonth()].toLowerCase()
  return `${diaSemana}, ${d.getDate()} de ${mes}`
}

function _checadorHoraActual() {
  return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })
}

// Reloj en vivo, actualizado cada minuto — se autodetiene si el elemento ya no existe
// (pantalla cerrada/navegación fuera), sin necesidad de limpiarlo a mano.
function _checadorIniciarReloj() {
  const intervalId = setInterval(() => {
    const el = document.getElementById('checador-emp-reloj')
    if (!el) { clearInterval(intervalId); return }
    el.textContent = _checadorHoraActual()
  }, 60000)
}

// Clima decorativo: no bloquea el render inicial (se llama sin await) y si falla
// por cualquier motivo (sin internet, zona no configurada, etc.) simplemente no
// muestra nada — nunca un error visible.
function _checadorEmojiClima(code) {
  if (code === 0 || code === 1) return '☀️'
  if (code === 2 || code === 3) return '☁️'
  if (code >= 45 && code <= 48) return '🌫️'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '🌧️'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '❄️'
  if (code >= 95 && code <= 99) return '⛈️'
  return '☁️'
}

async function _checadorCargarClima(tenant_id) {
  try {
    const { data: cfg } = await window._db.from('config_pos').select('zona_activa_id').eq('tenant_id', tenant_id).maybeSingle()
    if (!cfg?.zona_activa_id) return
    const { data: zona } = await window._db.from('config_pos_zonas').select('lat, lng').eq('id', cfg.zona_activa_id).maybeSingle()
    if (!zona) return
    const resp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${zona.lat}&longitude=${zona.lng}&current_weather=true`)
    const data = await resp.json()
    const temp = data?.current_weather?.temperature
    const code = data?.current_weather?.weathercode
    if (temp === undefined || temp === null) return
    const el = document.getElementById('checador-emp-clima')
    if (el) el.textContent = `${_checadorEmojiClima(code)} ${Math.round(temp)}°C`
  } catch (e) {
    // decorativo — si falla, no se muestra nada, sin bloquear ni avisar error
  }
}

// Semáforo de entrada/salida — null si no aplica (día completo, descanso/apoyo,
// o sin horario). Compara instantes absolutos (Date.now() vs el objetivo con
// offset -06:00 explícito), así que es correcto sin importar la zona horaria
// del dispositivo.
function _checadorEstadoSemaforo(hoyRow, tieneEntradaHoy, tieneSalidaHoy, hoyLocal) {
  if (!hoyRow || hoyRow.tipo_turno === 'descanso' || hoyRow.tipo_turno === 'apoyo' || (tieneEntradaHoy && tieneSalidaHoy)) {
    return null
  }

  let horaObjetivo, esEntrada
  if (!tieneEntradaHoy && hoyRow.hora_inicio) {
    horaObjetivo = hoyRow.hora_inicio
    esEntrada = true
  } else if (tieneEntradaHoy && !tieneSalidaHoy && hoyRow.hora_fin) {
    horaObjetivo = hoyRow.hora_fin
    esEntrada = false
  } else {
    return null
  }

  const objetivo = new Date(`${hoyLocal}T${horaObjetivo}-06:00`)
  const diffMin = Math.round((objetivo.getTime() - Date.now()) / 60000)

  if (diffMin > 5) {
    return { color: '#3A8C3E', texto: esEntrada ? `Entras en ${diffMin} min` : `Faltan ${diffMin} min para tu salida` }
  }
  if (diffMin >= 0) {
    return { color: 'var(--color-accent)', texto: esEntrada ? `Entras en ${diffMin} min` : `Faltan ${diffMin} min para tu salida` }
  }
  return { color: 'var(--color-highlight)', texto: esEntrada ? 'Ya deberías haber entrado' : 'Ya puedes retirarte' }
}

function _checadorActualizarSemaforo(hoyRow, tieneEntradaHoy, tieneSalidaHoy, hoyLocal) {
  const el = document.getElementById('checador-emp-semaforo')
  if (!el) return false
  const estado = _checadorEstadoSemaforo(hoyRow, tieneEntradaHoy, tieneSalidaHoy, hoyLocal)
  el.innerHTML = estado ? `<span style="color:${estado.color}">●</span> ${estado.texto}` : ''
  return true
}

// Se actualiza solo cada 30s; se autodetiene si el elemento ya no existe.
function _checadorIniciarSemaforo(hoyRow, tieneEntradaHoy, tieneSalidaHoy, hoyLocal) {
  const intervalId = setInterval(() => {
    const sigueAhi = _checadorActualizarSemaforo(hoyRow, tieneEntradaHoy, tieneSalidaHoy, hoyLocal)
    if (!sigueAhi) clearInterval(intervalId)
  }, 30000)
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
  const lunesRealStr = _getLunesPersAsis(hoyLocal)
  // El piso solo limita qué semana de horarios se consulta y muestra en
  // pantalla — esLunes y la semana que se confirma siguen usando el lunes
  // real (lunesRealStr), nunca el clampeado.
  let lunesStr = lunesRealStr
  if (lunesStr < PERSONAL_HORARIOS_PISO) lunesStr = PERSONAL_HORARIOS_PISO
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
      .eq('lunes_semana', lunesRealStr)
      .maybeSingle()
    horarioConfirmado = !!confirmacion
  }

  // Estado real de hoy (¿ya entró?, ¿ya salió?) — necesario para el semáforo.
  const { data: registrosHoy } = await window._db.from('registros_asistencia')
    .select('tipo, fecha_hora')
    .eq('id_empleado', miEmpleado.id)
    .gte('fecha_hora', `${hoyLocal}T00:00:00-06:00`)
    .lt('fecha_hora', `${hoyLocal}T23:59:59-06:00`)
    .order('fecha_hora')
  const tieneEntradaHoy = (registrosHoy || []).some(r => r.tipo === 'entrada')
  const tieneSalidaHoy  = (registrosHoy || []).some(r => r.tipo === 'salida')

  const horarioHtml = fechas.map((f, i) => {
    const dia = PERSONAL_DIAS_SEMANA[i]
    const row = porFecha[f]
    let detalle = 'Sin turno asignado'
    let bg = ''
    if (row) {
      const turno = PERSONAL_TURNOS[row.tipo_turno]
      const emoji = CHECADOR_EMOJI_TURNO[row.tipo_turno] || ''
      const label = turno ? turno.label : row.tipo_turno
      bg = turno ? turno.color : ''
      detalle = (row.hora_inicio && row.hora_fin)
        ? `${emoji} ${label} · ${row.hora_inicio.slice(0, 5)}–${row.hora_fin.slice(0, 5)}`
        : `${emoji} ${label}`
    }
    return `
      <div style="display:flex;justify-content:space-between;padding:9px 10px;border-bottom:1px solid var(--color-border);font-size:14px;${bg ? `background:${bg};border-radius:6px;` : ''}">
        <span>${dia}</span>
        <span style="color:${row ? 'var(--color-text)' : 'var(--color-text-muted)'}">${detalle}</span>
      </div>`
  }).join('')

  const hoyRow = porFecha[hoyLocal]

  document.getElementById(contenedorId).innerHTML = `
    <div class="login-wrapper">
      <div class="receta-detalle-card" style="width:100%;max-width:420px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div style="font-family:var(--font-brand);font-size:22px;font-weight:600;color:var(--color-primary);">${miEmpleado.nombre}</div>
          <button id="checador-emp-logout-btn"
            style="padding:8px 14px;font-size:12px;background:transparent;border:1px solid var(--color-border);border-radius:var(--radius);color:var(--color-text);cursor:pointer;font-family:var(--font-main);white-space:nowrap;">
            Cerrar sesión
          </button>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;font-size:13px;color:var(--color-text-muted);">
          <span>${_checadorFechaLarga(new Date())}</span>
          <span style="display:flex;align-items:center;gap:10px;">
            <span id="checador-emp-clima"></span>
            <span id="checador-emp-reloj" style="font-weight:600;color:var(--color-text);">${_checadorHoraActual()}</span>
          </span>
        </div>

        <div style="margin-bottom:24px;">
          <h4 style="font-size:10px;font-weight:600;margin:0 0 10px;color:var(--color-accent);text-transform:uppercase;">Tu horario esta semana</h4>
          <div id="checador-emp-horario">${horarioHtml}</div>
          <p style="font-size:12px;color:var(--color-text-muted);margin-top:10px;font-weight:600">El tiempo extra siempre debe autorizarlo tu gerente de sucursal.</p>
          <div id="checador-emp-semaforo" style="font-size:13px;margin-top:8px;font-weight:600;"></div>
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

  _checadorCargarClima(tenant_id)
  _checadorIniciarReloj()
  _checadorActualizarSemaforo(hoyRow, tieneEntradaHoy, tieneSalidaHoy, hoyLocal)
  _checadorIniciarSemaforo(hoyRow, tieneEntradaHoy, tieneSalidaHoy, hoyLocal)
}

function _renderChecadorEmpleadoSinVinculo(contenedorId = 'app') {
  // contenedorId !== 'app' significa que esto se está mostrando como vista previa
  // dentro de Personal → Checador (superadmin/gerente), no como la pantalla real
  // de un empleado logueado — ahí no debe poder cerrar su propia sesión de gerente.
  const esVistaReal = contenedorId === 'app'
  document.getElementById(contenedorId).innerHTML = `
    <div class="login-wrapper">
      <div class="receta-detalle-card" style="width:100%;max-width:380px;text-align:center;">
        <div style="font-size:44px;margin-bottom:16px;">⚠️</div>
        <p style="margin-bottom:24px;color:var(--color-text);">Tu cuenta no está vinculada a un empleado. Avisa a tu administrador.</p>
        ${esVistaReal ? `
        <button id="checador-emp-logout-btn-sinvinculo"
          style="width:100%;padding:13px;background:var(--color-primary);color:#FAF7F2;border:none;border-radius:var(--radius);font-size:14px;font-weight:600;cursor:pointer;font-family:var(--font-main);">
          Cerrar sesión
        </button>` : ''}
      </div>
    </div>
  `
  if (esVistaReal) {
    document.getElementById('checador-emp-logout-btn-sinvinculo').addEventListener('click', async () => {
      try { await logout() } catch {}
      window.location.reload()
    })
  }
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
