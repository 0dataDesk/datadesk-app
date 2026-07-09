// ── Vista: Consumo teórico ──────────────────────────────────────────────────────
// Mismo patrón de filtro jerárquico Todo/Mes/Semana que cierres.js (helpers copiados
// y renombrados con prefijo Consumo para no colisionar con los globals de cierres.js,
// ya que ambos scripts comparten el mismo scope global). El look del filtro reutiliza
// las clases .cierres-segmented ya existentes en styles.css.

const CONSUMO_MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const CONSUMO_MESES_CORTOS  = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

const CONSUMO_GRUPO_META = {
  'Carnes y Proteínas': { orden: 1, emoji: '🥩', color: '#B85C2A' },
  'Lácteos y Quesos':   { orden: 2, emoji: '🧀', color: '#6A9BB5' },
  'Verduras y Frescos': { orden: 3, emoji: '🥬', color: '#4A7A3A' },
  'Despensa':           { orden: 4, emoji: '🥫', color: '#C8892A' },
  'Subrecetas':         { orden: 5, emoji: '⚗️', color: '#8A5FB0' },
  'Bebidas':            { orden: 6, emoji: '🥤', color: '#3D9BA8' },
  'Desechables':        { orden: 7, emoji: '🗑️', color: '#9B7B6A' }
}
const CONSUMO_META_DEFAULT = { orden: 99, emoji: '📦', color: '#9B7B6A' }
const CONSUMO_SECCION_2_GRUPOS = ['Subrecetas', 'Bebidas', 'Desechables', 'Empaque y Desechables']

function _getLunesConsumo(fechaStr) {
  const d = new Date(fechaStr + 'T12:00:00')
  const day = d.getDay() || 7
  d.setDate(d.getDate() - (day - 1))
  return d.toISOString().split('T')[0]
}

function _semLabelConsumo(lunesStr) {
  const lun = new Date(lunesStr + 'T12:00:00')
  const dom = new Date(lun); dom.setDate(dom.getDate() + 6)
  const sufijo = dom.getMonth() !== lun.getMonth()
    ? `${CONSUMO_MESES_CORTOS[dom.getMonth()]}`
    : CONSUMO_MESES_CORTOS[lun.getMonth()]
  return `Semana del ${lun.getDate()} al ${dom.getDate()} ${sufijo}`
}

function _agruparConsumoPorMes(diasArr) {
  const porMes = {}
  diasArr.forEach(d => {
    const mes = d.fecha.slice(0, 7)
    if (!porMes[mes]) porMes[mes] = []
    porMes[mes].push(d)
  })
  const meses = Object.keys(porMes).sort().reverse()
  return { meses, porMes }
}

function _agruparConsumoPorSemana(diasArr) {
  const porSemana = {}
  diasArr.forEach(d => {
    const lunes = _getLunesConsumo(d.fecha)
    if (!porSemana[lunes]) porSemana[lunes] = []
    porSemana[lunes].push(d)
  })
  const semanas = Object.keys(porSemana).sort().reverse()
  return { semanas, porSemana }
}

function _consumoMesLabelDe(mes, soloUnAño) {
  const [year, month] = mes.split('-')
  return soloUnAño ? CONSUMO_MESES_NOMBRES[Number(month) - 1] : `${CONSUMO_MESES_NOMBRES[Number(month) - 1]} ${year}`
}

async function vistaConsumo() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando consumo...</p>`

  try {
    await window._db.auth.refreshSession()
    const tenant_id = await getTenantId()
    window._consumoTenant    = tenant_id
    window._consumoBuscador  = ''
    window._consumoDiaSel    = null

    content.innerHTML = `
      <div class="vista-header">
        <h2>🧮 Consumo</h2>
        <button id="btn-generar-consumo" class="btn-accion btn-aprobar" onclick="abrirModalGenerarConsumo()">Generar consumo teórico</button>
      </div>

      <div id="consumo-controles">
        <input type="text" id="consumo-buscador" placeholder="Buscar insumo..."
          style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-card);color:var(--color-text);font-size:14px;margin-bottom:12px"
          oninput="filtrarConsumoBuscador(this.value)">

        <div id="consumo-lista-wrap"></div>
      </div>

      <div id="consumo-detalle-wrap" style="display:none"></div>
    `

    await cargarConsumoData()

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

// ── Modal: Generar consumo teórico ──────────────────────────────────────────────
function abrirModalGenerarConsumo() {
  if (document.getElementById('consumo-modal-overlay')) return
  const hoy = new Date()
  const fmt = d => d.toISOString().slice(0, 10)

  const overlay = document.createElement('div')
  overlay.id = 'consumo-modal-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(43,26,15,0.45);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px'
  overlay.innerHTML = `
    <div class="card-surface" style="padding:24px;max-width:360px;width:100%">
      <h3 style="margin:0 0 4px">Generar consumo teórico</h3>
      <p style="font-size:13px;color:var(--color-text-muted);margin:0 0 16px">Elige el día a procesar.</p>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
          Fecha
          <input type="date" id="consumo-modal-fecha" value="${fmt(hoy)}"
            style="padding:8px 10px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-bg);color:var(--color-text)">
        </label>
      </div>
      <div id="consumo-modal-resultado" style="font-size:13px;margin-bottom:12px"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn-accion" style="border:1px solid var(--color-border);background:var(--color-secondary)" onclick="cerrarModalGenerarConsumo()">Cancelar</button>
        <button id="consumo-modal-confirmar" class="btn-accion btn-aprobar" onclick="confirmarGenerarConsumo()">Generar</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
}

function cerrarModalGenerarConsumo() {
  const overlay = document.getElementById('consumo-modal-overlay')
  if (overlay) overlay.remove()
}

async function confirmarGenerarConsumo() {
  const btn   = document.getElementById('consumo-modal-confirmar')
  const resEl = document.getElementById('consumo-modal-resultado')
  const fecha = document.getElementById('consumo-modal-fecha').value
  if (!fecha || !btn || !resEl) return

  const original = btn.textContent
  btn.disabled = true
  btn.textContent = 'Generando...'
  resEl.textContent = ''

  try {
    const tenant_id = window._consumoTenant || await getTenantId()
    const { data, error } = await window._db.rpc('fn_generar_consumo_rango', {
      p_tenant_id: tenant_id, p_desde: fecha, p_hasta: fecha
    })
    if (error) throw error

    const resultado  = Array.isArray(data) ? (data[0] || {}) : (data || {})
    const procesadas = Number(resultado.ventas_procesadas) || 0
    const filas       = Number(resultado.filas_generadas) || 0

    resEl.innerHTML = procesadas === 0
      ? `<span style="color:var(--color-text-muted)">0 ventas procesadas — ya estaba al día.</span>`
      : `<span style="color:#3A8C3E;font-weight:600">${procesadas} venta${procesadas !== 1 ? 's' : ''} procesada${procesadas !== 1 ? 's' : ''} · ${filas} fila${filas !== 1 ? 's' : ''} generada${filas !== 1 ? 's' : ''}.</span>`

    await cargarConsumoData()
    setTimeout(cerrarModalGenerarConsumo, 1400)
  } catch (err) {
    resEl.innerHTML = `<span style="color:var(--color-highlight)">Error: ${err.message}</span>`
    btn.disabled = false
    btn.textContent = original
  }
}

// ── Carga de datos ───────────────────────────────────────────────────────────────
async function cargarConsumoData() {
  const tenant_id = window._consumoTenant
  const wrap      = document.getElementById('consumo-lista-wrap')

  const PAGE_SIZE = 1000
  const filas     = []
  let error       = null
  for (let desde = 0; ; desde += PAGE_SIZE) {
    const hasta = desde + PAGE_SIZE - 1
    const { data: pagina, error: errPagina } = await window._db
      .from('consumo_teorico')
      .select('id_venta, id_producto, cantidad_consumida, costo_unitario_snap, fecha_venta')
      .eq('tenant_id', tenant_id)
      .range(desde, hasta)
    if (errPagina) { error = errPagina; break }
    filas.push(...(pagina || []))
    if (!pagina || pagina.length < PAGE_SIZE) break
  }

  if (error) {
    if (wrap) wrap.innerHTML = `<p style="color:var(--color-highlight)">Error: ${error.message}</p>`
    return
  }

  if (!filas || !filas.length) {
    window._consumoDiasData = []
    if (wrap) wrap.innerHTML = `<p style="color:var(--color-text-muted)">No hay consumo teórico registrado.</p>`
    return
  }

  const idsProducto = [...new Set(filas.map(f => f.id_producto))]
  const { data: productos } = await window._db
    .from('productos')
    .select('id_producto, producto, grupo, unidad_medida')
    .eq('tenant_id', tenant_id)
    .in('id_producto', idsProducto)
  const nombreMap = {}
  const grupoMap  = {}
  const unidadMap = {}
  ;(productos || []).forEach(p => {
    nombreMap[p.id_producto] = p.producto
    grupoMap[p.id_producto]  = p.grupo || 'Sin grupo'
    unidadMap[p.id_producto] = p.unidad_medida || ''
  })

  const porDia = {}
  filas.forEach(f => {
    const fecha = f.fecha_venta
    if (!porDia[fecha]) porDia[fecha] = { fecha, ventasSet: new Set(), productosMap: {} }
    porDia[fecha].ventasSet.add(f.id_venta)
    const idp = f.id_producto
    if (!porDia[fecha].productosMap[idp]) {
      porDia[fecha].productosMap[idp] = {
        id_producto: idp,
        nombre: nombreMap[idp] || idp,
        grupo:  grupoMap[idp] || 'Sin grupo',
        unidad: unidadMap[idp] || '',
        cantidad: 0,
        subtotal: 0
      }
    }
    const p     = porDia[fecha].productosMap[idp]
    const cant  = Number(f.cantidad_consumida) || 0
    const costo = Number(f.costo_unitario_snap) || 0
    p.cantidad += cant
    p.subtotal += cant * costo
  })

  window._consumoDiasData = Object.values(porDia).map(d => {
    const productosArr = Object.values(d.productosMap)
      .map(p => ({ ...p, costoUnitario: p.cantidad ? p.subtotal / p.cantidad : 0 }))
      .sort((a, b) => b.subtotal - a.subtotal)
    return {
      fecha:        d.fecha,
      numVentas:    d.ventasSet.size,
      numProductos: productosArr.length,
      costoTotal:   productosArr.reduce((s, p) => s + p.subtotal, 0),
      productos:    productosArr
    }
  }).sort((a, b) => b.fecha.localeCompare(a.fecha))

  renderConsumoVista()
}

function filtrarConsumoBuscador(val) {
  window._consumoBuscador = val
  renderConsumoVista()
}

// ── Lista agrupada mes → semana → día (cada día es un renglón, abre vista nueva) ─
function renderConsumoVista() {
  const listaEl = document.getElementById('consumo-lista-wrap')
  if (!listaEl) return

  const diasFiltrados = window._consumoDiasData || []
  const buscador = (window._consumoBuscador || '').trim().toLowerCase()

  const diasConFiltro = buscador
    ? diasFiltrados
        .map(d => {
          const productos = d.productos.filter(p => p.nombre.toLowerCase().includes(buscador))
          return { ...d, productos, numProductos: productos.length, costoTotal: productos.reduce((s, p) => s + p.subtotal, 0) }
        })
        .filter(d => d.productos.length > 0)
    : diasFiltrados

  if (diasConFiltro.length === 0) {
    listaEl.innerHTML = `<p style="color:var(--color-text-muted)">Sin consumo en este período${buscador ? ' para "' + buscador + '"' : ''}.</p>`
    return
  }

  const { meses, porMes } = _agruparConsumoPorMes(diasConFiltro)
  const añosDistintos = [...new Set(meses.map(m => m.split('-')[0]))]
  const soloUnAño = añosDistintos.length === 1

  let html = `<div class="card-surface" style="padding:16px 20px">`
  html += soloUnAño
    ? `<div style="font-size:12px;color:var(--color-text-muted);margin-bottom:8px">Consumo ${añosDistintos[0]}</div>`
    : ''

  meses.forEach((mes, mesIdx) => {
    const diasMes  = porMes[mes]
    const totMes   = diasMes.reduce((s, d) => s + d.costoTotal, 0)
    const mesLabel = _consumoMesLabelDe(mes, soloUnAño)
    const mesOpen  = mesIdx === 0 || !!buscador
    const mesId    = `consumo-mes-${mes}`

    const { semanas, porSemana } = _agruparConsumoPorSemana(diasMes)

    let semanasHtml = ''
    semanas.forEach((lunes, semIdx) => {
      const diasSem = porSemana[lunes]
      const totSem  = diasSem.reduce((s, d) => s + d.costoTotal, 0)
      const semOpen = (mesIdx === 0 && semIdx === 0) || !!buscador
      const semId   = `consumo-sem-${mes}-${lunes}`

      const diasHtml = diasSem.map(d => `
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:10px 12px 10px 32px;
            border-bottom:1px solid var(--color-border);cursor:pointer;font-size:13px"
          onclick="verDetalleConsumoDia('${d.fecha}')"
          onmouseenter="this.style.background='var(--color-secondary)'"
          onmouseleave="this.style.background=''">
          <span style="min-width:90px;font-weight:600">${d.fecha}</span>
          <span style="font-family:'Bebas Neue',sans-serif;font-size:19px;color:var(--color-primary)">$${formatNum(d.costoTotal)}</span>
          <span style="color:var(--color-text-muted)">${d.numProductos} producto${d.numProductos !== 1 ? 's' : ''}</span>
          <span style="color:var(--color-text-muted);margin-left:auto">${d.numVentas} venta${d.numVentas !== 1 ? 's' : ''}</span>
        </div>`).join('')

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
            <span>${_semLabelConsumo(lunes)}</span>
            <span style="color:var(--color-text-muted)">· ${diasSem.length} día${diasSem.length !== 1 ? 's' : ''}</span>
            <span style="font-weight:600;margin-left:auto">$${formatNum(totSem)}</span>
          </div>
          <div id="${semId}" style="display:${semOpen ? '' : 'none'}">
            ${diasHtml}
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
          <span style="color:var(--color-text-muted);font-size:13px">· ${diasMes.length} día${diasMes.length !== 1 ? 's' : ''}</span>
          <span style="font-weight:700;color:var(--color-primary);margin-left:auto">$${formatNum(totMes)}</span>
        </div>
        <div id="${mesId}" style="display:${mesOpen ? '' : 'none'}">
          ${semanasHtml}
        </div>
      </div>`
  })

  html += `</div>`

  listaEl.innerHTML = html
}

// ── Detalle de un día: vista nueva, con secciones por grupo (como Insumos) ──────
function verDetalleConsumoDia(fecha) {
  const controles   = document.getElementById('consumo-controles')
  const detalleWrap = document.getElementById('consumo-detalle-wrap')
  if (!controles || !detalleWrap) return

  window._consumoDiaSel = fecha
  controles.style.display   = 'none'
  detalleWrap.style.display = ''
  const btnGenerar = document.getElementById('btn-generar-consumo')
  if (btnGenerar) btnGenerar.style.display = 'none'

  const dia = (window._consumoDiasData || []).find(d => d.fecha === fecha)
  if (!dia) {
    detalleWrap.innerHTML = `<p style="color:var(--color-highlight)">No se encontró consumo para ${fecha}.</p>`
    return
  }

  const porGrupo = {}
  dia.productos.forEach(p => {
    const g = p.grupo || 'Sin grupo'
    if (!porGrupo[g]) porGrupo[g] = []
    porGrupo[g].push(p)
  })
  const nombresGrupos = Object.keys(porGrupo).sort((a, b) => {
    const ma = CONSUMO_GRUPO_META[a] || CONSUMO_META_DEFAULT
    const mb = CONSUMO_GRUPO_META[b] || CONSUMO_META_DEFAULT
    return ma.orden - mb.orden
  })

  const seccion1 = nombresGrupos.filter(g => !CONSUMO_SECCION_2_GRUPOS.includes(g))
  const seccion2 = nombresGrupos.filter(g => CONSUMO_SECCION_2_GRUPOS.includes(g))

  const badge = (monto, size) => {
    const fs = size || 12
    return `<span style="padding:2px 10px;border-radius:20px;font-size:${fs}px;font-weight:700;background:rgba(154,123,106,0.15);color:var(--color-text-muted)">$${formatNum(monto)}</span>`
  }

  const renderGrupo = (g) => {
    const prods = porGrupo[g]
    const meta  = CONSUMO_GRUPO_META[g] || CONSUMO_META_DEFAULT
    const subtotalGrupo = prods.reduce((s, p) => s + p.subtotal, 0)

    return `
      <div class="ic-grupo" style="border:1px solid var(--color-border);border-left:4px solid ${meta.color};border-radius:8px;margin-bottom:8px;overflow:hidden">
        <div class="ic-grupo-header"
          style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;background:var(--color-surface);user-select:none"
          onclick="this.parentElement.classList.toggle('open')">
          <span style="font-weight:600">${meta.emoji} ${g}</span>
          ${badge(subtotalGrupo)}
        </div>
        <div class="ic-grupo-body" style="display:none">
          <table class="tabla" style="margin:0;border-radius:0;border-top:1px solid var(--color-border)">
            <thead>
              <tr><th>Producto</th><th style="text-align:right">Cantidad</th><th>Unidad</th><th style="text-align:right">Costo unitario</th><th style="text-align:right">Subtotal</th></tr>
            </thead>
            <tbody>
              ${prods.map(p => `
                <tr>
                  <td>${p.nombre}</td>
                  <td style="text-align:right">${formatInt(p.cantidad)}</td>
                  <td style="color:var(--color-text-muted)">${p.unidad}</td>
                  <td style="text-align:right">$${formatNum(p.costoUnitario)}</td>
                  <td style="text-align:right;font-weight:600">$${formatNum(p.subtotal)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`
  }

  const sub1 = seccion1.reduce((s, g) => s + porGrupo[g].reduce((s2, p) => s2 + p.subtotal, 0), 0)
  const sub2 = seccion2.reduce((s, g) => s + porGrupo[g].reduce((s2, p) => s2 + p.subtotal, 0), 0)

  detalleWrap.innerHTML = `
    <style>
      .ic-grupo.open .ic-grupo-body { display:block !important }
      .ic-grupo-header:hover { opacity:.85 }
    </style>
    <div class="card-surface" style="padding:24px;margin-top:16px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <button class="btn-accion" style="border:1px solid var(--color-border);background:var(--color-secondary)" onclick="volverDeConsumoDetalle()">← Volver</button>
        <h3 style="margin:0">Consumo — ${fecha}</h3>
      </div>

      <div style="margin-bottom:20px">
        ${seccion1.map(renderGrupo).join('')}
        ${seccion1.length ? `<div style="display:flex;justify-content:flex-end;padding:6px 4px">Subtotal insumos ${badge(sub1)}</div>` : ''}
      </div>
      <div style="margin-bottom:12px">
        ${seccion2.map(renderGrupo).join('')}
        ${seccion2.length ? `<div style="display:flex;justify-content:flex-end;padding:6px 4px">Subtotal ${badge(sub2)}</div>` : ''}
      </div>
      ${(seccion1.length && seccion2.length) ? `<div style="display:flex;justify-content:flex-end;padding:10px 4px;border-top:1px solid var(--color-border);font-weight:700">Total ${badge(sub1 + sub2, 13)}</div>` : ''}
    </div>
  `
}

function volverDeConsumoDetalle() {
  const controles   = document.getElementById('consumo-controles')
  const detalleWrap = document.getElementById('consumo-detalle-wrap')
  if (controles)   controles.style.display   = ''
  if (detalleWrap) { detalleWrap.style.display = 'none'; detalleWrap.innerHTML = '' }
  const btnGenerar = document.getElementById('btn-generar-consumo')
  if (btnGenerar) btnGenerar.style.display = ''
  window._consumoDiaSel = null
}
