// ── Vista: Checador para rol `empleado` (pantalla única, login persistente) ──
// Reusa _getLunesPersAsis / _personalFechasDesdeLunes / PERSONAL_DIAS_SEMANA
// de views/personal.js (mismo patrón de semana Lun-Dom que la pestaña Horarios).

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

  const hoyLocal = new Date().toLocaleDateString('en-CA')
  const lunesStr = _getLunesPersAsis(hoyLocal)
  const fechas = _personalFechasDesdeLunes(lunesStr)

  const { data: horarios } = await window._db.from('horarios')
    .select('fecha, tipo_turno, hora_inicio, hora_fin')
    .eq('id_empleado', miEmpleado.id)
    .gte('fecha', fechas[0])
    .lte('fecha', fechas[6])
    .order('fecha')

  const porFecha = {}
  ;(horarios || []).forEach(h => { porFecha[h.fecha] = h })

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
        </div>

        <button id="checador-emp-btn-registrar"
          style="width:100%;padding:20px;font-size:17px;font-weight:700;border:none;border-radius:var(--radius);background:var(--color-primary);color:#FAF7F2;cursor:pointer;font-family:var(--font-main);">
          Registrar asistencia
        </button>
        <div id="checador-emp-status" style="margin-top:16px;text-align:center;min-height:20px;font-size:14px;"></div>
      </div>
    </div>
  `

  document.getElementById('checador-emp-logout-btn').addEventListener('click', async () => {
    try { await logout() } catch {}
    window.location.reload()
  })

  document.getElementById('checador-emp-btn-registrar').addEventListener('click', _registrarAsistenciaEmpleado)
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

        if (data && data.id_registro) {
          const tipoLabel = data.tipo ? data.tipo.charAt(0).toUpperCase() + data.tipo.slice(1) : 'Asistencia'
          const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
          const avisoGeo = data.dentro_geocerca === false
            ? `<div style="margin-top:8px;font-size:13px;color:var(--color-highlight);">Parece que no estás en el negocio, pero tu registro ya se guardó.</div>`
            : ''
          status.innerHTML = `
            <div style="font-size:19px;font-weight:700;color:#3A8C3E;">✓ ${tipoLabel} registrada</div>
            <div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">${hora}</div>
            ${avisoGeo}`
          btn.disabled = false
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
