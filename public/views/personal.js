// ── Vista: Personal (Empleados, Horarios, Registros de Asistencia) ──────────────
// Mismo patrón de filtro jerárquico Todo/Mes/Semana que cierres.js (helpers
// copiados y renombrados con prefijo PersAsis para no colisionar con los
// globals de cierres.js/consumo.js/incidencias.js, ya que todos comparten
// el mismo scope global).

const PERSONAL_TURNOS = {
  apertura:   { label: 'Apertura',   inicio: '11:00:00', fin: '19:00:00' },
  intermedio: { label: 'Intermedio', inicio: '11:00:00', fin: '20:00:00' },
  cierre:     { label: 'Cierre',     inicio: '14:00:00', fin: '22:00:00' },
  descanso:   { label: 'Descanso',   inicio: null,        fin: null }
}
const PERSONAL_DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const PERSASIS_MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const PERSASIS_MESES_CORTOS  = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function _getLunesPersAsis(fechaStr) {
  const d = new Date(fechaStr + 'T12:00:00')
  const day = d.getDay() || 7
  d.setDate(d.getDate() - (day - 1))
  return d.toISOString().split('T')[0]
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

// ── Carga diferida de librería QR (solo cuando se necesita, no en cada carga de la app) ──
// Vendorizada en public/vendor/qrcode.min.js — el checador tiene que funcionar sí o sí en
// producción, no puede depender de que un CDN externo esté disponible en ese momento.
function _personalCargarQRLib() {
  return new Promise((resolve, reject) => {
    if (window.qrcode) { resolve(); return }
    const s = document.createElement('script')
    s.src = 'vendor/qrcode.min.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('No se pudo cargar la librería de QR'))
    document.head.appendChild(s)
  })
}

// Genera el HTML de un <img> con el QR de `texto` (usa la API de qrcode-generator).
function _personalRenderQR(texto, cellSize) {
  const qr = qrcode(0, 'M')
  qr.addData(texto)
  qr.make()
  return qr.createImgTag(cellSize || 4)
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
    { id: 'registros', label: 'Registros de asistencia' }
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
  if (window._personalTab === 'empleados') await renderPersonalEmpleados()
  if (window._personalTab === 'horarios')  await renderPersonalHorarios()
  if (window._personalTab === 'registros') await renderPersonalRegistros()
}

// ══════════════════════════════════════════════════════════════════════════
// ── TAB: EMPLEADOS ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

async function renderPersonalEmpleados() {
  const cont = document.getElementById('personal-tab-content')
  const tenant_id = window._personalTenant

  const [{ data: empleados, error }, { data: dispositivos }] = await Promise.all([
    window._db
      .from('empleados')
      .select('id, nombre, puesto, activo')
      .eq('tenant_id', tenant_id)
      .order('activo', { ascending: false })
      .order('nombre'),
    window._db
      .from('dispositivos_empleado')
      .select('id_empleado')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)
  ])

  if (error) {
    cont.innerHTML = `<p style="color:var(--color-highlight)">Error: ${error.message}</p>`
    return
  }

  window._personalEmpleados = empleados || []
  // No importa si un empleado tiene más de un dispositivo activo (puede pasar,
  // ej. re-escaneó el link de alta) — no es error, el indicador es el mismo.
  const conDispositivo = new Set((dispositivos || []).map(d => d.id_empleado))

  cont.innerHTML = `
    <div class="vista-header" style="margin-bottom:16px">
      <div></div>
      <button class="btn-accion btn-aprobar" onclick="mostrarFormEmpleado()">+ Nuevo empleado</button>
    </div>
    <div id="personal-form-empleado-wrap"></div>
    <div id="personal-link-wrap"></div>
    <div class="tabla-wrapper card-surface">
      <table class="tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Puesto</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${!empleados || !empleados.length
            ? `<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted)">Sin empleados registrados.</td></tr>`
            : empleados.map(e => `
              <tr>
                <td style="font-weight:600">
                  ${e.nombre}
                  ${conDispositivo.has(e.id) ? `<span style="margin-left:8px;font-size:11px;font-weight:600;color:#3A8C3E;white-space:nowrap">📱 Dispositivo registrado</span>` : ''}
                </td>
                <td>${e.puesto}</td>
                <td>
                  <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;${e.activo ? 'background:rgba(76,153,80,0.12);color:#3A8C3E' : 'background:rgba(184,92,42,0.1);color:var(--color-highlight)'}">
                    ${e.activo ? 'Activo' : 'Baja'}
                  </span>
                </td>
                <td style="text-align:right">
                  <div class="acciones-fila">
                    <button class="btn-accion" style="border:1px solid var(--color-border);font-size:11px;padding:4px 10px" onclick="mostrarFormEmpleado('${e.id}')">Editar</button>
                    ${e.activo
                      ? `<button class="btn-accion" style="border:1px solid var(--color-border);font-size:11px;padding:4px 10px" onclick="mostrarLinkAlta('${e.id}', '${e.nombre.replace(/'/g, "\\'")}')">Generar link de alta</button>
                         <button class="btn-accion btn-archivar" style="font-size:11px;padding:4px 10px" onclick="darDeBajaEmpleado('${e.id}')">Dar de baja</button>`
                      : `<button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 10px" onclick="reactivarEmpleado('${e.id}')">Reactivar</button>`}
                  </div>
                </td>
              </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `
}

function mostrarFormEmpleado(id = null) {
  const wrap = document.getElementById('personal-form-empleado-wrap')
  if (!wrap) return
  const empleado = id ? (window._personalEmpleados || []).find(e => e.id === id) : null

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
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn-accion btn-aprobar" onclick="guardarEmpleado(${empleado ? `'${empleado.id}'` : 'null'})">Guardar</button>
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="document.getElementById('personal-form-empleado-wrap').innerHTML=''">Cancelar</button>
      </div>
    </div>
  `
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

async function mostrarLinkAlta(id, nombre) {
  const wrap = document.getElementById('personal-link-wrap')
  if (!wrap) return
  const url = `${window.location.origin}/alta-dispositivo.html?id=${id}&tenant=${window._personalTenant}`

  wrap.innerHTML = `
    <div class="receta-detalle-card" style="margin-bottom:20px;text-align:center;max-width:340px">
      <h3 style="margin-bottom:4px">Link de alta — ${nombre}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:16px">Que ${nombre} escanee este código desde su celular.</p>
      <div id="personal-qr-canvas-wrap" style="display:flex;justify-content:center;margin-bottom:16px">
        <p style="color:var(--color-text-muted);font-size:13px">Generando QR...</p>
      </div>
      <p style="font-size:12px;color:var(--color-text-muted);word-break:break-all;background:var(--color-bg);border:1px solid var(--color-border);border-radius:6px;padding:8px">${url}</p>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:center">
        <button class="btn-accion btn-aprobar" onclick="_personalCopiarLink('${url}', this)">Copiar link</button>
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="document.getElementById('personal-link-wrap').innerHTML=''">Cerrar</button>
      </div>
    </div>
  `
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' })

  try {
    await _personalCargarQRLib()
    const canvasWrap = document.getElementById('personal-qr-canvas-wrap')
    if (!canvasWrap) return
    canvasWrap.innerHTML = _personalRenderQR(url, 5)
  } catch (e) {
    const canvasWrap = document.getElementById('personal-qr-canvas-wrap')
    if (canvasWrap) canvasWrap.innerHTML = `<p style="color:var(--color-highlight);font-size:13px">No se pudo generar el QR.</p>`
  }
}

function _personalCopiarLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    const original = btn.textContent
    btn.textContent = 'Copiado ✓'
    setTimeout(() => { btn.textContent = original }, 1500)
  }).catch(() => alert('No se pudo copiar. Copia el link manualmente.'))
}

// ══════════════════════════════════════════════════════════════════════════
// ── TAB: HORARIOS ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

// Default al abrir la vista: la próxima semana (lunes a domingo entrante),
// pensado para cargarse los viernes de la semana en curso. La navegación
// manual (‹ Semana anterior / Siguiente semana ›) parte de acá pero puede
// moverse a cualquier otra semana, incluida la actual.
function _personalProximaSemana() {
  const hoy = new Date()
  const day = hoy.getDay() || 7 // Lunes=1 ... Domingo=7
  const diasHastaProximoLunes = 8 - day
  const proximoLunes = new Date(hoy)
  proximoLunes.setDate(hoy.getDate() + diasHastaProximoLunes)
  return _personalFechasDesdeLunes(proximoLunes.toISOString().split('T')[0])
}

// Construye las 7 fechas (lunes a domingo) a partir de un lunes dado.
function _personalFechasDesdeLunes(lunesStr) {
  const lunes = new Date(lunesStr + 'T12:00:00')
  const fechas = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes)
    d.setDate(lunes.getDate() + i)
    fechas.push(d.toISOString().split('T')[0])
  }
  return fechas
}

// Mueve la semana mostrada 7 días atrás/adelante desde la que está en pantalla.
async function _personalCambiarSemanaHorarios(deltaDias) {
  const actual = window._personalHorariosFechas || _personalProximaSemana()
  const lunesActual = new Date(actual[0] + 'T12:00:00')
  lunesActual.setDate(lunesActual.getDate() + deltaDias)
  await renderPersonalHorarios(_personalFechasDesdeLunes(lunesActual.toISOString().split('T')[0]))
}

async function renderPersonalHorarios(fechasOverride) {
  const cont = document.getElementById('personal-tab-content')
  const tenant_id = window._personalTenant
  const fechas = fechasOverride || _personalProximaSemana()
  window._personalHorariosFechas = fechas

  const [{ data: empleados, error: errE }, { data: horarios, error: errH }] = await Promise.all([
    window._db.from('empleados').select('id, nombre').eq('tenant_id', tenant_id).eq('activo', true).order('nombre'),
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

  const lunes = fechas[0], domingo = fechas[6]
  const lunLabel = new Date(lunes + 'T12:00:00')
  const domLabel = new Date(domingo + 'T12:00:00')

  cont.innerHTML = `
    <div class="vista-header" style="margin-bottom:16px;flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="_personalCambiarSemanaHorarios(-7)">‹ Semana anterior</button>
        <h3 style="font-family:var(--font-brand);font-size:18px;margin:0">Semana del ${lunLabel.getDate()} al ${domLabel.getDate()} de ${PERSASIS_MESES_NOMBRES[domLabel.getMonth()]} ${domLabel.getFullYear()}</h3>
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="_personalCambiarSemanaHorarios(7)">Siguiente semana ›</button>
      </div>
      <button class="btn-accion btn-aprobar" onclick="guardarPersonalHorarios()">Guardar horarios</button>
    </div>
    <div id="personal-horarios-avisos"></div>
    <div class="tabla-wrapper card-surface">
      <table class="tabla" id="personal-horarios-tabla">
        <thead>
          <tr>
            <th>Empleado</th>
            ${fechas.map(f => {
              const d = new Date(f + 'T12:00:00')
              return `<th>${PERSONAL_DIAS_SEMANA[d.getDay() === 0 ? 6 : d.getDay() - 1]}<br><span style="font-weight:400;text-transform:none">${d.getDate()}</span></th>`
            }).join('')}
          </tr>
        </thead>
        <tbody>
          ${!empleados || !empleados.length
            ? `<tr><td colspan="8" style="text-align:center;color:var(--color-text-muted)">No hay empleados activos.</td></tr>`
            : empleados.map(e => `
              <tr>
                <td style="font-weight:600;white-space:nowrap">${e.nombre}</td>
                ${fechas.map(f => `
                  <td>
                    <select class="edit-select" style="max-width:none;width:100%" onchange="onChangePersonalTurno('${e.id}', '${f}', this.value)">
                      <option value="">—</option>
                      ${Object.entries(PERSONAL_TURNOS).map(([key, t]) => `
                        <option value="${key}" ${valores[e.id]?.[f] === key ? 'selected' : ''}>${t.label}</option>`).join('')}
                    </select>
                  </td>`).join('')}
              </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `

  renderPersonalAvisosDescanso()
}

function onChangePersonalTurno(idEmpleado, fecha, valor) {
  if (!window._personalHorariosValores[idEmpleado]) window._personalHorariosValores[idEmpleado] = {}
  if (valor) window._personalHorariosValores[idEmpleado][fecha] = valor
  else delete window._personalHorariosValores[idEmpleado][fecha]
  renderPersonalAvisosDescanso()
}

function renderPersonalAvisosDescanso() {
  const cont = document.getElementById('personal-horarios-avisos')
  if (!cont) return
  const empleados = window._personalEmpleadosActivos || []
  const valores = window._personalHorariosValores || {}

  const problemas = []
  empleados.forEach(e => {
    const dias = valores[e.id] || {}
    const descansos = Object.values(dias).filter(v => v === 'descanso').length
    if (descansos === 0) problemas.push(`${e.nombre}: sin día de descanso asignado`)
    else if (descansos > 1) problemas.push(`${e.nombre}: tiene ${descansos} días de descanso (debería ser 1)`)
  })

  if (!problemas.length) { cont.innerHTML = ''; return }

  cont.innerHTML = `
    <div class="banner-aviso" style="margin-bottom:16px">
      ⚠ Antes de guardar, revisa:
      <ul style="margin:6px 0 0 18px">
        ${problemas.map(p => `<li>${p}</li>`).join('')}
      </ul>
    </div>
  `
}

async function guardarPersonalHorarios() {
  const tenant_id = window._personalTenant
  const fechas    = window._personalHorariosFechas || []
  const empleados = window._personalEmpleadosActivos || []
  const valores   = window._personalHorariosValores || {}

  if (!empleados.length) return

  const rows = []
  empleados.forEach(e => {
    const dias = valores[e.id] || {}
    fechas.forEach(f => {
      const tipo = dias[f]
      if (!tipo) return
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

  const checadorUrl = `${window.location.origin}/checador.html?tenant=${tenant_id}`

  cont.innerHTML = `
    <div class="card-surface" style="padding:20px;margin-bottom:20px;display:flex;gap:20px;flex-wrap:wrap;align-items:center">
      <div id="personal-checador-qr" style="display:flex;justify-content:center">
        <p style="color:var(--color-text-muted);font-size:13px">Generando QR...</p>
      </div>
      <div style="flex:1;min-width:220px">
        <h3 style="margin-bottom:4px">QR fijo del checador</h3>
        <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:10px">El mismo para todos los empleados — imprímelo y pégalo en el negocio.</p>
        <p style="font-size:12px;color:var(--color-text-muted);word-break:break-all;background:var(--color-bg);border:1px solid var(--color-border);border-radius:6px;padding:8px;margin-bottom:10px">${checadorUrl}</p>
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="window.print()">Imprimir</button>
      </div>
    </div>

    <div id="persasis-filtro" style="margin-bottom:16px"></div>
    <div id="persasis-lista-wrap"></div>
  `

  renderPersAsisFiltro()
  renderPersAsisVista()

  try {
    await _personalCargarQRLib()
    const qrWrap = document.getElementById('personal-checador-qr')
    if (!qrWrap) return
    qrWrap.innerHTML = _personalRenderQR(checadorUrl, 4)
  } catch (e) {
    const qrWrap = document.getElementById('personal-checador-qr')
    if (qrWrap) qrWrap.innerHTML = `<p style="color:var(--color-highlight);font-size:13px">No se pudo generar el QR.</p>`
  }
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
