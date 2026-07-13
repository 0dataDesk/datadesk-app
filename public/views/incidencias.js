// ── Vista: Incidencias (producción de subreceta / merma) ────────────────────────
// Mismo patrón de filtro jerárquico Todo/Mes/Semana que cierres.js y consumo.js
// (helpers copiados y renombrados con prefijo Inc para no colisionar con los
// globals de esos otros scripts, ya que todos comparten el mismo scope global).

const INC_MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const INC_MESES_CORTOS  = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

// Metadata de grupo para el acordeón de insumos del paso 2 de Merma (mismo criterio
// que PR_GRUPO_META en productos.js, copiado en vez de reutilizado — mismo motivo
// que consumo.js: no acoplar este archivo a los globals de otro view file).
const INC_GRUPO_META = {
  'Carnes y Proteínas': { orden: 1, emoji: '🥩', color: '#B85C2A' },
  'Lácteos y Quesos':   { orden: 2, emoji: '🧀', color: '#6A9BB5' },
  'Verduras y Frescos': { orden: 3, emoji: '🥬', color: '#4A7A3A' },
  'Despensa':           { orden: 4, emoji: '🥫', color: '#C8892A' },
  'Subrecetas':         { orden: 5, emoji: '⚗️', color: '#8A5FB0' },
  'Bebidas':            { orden: 6, emoji: '🥤', color: '#3D9BA8' },
  'Desechables':        { orden: 7, emoji: '🗑️', color: '#9B7B6A' }
}
const INC_META_DEFAULT = { orden: 99, emoji: '📦', color: '#9B7B6A' }

// Justificaciones clásicas para merma — "Otro" habilita un campo libre obligatorio.
const INC_MERMA_JUSTIFICACIONES = [
  'Caducidad/vencimiento',
  'Error de manejo o manipulación',
  'Se cayó / se rompió',
  'Contaminación',
  'Error de recepción (llegó en mal estado)'
]

function _getLunesInc(fechaStr) {
  const d = new Date(fechaStr + 'T12:00:00')
  const day = d.getDay() || 7
  d.setDate(d.getDate() - (day - 1))
  return d.toISOString().split('T')[0]
}

function _semLabelInc(lunesStr) {
  const lun = new Date(lunesStr + 'T12:00:00')
  const dom = new Date(lun); dom.setDate(dom.getDate() + 6)
  const sufijo = dom.getMonth() !== lun.getMonth()
    ? `${INC_MESES_CORTOS[dom.getMonth()]}`
    : INC_MESES_CORTOS[lun.getMonth()]
  return `Semana del ${lun.getDate()} al ${dom.getDate()} ${sufijo}`
}

function _agruparIncPorMes(incArr) {
  const porMes = {}
  incArr.forEach(i => {
    const mes = i.fecha.slice(0, 7)
    if (!porMes[mes]) porMes[mes] = []
    porMes[mes].push(i)
  })
  const meses = Object.keys(porMes).sort().reverse()
  return { meses, porMes }
}

function _agruparIncPorSemana(incArr) {
  const porSemana = {}
  incArr.forEach(i => {
    const lunes = _getLunesInc(i.fecha)
    if (!porSemana[lunes]) porSemana[lunes] = []
    porSemana[lunes].push(i)
  })
  const semanas = Object.keys(porSemana).sort().reverse()
  return { semanas, porSemana }
}

function _incMesLabelDe(mes, soloUnAño) {
  const [year, month] = mes.split('-')
  return soloUnAño ? INC_MESES_NOMBRES[Number(month) - 1] : `${INC_MESES_NOMBRES[Number(month) - 1]} ${year}`
}

// ── Vista principal ───────────────────────────────────────────────────────────
async function vistaIncidencias() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando incidencias...</p>`

  try {
    await window._db.auth.refreshSession()
    const tenant_id = await getTenantId()

    window._incTenant  = tenant_id
    window._incBuscador = ''
    window._incNivel1    = 'Todo'
    window._incMesSel    = null
    window._incSemanaSel = null
    window._incSubrecetasCache = null
    window._incInsumosCache    = null

    content.innerHTML = `
      <div class="vista-header">
        <h2>⚠️ Incidencias</h2>
        <button class="btn-accion btn-aprobar" onclick="abrirWizardIncidencia()">+ Nueva incidencia</button>
      </div>

      <input type="text" id="inc-buscador" placeholder="Buscar insumo o subreceta..." class="filtro-search"
        style="width:100%;box-sizing:border-box;margin-bottom:12px" oninput="filtrarIncBuscador(this.value)">

      <div id="inc-filtro" style="margin-bottom:16px"></div>
      <div id="inc-lista-wrap"><p style="color:var(--color-text-muted)">Cargando incidencias...</p></div>
    `

    renderIncidenciasFiltro()
    await cargarIncidenciasData()

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

// ── Carga de datos (paginada de 1000 en 1000 — el default de PostgREST trunca en silencio) ──
async function cargarIncidenciasData() {
  const tenant_id = window._incTenant
  const wrap = document.getElementById('inc-lista-wrap')

  const PAGE_SIZE = 1000
  const filas = []
  let error = null
  for (let desde = 0; ; desde += PAGE_SIZE) {
    const hasta = desde + PAGE_SIZE - 1
    const { data: pagina, error: errPagina } = await window._db
      .from('incidencias')
      .select('id, tipo, id_producto, id_insumo_consumido, cantidad, cantidad_insumo_consumido, merma_adicional, descripcion, fecha, creado_por, created_at')
      .eq('tenant_id', tenant_id)
      .order('fecha', { ascending: false })
      .range(desde, hasta)
    if (errPagina) { error = errPagina; break }
    filas.push(...(pagina || []))
    if (!pagina || pagina.length < PAGE_SIZE) break
  }

  if (error) {
    if (wrap) wrap.innerHTML = `<p style="color:var(--color-highlight)">Error: ${error.message}</p>`
    return
  }

  if (!filas.length) {
    window._incData = []
    if (wrap) wrap.innerHTML = `<p style="color:var(--color-text-muted)">No hay incidencias registradas.</p>`
    return
  }

  const idsSubreceta = [...new Set(filas.filter(f => f.tipo === 'produccion_subreceta').map(f => f.id_producto).filter(Boolean))]
  const idsInsumo = [...new Set([
    ...filas.filter(f => f.tipo === 'merma').map(f => f.id_producto),
    ...filas.map(f => f.id_insumo_consumido)
  ].filter(Boolean))]

  const [{ data: subrecetas }, { data: insumos }] = await Promise.all([
    idsSubreceta.length
      ? window._db.from('catalogo_recetas').select('id_receta, nombre_platillo').eq('tenant_id', tenant_id).in('id_receta', idsSubreceta)
      : Promise.resolve({ data: [] }),
    idsInsumo.length
      ? window._db.from('productos').select('id_producto, producto, unidad_medida').eq('tenant_id', tenant_id).in('id_producto', idsInsumo)
      : Promise.resolve({ data: [] })
  ])

  const subrecetaMap = {}
  ;(subrecetas || []).forEach(s => { subrecetaMap[s.id_receta] = s.nombre_platillo })
  const insumoMap = {}
  ;(insumos || []).forEach(p => { insumoMap[p.id_producto] = { nombre: p.producto, unidad: p.unidad_medida || '' } })

  let nombresMap = {}
  try {
    const { data: users } = await window._db.rpc('get_usuarios_nombres')
    if (users) users.forEach(u => { if (u.email) nombresMap[u.email] = u.nombre_corto })
  } catch (e) {}
  const formatCreadoPor = (val) => {
    if (!val) return '—'
    if (val === 'operador') return 'Operador'
    return nombresMap[val] || val.split('@')[0]
  }

  window._incData = filas.map(f => {
    const esProduccion = f.tipo === 'produccion_subreceta'
    const nombrePrincipal = esProduccion
      ? (subrecetaMap[f.id_producto] || f.id_producto)
      : (insumoMap[f.id_producto]?.nombre || f.id_producto)
    const unidadPrincipal = esProduccion ? '' : (insumoMap[f.id_producto]?.unidad || '')
    const insumoConsumido = f.id_insumo_consumido ? insumoMap[f.id_insumo_consumido] : null
    return {
      id: f.id,
      tipo: f.tipo,
      fecha: f.fecha,
      created_at: f.created_at,
      nombre: nombrePrincipal,
      unidad: unidadPrincipal,
      cantidad: Number(f.cantidad) || 0,
      id_insumo_consumido: f.id_insumo_consumido,
      nombreInsumoConsumido: insumoConsumido?.nombre || f.id_insumo_consumido,
      unidadInsumoConsumido: insumoConsumido?.unidad || '',
      cantidad_insumo_consumido: f.cantidad_insumo_consumido != null ? Number(f.cantidad_insumo_consumido) : null,
      merma_adicional: f.merma_adicional != null ? Number(f.merma_adicional) : null,
      descripcion: f.descripcion || '',
      creadoPorLabel: formatCreadoPor(f.creado_por)
    }
  }).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.created_at || '').localeCompare(a.created_at || ''))

  renderIncidenciasVista()
}

function filtrarIncBuscador(val) {
  window._incBuscador = val
  renderIncidenciasVista()
}

// ── Filtro jerárquico Todo/Mes/Semana ────────────────────────────────────────
function _filtrarIncPorPeriodo(lista) {
  const nivel1 = window._incNivel1 || 'Todo'
  if (nivel1 === 'Todo') return lista
  if (nivel1 === 'Mes') {
    if (!window._incMesSel) return lista
    return lista.filter(i => i.fecha.slice(0, 7) === window._incMesSel)
  }
  if (nivel1 === 'Semana') {
    if (!window._incMesSel) return lista
    const delMes = lista.filter(i => i.fecha.slice(0, 7) === window._incMesSel)
    if (!window._incSemanaSel) return delMes
    return delMes.filter(i => _getLunesInc(i.fecha) === window._incSemanaSel)
  }
  return lista
}

function renderIncidenciasFiltro() {
  const cont = document.getElementById('inc-filtro')
  if (!cont) return
  const todos = window._incData || []
  const { meses, porMes } = _agruparIncPorMes(todos)
  const añosDistintos = [...new Set(meses.map(m => m.split('-')[0]))]
  const soloUnAño = añosDistintos.length === 1
  const nivel1 = window._incNivel1 || 'Todo'

  let html = `
    <div class="cierres-segmented">
      ${['Todo', 'Mes', 'Semana'].map(p => `
        <button class="btn-periodo${nivel1 === p ? ' active' : ''}" onclick="setIncNivel1('${p}')">${p}</button>`).join('')}
    </div>`

  if (nivel1 === 'Mes' || nivel1 === 'Semana') {
    html += `
    <div class="cierres-segmented cierres-segmented-sub" style="margin-top:10px">
      ${meses.map(mes => `
        <button class="btn-periodo${window._incMesSel === mes ? ' active' : ''}" onclick="setIncMes('${mes}')">${_incMesLabelDe(mes, soloUnAño)}</button>`).join('')}
    </div>`
  }

  if (nivel1 === 'Semana' && window._incMesSel) {
    const { semanas } = _agruparIncPorSemana(porMes[window._incMesSel] || [])
    html += `
    <div class="cierres-segmented cierres-segmented-sub" style="margin-top:8px">
      ${semanas.map(lunes => `
        <button class="btn-periodo${window._incSemanaSel === lunes ? ' active' : ''}" onclick="setIncSemana('${lunes}')">${_semLabelInc(lunes)}</button>`).join('')}
    </div>`
  }

  cont.innerHTML = html
}

function setIncNivel1(nivel) {
  window._incNivel1    = nivel
  window._incMesSel    = null
  window._incSemanaSel = null
  renderIncidenciasFiltro()
  renderIncidenciasVista()
}

function setIncMes(mes) {
  window._incMesSel    = mes
  window._incSemanaSel = null
  renderIncidenciasFiltro()
  renderIncidenciasVista()
}

function setIncSemana(lunes) {
  window._incSemanaSel = lunes
  renderIncidenciasFiltro()
  renderIncidenciasVista()
}

// ── Fila de una incidencia ────────────────────────────────────────────────────
function _incFilaHtml(i) {
  const esProduccion = i.tipo === 'produccion_subreceta'
  const badge = esProduccion
    ? `<span style="padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;background:rgba(58,140,62,0.12);color:#3A8C3E;white-space:nowrap">🏭 Producción</span>`
    : `<span style="padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;background:rgba(184,92,42,0.12);color:#B85C2A;white-space:nowrap">🗑️ Merma</span>`

  let detalle
  if (esProduccion) {
    const partes = [`${formatNum(i.cantidad)} producida${i.cantidad !== 1 ? 's' : ''}`]
    if (i.id_insumo_consumido) {
      partes.push(`Insumo: ${i.nombreInsumoConsumido} × ${formatNum(i.cantidad_insumo_consumido)}${i.unidadInsumoConsumido ? ' ' + i.unidadInsumoConsumido : ''}`)
    }
    if (i.merma_adicional) {
      partes.push(`Merma adicional: ${formatNum(i.merma_adicional)}`)
    }
    detalle = partes.join(' · ')
  } else {
    const partes = [`${formatNum(i.cantidad)}${i.unidad ? ' ' + i.unidad : ''} perdidos`]
    if (i.descripcion) partes.push(i.descripcion)
    detalle = partes.join(' · ')
  }

  return `
    <div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;padding:10px 12px 10px 32px;border-bottom:1px solid var(--color-border);font-size:13px">
      <span style="min-width:90px;font-weight:600">${i.fecha}</span>
      ${badge}
      <span style="flex:1;min-width:180px">
        <div style="font-weight:600">${i.nombre}</div>
        <div style="color:var(--color-text-muted);font-size:12px">${detalle}</div>
      </span>
      <span style="color:var(--color-text-muted);font-size:11px;margin-left:auto;white-space:nowrap">${i.creadoPorLabel}</span>
    </div>`
}

// ── Lista agrupada mes → semana ───────────────────────────────────────────────
function renderIncidenciasVista() {
  const listaEl = document.getElementById('inc-lista-wrap')
  if (!listaEl) return

  const buscador = (window._incBuscador || '').trim().toLowerCase()
  let filtrados = _filtrarIncPorPeriodo(window._incData || [])
  if (buscador) {
    filtrados = filtrados.filter(i =>
      i.nombre.toLowerCase().includes(buscador) ||
      (i.nombreInsumoConsumido || '').toLowerCase().includes(buscador)
    )
  }

  if (!filtrados.length) {
    listaEl.innerHTML = `<p style="color:var(--color-text-muted)">Sin incidencias en este período${buscador ? ' para "' + buscador + '"' : ''}.</p>`
    return
  }

  const { meses, porMes } = _agruparIncPorMes(filtrados)
  const añosDistintos = [...new Set(meses.map(m => m.split('-')[0]))]
  const soloUnAño = añosDistintos.length === 1

  let html = `<div class="card-surface" style="padding:16px 20px">`
  html += soloUnAño
    ? `<div style="font-size:12px;color:var(--color-text-muted);margin-bottom:8px">Incidencias ${añosDistintos[0]}</div>`
    : ''

  meses.forEach((mes, mesIdx) => {
    const incMes   = porMes[mes]
    const mesLabel = _incMesLabelDe(mes, soloUnAño)
    const mesOpen  = mesIdx === 0 || !!buscador
    const mesId    = `inc-mes-${mes}`

    const { semanas, porSemana } = _agruparIncPorSemana(incMes)

    let semanasHtml = ''
    semanas.forEach((lunes, semIdx) => {
      const incSem  = porSemana[lunes]
      const semOpen = (mesIdx === 0 && semIdx === 0) || !!buscador
      const semId   = `inc-sem-${mes}-${lunes}`

      const filasHtml = incSem.map(i => _incFilaHtml(i)).join('')

      semanasHtml += `
        <div style="margin-left:16px">
          <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;
              font-size:13px;border-bottom:1px solid var(--color-border)"
            onclick="(function(el){
              const b=document.getElementById('${semId}');
              const open=b.style.display!=='none';
              b.style.display=open?'none':'';
              el.querySelector('.sem-chev').textContent=open?'▶':'▼';
            })(this)">
            <span class="sem-chev" style="color:var(--color-text-muted);font-size:11px">${semOpen ? '▼' : '▶'}</span>
            <span>${_semLabelInc(lunes)}</span>
            <span style="color:var(--color-text-muted)">· ${incSem.length} incidencia${incSem.length !== 1 ? 's' : ''}</span>
          </div>
          <div id="${semId}" style="display:${semOpen ? '' : 'none'}">
            ${filasHtml}
          </div>
        </div>`
    })

    html += `
      <div style="margin-bottom:8px;border:1px solid var(--color-border);border-radius:8px;overflow:hidden">
        <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer;
            background:var(--color-secondary)"
          onclick="(function(el){
            const b=document.getElementById('${mesId}');
            const open=b.style.display!=='none';
            b.style.display=open?'none':'';
            el.querySelector('.mes-chev').textContent=open?'▶':'▼';
          })(this)">
          <span class="mes-chev" style="color:var(--color-text-muted);font-size:12px">${mesOpen ? '▼' : '▶'}</span>
          <strong style="font-size:14px">${mesLabel}</strong>
          <span style="color:var(--color-text-muted);font-size:13px">· ${incMes.length} incidencia${incMes.length !== 1 ? 's' : ''}</span>
        </div>
        <div id="${mesId}" style="display:${mesOpen ? '' : 'none'}">
          ${semanasHtml}
        </div>
      </div>`
  })

  html += `</div>`
  listaEl.innerHTML = html
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Herramienta de captura: wizard de 3 pasos ────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function abrirWizardIncidencia() {
  window._incWizard = { step: 1, gen: 0, tipo: null, subrecetaSel: null, insumoSel: null, buscar2: '' }
  _incRenderWizard()
}

function cerrarWizardIncidencia() {
  const overlay = document.getElementById('inc-wizard-overlay')
  if (overlay) overlay.remove()
  window._incWizard = null
}

function _incRenderWizard() {
  const w = window._incWizard
  if (!w) return

  let overlay = document.getElementById('inc-wizard-overlay')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = 'inc-wizard-overlay'
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(43,26,15,0.45);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px'
    document.body.appendChild(overlay)
  }

  overlay.innerHTML = `
    <div class="card-surface" style="padding:24px;max-width:420px;width:100%;max-height:90vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <h3 style="margin:0">Nueva incidencia</h3>
        <button class="btn-accion" style="border:1px solid var(--color-border);background:var(--color-secondary);padding:4px 10px" onclick="cerrarWizardIncidencia()">✕</button>
      </div>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0 0 16px">Paso ${w.step} de 3</p>
      <div id="inc-wizard-body"></div>
    </div>
  `

  const body = document.getElementById('inc-wizard-body')
  if (w.step === 1) _incRenderPaso1(body)
  if (w.step === 2) _incRenderPaso2(body)
  if (w.step === 3) _incRenderPaso3(body)
}

function _incIrPaso(n) {
  const w = window._incWizard
  if (!w) return
  w.step = n
  _incRenderWizard()
}

// ── Paso 1 — ¿Qué tipo de incidencia? ────────────────────────────────────────
function _incRenderPaso1(body) {
  if (!body) return
  body.innerHTML = `
    <p style="font-size:13px;font-weight:600;margin:0 0 12px">¿Qué tipo de incidencia?</p>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button class="btn-accion" style="text-align:left;padding:16px;border:1px solid var(--color-border);background:var(--color-secondary)" onclick="_incElegirTipo('produccion_subreceta')">
        🏭 <strong>Producción de subreceta</strong><br>
        <span style="font-size:12px;color:var(--color-text-muted)">Se preparó una tanda de una subreceta</span>
      </button>
      <button class="btn-accion" style="text-align:left;padding:16px;border:1px solid var(--color-border);background:var(--color-secondary)" onclick="_incElegirTipo('merma')">
        🗑️ <strong>Merma</strong><br>
        <span style="font-size:12px;color:var(--color-text-muted)">Se perdió o desperdició un insumo</span>
      </button>
    </div>
  `
}

async function _incElegirTipo(tipo) {
  const w = window._incWizard
  if (!w) return
  w.tipo   = tipo
  w.step   = 2
  w.buscar2 = ''
  w.cargado2 = false
  w.errorPaso2 = null
  const miGen = (w.gen = (w.gen || 0) + 1)
  _incRenderWizard()

  const tenant_id = await getTenantId()
  if (window._incWizard !== w || w.gen !== miGen) return // el usuario navegó fuera mientras cargaba

  try {
    if (tipo === 'produccion_subreceta' && !window._incSubrecetasCache) {
      const { data, error } = await window._db
        .from('catalogo_recetas')
        .select('id_receta, nombre_platillo')
        .eq('tenant_id', tenant_id)
        .eq('categoria', 'Subrecetas')
        .eq('activo', true)
        .order('nombre_platillo')
      if (error) throw error
      window._incSubrecetasCache = data || []
    }
    if (tipo === 'merma' && !window._incInsumosCache) {
      const { data, error } = await window._db
        .from('productos')
        .select('id_producto, producto, unidad_medida, grupo')
        .eq('tenant_id', tenant_id)
        .eq('tipo', 'Insumo')
        .eq('activo', true)
        .order('producto')
      if (error) throw error
      window._incInsumosCache = data || []
    }
  } catch (err) {
    if (window._incWizard === w && w.gen === miGen) {
      w.errorPaso2 = err.message
      _incRenderWizard()
    }
    return
  }

  if (window._incWizard !== w || w.gen !== miGen) return
  w.cargado2 = true
  _incRenderWizard()
}

// ── Paso 2 — selección de subreceta o insumo ─────────────────────────────────
function _incRenderPaso2(body) {
  const w = window._incWizard
  if (!body || !w) return

  if (w.errorPaso2) {
    body.innerHTML = `<p style="color:var(--color-highlight)">Error: ${w.errorPaso2}</p>
      <button class="btn-accion" style="border:1px solid var(--color-border);background:var(--color-secondary);margin-top:12px" onclick="_incIrPaso(1)">← Atrás</button>`
    return
  }
  if (!w.cargado2) {
    body.innerHTML = `<p style="color:var(--color-text-muted)">Cargando opciones...</p>`
    return
  }

  const esProduccion = w.tipo === 'produccion_subreceta'
  const buscar = (w.buscar2 || '').toLowerCase()
  const idSel = esProduccion ? w.subrecetaSel?.id : w.insumoSel?.id
  const nombreSel = esProduccion ? w.subrecetaSel?.nombre : w.insumoSel?.nombre

  // Confirmación fija de selección — antes, al elegir de la lista, el re-render
  // hacía scroll al inicio y ocultaba la fila elegida (parecía que no pasó nada).
  // Este bloque queda visible arriba, sin necesidad de scrollear a buscar la fila.
  const seleccionadoHtml = idSel
    ? `<div style="padding:10px 12px;border-radius:8px;background:rgba(58,140,62,0.1);border:1px solid rgba(58,140,62,0.3);color:#3A8C3E;font-size:13px;font-weight:600;margin-bottom:10px">
        ✓ Seleccionado: ${nombreSel}
      </div>`
    : ''

  let listaHtml
  let agrupado = false

  if (esProduccion) {
    const opciones = window._incSubrecetasCache || []
    const filtradas = buscar
      ? opciones.filter(o => o.nombre_platillo.toLowerCase().includes(buscar))
      : opciones
    listaHtml = filtradas.length
      ? filtradas.map(o => _incFilaOpcionHtml(o.id_receta, o.nombre_platillo, idSel)).join('')
      : `<p style="padding:12px;color:var(--color-text-muted);font-size:13px">Sin resultados.</p>`
  } else {
    // MERMA — acordeón por grupo (mismo patrón que productos.js), con buscador
    // que cruza todos los grupos a la vez en vez de listar insumos sin agrupar.
    const opciones = window._incInsumosCache || []
    const filtradas = buscar
      ? opciones.filter(o => o.producto.toLowerCase().includes(buscar))
      : opciones

    if (buscar) {
      listaHtml = filtradas.length
        ? filtradas.map(o => _incFilaOpcionHtml(o.id_producto, o.producto, idSel)).join('')
        : `<p style="padding:12px;color:var(--color-text-muted);font-size:13px">Sin resultados.</p>`
    } else {
      agrupado = true
      const porGrupo = {}
      filtradas.forEach(o => {
        const g = o.grupo || 'Sin grupo'
        if (!porGrupo[g]) porGrupo[g] = []
        porGrupo[g].push(o)
      })
      const grupos = Object.keys(porGrupo).sort((a, b) => {
        const ma = INC_GRUPO_META[a] || INC_META_DEFAULT
        const mb = INC_GRUPO_META[b] || INC_META_DEFAULT
        return ma.orden - mb.orden
      })
      listaHtml = grupos.length
        ? grupos.map(g => {
            const meta  = INC_GRUPO_META[g] || INC_META_DEFAULT
            const prods = porGrupo[g]
            const contieneSel = !!idSel && prods.some(o => o.id_producto === idSel)
            const gid = `inc-grupo-${g.replace(/[^a-zA-Z0-9]/g, '-')}`
            return `
              <div style="border:1px solid var(--color-border);border-left:4px solid ${meta.color};border-radius:8px;margin-bottom:6px;overflow:hidden">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;cursor:pointer;background:var(--color-secondary);user-select:none"
                  onclick="(function(el){
                    const b=document.getElementById('${gid}');
                    const open=b.style.display!=='none';
                    b.style.display=open?'none':'';
                    el.querySelector('.inc-grupo-chev').textContent=open?'▶':'▼';
                  })(this)">
                  <span style="font-size:13px;font-weight:600">${meta.emoji} ${g}</span>
                  <span style="display:flex;align-items:center;gap:6px">
                    <span style="font-size:11px;color:var(--color-text-muted)">${prods.length}</span>
                    <span class="inc-grupo-chev" style="font-size:11px;color:var(--color-text-muted)">${contieneSel ? '▼' : '▶'}</span>
                  </span>
                </div>
                <div id="${gid}" style="display:${contieneSel ? '' : 'none'}">
                  ${prods.map(o => _incFilaOpcionHtml(o.id_producto, o.producto, idSel)).join('')}
                </div>
              </div>`
          }).join('')
        : `<p style="padding:12px;color:var(--color-text-muted);font-size:13px">Sin resultados.</p>`
    }
  }

  body.innerHTML = `
    <p style="font-size:13px;font-weight:600;margin:0 0 8px">${esProduccion ? '¿Qué subreceta se preparó?' : '¿Qué insumo se perdió?'}</p>
    ${seleccionadoHtml}
    <input type="text" id="inc-paso2-buscar" class="filtro-search" style="width:100%;box-sizing:border-box"
      placeholder="Buscar..." value="${(w.buscar2 || '').replace(/"/g, '&quot;')}" oninput="_incFiltrarPaso2(this.value)">
    <div style="max-height:320px;overflow-y:auto;margin-top:8px;${agrupado ? '' : 'border:1px solid var(--color-border);border-radius:8px'}">
      ${listaHtml}
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:16px">
      <button class="btn-accion" style="border:1px solid var(--color-border);background:var(--color-secondary)" onclick="_incIrPaso(1)">← Atrás</button>
      <button class="btn-accion btn-aprobar" ${idSel ? '' : 'disabled'} onclick="_incIrPaso3()">Siguiente →</button>
    </div>
  `
}

function _incFilaOpcionHtml(id, nombre, idSel) {
  const activo = idSel === id
  return `<div style="padding:10px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--color-border);${activo ? 'background:var(--color-secondary);font-weight:600' : ''}"
    onclick="_incSeleccionarOpcion2('${id.replace(/'/g, "\\'")}')">${nombre}</div>`
}

function _incFiltrarPaso2(val) {
  const w = window._incWizard
  if (!w) return
  w.buscar2 = val
  _incRenderPaso2(document.getElementById('inc-wizard-body'))
}

function _incSeleccionarOpcion2(id) {
  const w = window._incWizard
  if (!w) return
  if (w.tipo === 'produccion_subreceta') {
    const obj = (window._incSubrecetasCache || []).find(o => o.id_receta === id)
    w.subrecetaSel = obj ? { id: obj.id_receta, nombre: obj.nombre_platillo } : null
  } else {
    const obj = (window._incInsumosCache || []).find(o => o.id_producto === id)
    w.insumoSel = obj ? { id: obj.id_producto, nombre: obj.producto, unidad: obj.unidad_medida || '' } : null
  }
  _incRenderPaso2(document.getElementById('inc-wizard-body'))
}

// ── Paso 3 — cantidades (la lógica se bifurca dentro de "Producción") ────────
async function _incIrPaso3() {
  const w = window._incWizard
  if (!w) return
  w.step = 3
  w.cargado3 = false
  w.errorPaso3 = null
  const miGen = (w.gen = (w.gen || 0) + 1)
  _incRenderWizard()

  if (w.tipo !== 'produccion_subreceta') {
    // Merma: no hace falta ningún fetch extra, la unidad ya viene del insumo seleccionado en el paso 2.
    w.cargado3 = true
    _incRenderWizard()
    return
  }

  try {
    const tenant_id = await getTenantId()
    if (window._incWizard !== w || w.gen !== miGen) return

    // Contar EN VIVO cuántas filas activas tiene esta subreceta en receta_ingredientes —
    // nunca hardcodear qué subreceta tiene 1 insumo vs varios.
    const { data: ingredientes, error } = await window._db
      .from('receta_ingredientes')
      .select('id_producto, producto')
      .eq('tenant_id', tenant_id)
      .eq('id_receta', w.subrecetaSel.id)
      .neq('activo', false)
    if (error) throw error
    if (window._incWizard !== w || w.gen !== miGen) return

    w.insumoUnico = (ingredientes && ingredientes.length === 1) ? ingredientes[0] : null
    w.insumoUnicoUnidad = ''

    if (w.insumoUnico) {
      const { data: prodInfo } = await window._db
        .from('productos')
        .select('unidad_medida')
        .eq('tenant_id', tenant_id)
        .eq('id_producto', w.insumoUnico.id_producto)
        .maybeSingle()
      if (window._incWizard !== w || w.gen !== miGen) return
      w.insumoUnicoUnidad = prodInfo?.unidad_medida || ''
    }

    w.cargado3 = true
    _incRenderWizard()
  } catch (err) {
    if (window._incWizard === w && w.gen === miGen) {
      w.errorPaso3 = err.message
      _incRenderWizard()
    }
  }
}

function _incRenderPaso3(body) {
  const w = window._incWizard
  if (!body || !w) return

  if (w.errorPaso3) {
    body.innerHTML = `<p style="color:var(--color-highlight)">Error: ${w.errorPaso3}</p>
      <button class="btn-accion" style="border:1px solid var(--color-border);background:var(--color-secondary);margin-top:12px" onclick="_incIrPaso(2)">← Atrás</button>`
    return
  }
  if (!w.cargado3) {
    body.innerHTML = `<p style="color:var(--color-text-muted)">Cargando...</p>`
    return
  }

  const campoNum = (id, label, requerido, ayuda) => `
    <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
      ${label}${requerido ? ' *' : ' (opcional)'}
      <input type="number" id="${id}" min="0" step="any" class="filtro-search" style="width:100%;box-sizing:border-box">
      ${ayuda ? `<span style="font-size:11px;font-weight:400;color:var(--color-text-muted)">${ayuda}</span>` : ''}
    </label>`

  if (w.tipo === 'produccion_subreceta') {
    const esUnico = !!w.insumoUnico
    body.innerHTML = `
      <p style="font-size:13px;font-weight:600;margin:0 0 4px">${w.subrecetaSel.nombre}</p>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0 0 16px">
        ${esUnico
          ? 'Esta subreceta usa un único insumo base — ayúdanos a afinar su rendimiento capturando también el insumo consumido.'
          : 'Esta subreceta ya tiene receta fija con rendimiento definido — solo se necesita trazabilidad de cuánto se produjo.'}
      </p>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${campoNum('inc-cant-producida', 'Cantidad producida', true, 'Lo que realmente quedó disponible para usar, ya neto de cualquier accidente.')}
        ${esUnico ? campoNum('inc-cant-insumo', `Cantidad de insumo consumido (${w.insumoUnico.producto}${w.insumoUnicoUnidad ? ' — ' + w.insumoUnicoUnidad : ''})`, true, 'Sirve para ir afinando con el tiempo el rendimiento real de esta subreceta.') : ''}
        ${campoNum('inc-merma-adicional', 'Merma adicional', false, 'Solo para accidentes (se quemó, se tiró, se contaminó) aparte de la merma normal del proceso. No afecta el consumo de insumos — es solo registro.')}
      </div>
      <div id="inc-guardar-error" style="color:var(--color-highlight);font-size:13px;margin-top:10px"></div>
      <div style="display:flex;justify-content:space-between;margin-top:16px">
        <button class="btn-accion" style="border:1px solid var(--color-border);background:var(--color-secondary)" onclick="_incIrPaso(2)">← Atrás</button>
        <button id="inc-btn-guardar" class="btn-accion btn-aprobar" onclick="guardarIncidencia()">Guardar</button>
      </div>
    `
  } else {
    body.innerHTML = `
      <p style="font-size:13px;font-weight:600;margin:0 0 4px">${w.insumoSel.nombre}</p>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0 0 16px">Registrar la merma de este insumo.</p>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${campoNum('inc-cant-perdida', `Cantidad perdida${w.insumoSel.unidad ? ' (' + w.insumoSel.unidad + ')' : ''}`, true)}
        <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
          Justificación *
          <select id="inc-justificacion" class="filtro-select" style="width:100%;box-sizing:border-box" onchange="_incToggleJustifOtro(this.value)">
            <option value="">— Selecciona una —</option>
            ${INC_MERMA_JUSTIFICACIONES.map(j => `<option value="${j}">${j}</option>`).join('')}
            <option value="OTRO">Otro (especificar)</option>
          </select>
        </label>
        <label id="inc-justif-otro-wrap" style="display:none;flex-direction:column;gap:4px;font-size:13px">
          Especifica la justificación *
          <input type="text" id="inc-justificacion-otro" class="filtro-search" style="width:100%;box-sizing:border-box" placeholder="Describe qué pasó">
        </label>
      </div>
      <div id="inc-guardar-error" style="color:var(--color-highlight);font-size:13px;margin-top:10px"></div>
      <div style="display:flex;justify-content:space-between;margin-top:16px">
        <button class="btn-accion" style="border:1px solid var(--color-border);background:var(--color-secondary)" onclick="_incIrPaso(2)">← Atrás</button>
        <button id="inc-btn-guardar" class="btn-accion btn-aprobar" onclick="guardarIncidencia()">Guardar</button>
      </div>
    `
  }
}

function _incToggleJustifOtro(val) {
  const wrap = document.getElementById('inc-justif-otro-wrap')
  if (!wrap) return
  wrap.style.display = val === 'OTRO' ? 'flex' : 'none'
}

// ── Guardar ───────────────────────────────────────────────────────────────────
async function guardarIncidencia() {
  const w = window._incWizard
  if (!w) return
  const btn   = document.getElementById('inc-btn-guardar')
  const errEl = document.getElementById('inc-guardar-error')
  if (errEl) errEl.textContent = ''

  let payload = null

  if (w.tipo === 'produccion_subreceta') {
    const cantProducida = parseFloat(document.getElementById('inc-cant-producida')?.value)
    if (!cantProducida || cantProducida <= 0) {
      if (errEl) errEl.textContent = 'Captura la cantidad producida.'
      return
    }

    let idInsumoConsumido = null, cantInsumoConsumido = null
    if (w.insumoUnico) {
      cantInsumoConsumido = parseFloat(document.getElementById('inc-cant-insumo')?.value)
      if (!cantInsumoConsumido || cantInsumoConsumido <= 0) {
        if (errEl) errEl.textContent = 'Captura la cantidad de insumo consumido.'
        return
      }
      idInsumoConsumido = w.insumoUnico.id_producto
    }

    const mermaRaw = document.getElementById('inc-merma-adicional')?.value
    const merma = mermaRaw ? parseFloat(mermaRaw) : null

    payload = {
      tipo: 'produccion_subreceta',
      id_producto: w.subrecetaSel.id,
      cantidad: cantProducida,
      descripcion: null,
      id_insumo_consumido: idInsumoConsumido,
      cantidad_insumo_consumido: cantInsumoConsumido,
      merma_adicional: (merma && merma > 0) ? merma : null
    }
  } else {
    const cantPerdida = parseFloat(document.getElementById('inc-cant-perdida')?.value)
    if (!cantPerdida || cantPerdida <= 0) {
      if (errEl) errEl.textContent = 'Captura la cantidad perdida.'
      return
    }

    const justificacion = document.getElementById('inc-justificacion')?.value
    if (!justificacion) {
      if (errEl) errEl.textContent = 'Selecciona una justificación.'
      return
    }
    let descripcion
    if (justificacion === 'OTRO') {
      descripcion = document.getElementById('inc-justificacion-otro')?.value.trim()
      if (!descripcion) {
        if (errEl) errEl.textContent = 'Escribe la justificación.'
        return
      }
    } else {
      descripcion = justificacion
    }

    payload = {
      tipo: 'merma',
      id_producto: w.insumoSel.id,
      cantidad: cantPerdida,
      descripcion,
      id_insumo_consumido: null,
      cantidad_insumo_consumido: null,
      merma_adicional: null
    }
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...' }

  try {
    const tenant_id = await getTenantId()
    const { error } = await window._db.from('incidencias').insert({
      tenant_id,
      tipo: payload.tipo,
      id_producto: payload.id_producto,
      cantidad: payload.cantidad,
      descripcion: payload.descripcion,
      id_insumo_consumido: payload.id_insumo_consumido,
      cantidad_insumo_consumido: payload.cantidad_insumo_consumido,
      merma_adicional: payload.merma_adicional,
      fecha: new Date().toISOString().split('T')[0],
      creado_por: window._email || null
    })
    if (error) throw error

    cerrarWizardIncidencia()
    await cargarIncidenciasData()
  } catch (err) {
    if (errEl) errEl.textContent = 'Error: ' + err.message
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar' }
  }
}
