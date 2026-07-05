// ── Vista: Consumo teórico ──────────────────────────────────────────────────────
// Mismo patrón de filtro jerárquico Todo/Mes/Semana que cierres.js (helpers copiados
// y renombrados con prefijo Consumo para no colisionar con los globals de cierres.js,
// ya que ambos scripts comparten el mismo scope global).

const CONSUMO_MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const CONSUMO_MESES_CORTOS  = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

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
    window._consumoNivel1    = 'Todo'
    window._consumoMesSel    = null
    window._consumoSemanaSel = null
    window._consumoBuscador  = ''

    const hoy = new Date()
    const fmt = d => d.toISOString().slice(0, 10)

    content.innerHTML = `
      <div class="vista-header"><h2>🧮 Consumo</h2></div>

      <div class="receta-card" style="margin-bottom:16px">
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
            Desde
            <input type="date" id="consumo-gen-desde" value="${fmt(hoy)}"
              style="padding:6px 10px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text)">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
            Hasta
            <input type="date" id="consumo-gen-hasta" value="${fmt(hoy)}"
              style="padding:6px 10px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text)">
          </label>
          <button id="consumo-gen-btn" class="btn-accion btn-aprobar" onclick="generarConsumoRango()">Generar consumo teórico</button>
        </div>
        <div id="consumo-gen-resultado" style="margin-top:10px;font-size:13px"></div>
      </div>

      <input type="text" id="consumo-buscador" placeholder="Buscar insumo..."
        style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text);font-size:14px;margin-bottom:12px"
        oninput="filtrarConsumoBuscador(this.value)">

      <div id="consumo-filtro" style="margin-bottom:16px"></div>
      <div id="consumo-lista-wrap"></div>
    `

    await cargarConsumoData()

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

async function generarConsumoRango() {
  const btn   = document.getElementById('consumo-gen-btn')
  const resEl = document.getElementById('consumo-gen-resultado')
  const desde = document.getElementById('consumo-gen-desde').value
  const hasta = document.getElementById('consumo-gen-hasta').value
  if (!desde || !hasta || !btn || !resEl) return

  const original = btn.textContent
  btn.disabled = true
  btn.textContent = 'Generando...'
  resEl.textContent = ''

  try {
    const tenant_id = window._consumoTenant || await getTenantId()
    const { data, error } = await window._db.rpc('fn_generar_consumo_rango', {
      p_tenant_id: tenant_id, p_desde: desde, p_hasta: hasta
    })
    if (error) throw error

    const resultado  = Array.isArray(data) ? (data[0] || {}) : (data || {})
    const procesadas = Number(resultado.ventas_procesadas) || 0
    const filas       = Number(resultado.filas_generadas) || 0

    resEl.innerHTML = procesadas === 0
      ? `<span style="color:var(--color-text-muted)">0 ventas procesadas — ya estaba al día.</span>`
      : `<span style="color:#3A8C3E;font-weight:600">${procesadas} venta${procesadas !== 1 ? 's' : ''} procesada${procesadas !== 1 ? 's' : ''} · ${filas} fila${filas !== 1 ? 's' : ''} generada${filas !== 1 ? 's' : ''}.</span>`

    await cargarConsumoData()
  } catch (err) {
    resEl.innerHTML = `<span style="color:var(--color-highlight)">Error: ${err.message}</span>`
  } finally {
    btn.disabled = false
    btn.textContent = original
  }
}

async function cargarConsumoData() {
  const tenant_id = window._consumoTenant
  const wrap      = document.getElementById('consumo-lista-wrap')
  const filtroEl  = document.getElementById('consumo-filtro')

  const { data: filas, error } = await window._db
    .from('consumo_teorico')
    .select('id_venta, id_producto, cantidad_consumida, costo_unitario_snap, fecha_venta')
    .eq('tenant_id', tenant_id)

  if (error) {
    if (wrap) wrap.innerHTML = `<p style="color:var(--color-highlight)">Error: ${error.message}</p>`
    return
  }

  if (!filas || !filas.length) {
    window._consumoDiasData = []
    if (filtroEl) filtroEl.innerHTML = ''
    if (wrap) wrap.innerHTML = `<p style="color:var(--color-text-muted)">No hay consumo teórico registrado.</p>`
    return
  }

  const idsProducto = [...new Set(filas.map(f => f.id_producto))]
  const { data: productos } = await window._db
    .from('productos')
    .select('id_producto, producto')
    .eq('tenant_id', tenant_id)
    .in('id_producto', idsProducto)
  const nombreMap = {}
  ;(productos || []).forEach(p => { nombreMap[p.id_producto] = p.producto })

  const porDia = {}
  filas.forEach(f => {
    const fecha = f.fecha_venta
    if (!porDia[fecha]) porDia[fecha] = { fecha, ventasSet: new Set(), productosMap: {} }
    porDia[fecha].ventasSet.add(f.id_venta)
    const idp = f.id_producto
    if (!porDia[fecha].productosMap[idp]) {
      porDia[fecha].productosMap[idp] = { id_producto: idp, nombre: nombreMap[idp] || idp, cantidad: 0, subtotal: 0 }
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

  renderConsumoFiltro()
  renderConsumoVista()
}

function _filtrarConsumoPorPeriodo() {
  const todos  = window._consumoDiasData || []
  const nivel1 = window._consumoNivel1 || 'Todo'
  if (nivel1 === 'Todo') return todos
  if (nivel1 === 'Mes') {
    if (!window._consumoMesSel) return todos
    return todos.filter(d => d.fecha.slice(0, 7) === window._consumoMesSel)
  }
  if (nivel1 === 'Semana') {
    if (!window._consumoMesSel) return todos
    const delMes = todos.filter(d => d.fecha.slice(0, 7) === window._consumoMesSel)
    if (!window._consumoSemanaSel) return delMes
    return delMes.filter(d => _getLunesConsumo(d.fecha) === window._consumoSemanaSel)
  }
  return todos
}

function renderConsumoFiltro() {
  const cont = document.getElementById('consumo-filtro')
  if (!cont) return
  const todos = window._consumoDiasData || []
  const { meses, porMes } = _agruparConsumoPorMes(todos)
  const añosDistintos = [...new Set(meses.map(m => m.split('-')[0]))]
  const soloUnAño = añosDistintos.length === 1

  const nivel1 = window._consumoNivel1 || 'Todo'
  const pill = (active) => `padding:5px 14px;border-radius:20px;border:1px solid var(--color-border);cursor:pointer;font-size:13px;
    background:${active ? 'var(--color-primary)' : 'transparent'};color:${active ? '#fff' : 'var(--color-text)'}`

  let html = `<div style="display:flex;gap:8px;flex-wrap:wrap">
    ${['Todo', 'Mes', 'Semana'].map(p => `
      <button class="btn-periodo" onclick="setConsumoNivel1('${p}')" style="${pill(nivel1 === p)}">${p}</button>`).join('')}
  </div>`

  if (nivel1 === 'Mes' || nivel1 === 'Semana') {
    html += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      ${meses.map(mes => `
        <button class="btn-periodo" onclick="setConsumoMes('${mes}')" style="${pill(window._consumoMesSel === mes)}">${_consumoMesLabelDe(mes, soloUnAño)}</button>`).join('')}
    </div>`
  }

  if (nivel1 === 'Semana' && window._consumoMesSel) {
    const { semanas } = _agruparConsumoPorSemana(porMes[window._consumoMesSel] || [])
    html += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      ${semanas.map(lunes => `
        <button class="btn-periodo" onclick="setConsumoSemana('${lunes}')" style="${pill(window._consumoSemanaSel === lunes)}">${_semLabelConsumo(lunes)}</button>`).join('')}
    </div>`
  }

  cont.innerHTML = html
}

function setConsumoNivel1(nivel) {
  window._consumoNivel1    = nivel
  window._consumoMesSel    = null
  window._consumoSemanaSel = null
  renderConsumoFiltro()
  renderConsumoVista()
}

function setConsumoMes(mes) {
  window._consumoMesSel    = mes
  window._consumoSemanaSel = null
  renderConsumoFiltro()
  renderConsumoVista()
}

function setConsumoSemana(lunes) {
  window._consumoSemanaSel = lunes
  renderConsumoFiltro()
  renderConsumoVista()
}

function filtrarConsumoBuscador(val) {
  window._consumoBuscador = val
  renderConsumoVista()
}

function renderConsumoVista() {
  const listaEl = document.getElementById('consumo-lista-wrap')
  if (!listaEl) return

  const diasFiltrados = _filtrarConsumoPorPeriodo()
  const buscador = (window._consumoBuscador || '').trim().toLowerCase()

  // El buscador filtra productos dentro de cada día (no solo el día expandido) y oculta días sin match
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

  let html = soloUnAño
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

      const diasHtml = diasSem.map(d => {
        const diaId   = `consumo-dia-${d.fecha}`
        const diaOpen = !!buscador

        const filasProducto = d.productos.map(p => `
          <tr>
            <td>${p.nombre}</td>
            <td style="text-align:right">${formatNum(p.cantidad)}</td>
            <td style="text-align:right">$${formatNum(p.costoUnitario)}</td>
            <td style="text-align:right;font-weight:600">$${formatNum(p.subtotal)}</td>
          </tr>`).join('')

        return `
          <div style="margin-left:16px">
            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;
                font-size:13px;border-bottom:1px solid var(--color-border)"
              onclick="(function(el){
                const b=document.getElementById('${diaId}');
                const open=b.style.display!=='none';
                b.style.display=open?'none':'';
                el.querySelector('.dia-chev').textContent=open?'▶':'▼';
              })(this)">
              <span class="dia-chev" style="color:var(--color-text-muted);font-size:11px">${diaOpen ? '▼' : '▶'}</span>
              <span style="font-weight:600">${d.fecha}</span>
              <span style="color:var(--color-text-muted)">· ${d.numProductos} producto${d.numProductos !== 1 ? 's' : ''} · ${d.numVentas} venta${d.numVentas !== 1 ? 's' : ''}</span>
              <span style="font-weight:600;margin-left:auto">$${formatNum(d.costoTotal)}</span>
            </div>
            <div id="${diaId}" style="display:${diaOpen ? '' : 'none'};padding:8px 0 8px 12px">
              <div style="overflow-x:auto">
                <table class="tabla">
                  <thead>
                    <tr><th>Producto</th><th style="text-align:right">Cantidad</th><th style="text-align:right">Costo unitario</th><th style="text-align:right">Subtotal</th></tr>
                  </thead>
                  <tbody>${filasProducto}</tbody>
                </table>
              </div>
            </div>
          </div>`
      }).join('')

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
            background:var(--color-bg-card)"
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

  listaEl.innerHTML = html
}
