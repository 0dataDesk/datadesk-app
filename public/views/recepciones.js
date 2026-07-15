const REC_MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const REC_MESES_CORTOS  = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const REC_CHART_COLORS  = ['#792c24', '#C8892A', '#4A7A3A', '#6A9BB5', '#8A5FB0', '#B85C2A', '#3D9BA8', '#9B7B6A']

function _getLunesRecepcion(fechaStr) {
  const d = new Date(fechaStr + 'T12:00:00')
  const day = d.getDay() || 7
  d.setDate(d.getDate() - (day - 1))
  return d.toISOString().split('T')[0]
}

function _semLabelRecepcion(lunesStr) {
  const lun = new Date(lunesStr + 'T12:00:00')
  const dom = new Date(lun); dom.setDate(dom.getDate() + 6)
  const sufijo = dom.getMonth() !== lun.getMonth()
    ? `${REC_MESES_CORTOS[dom.getMonth()]}`
    : REC_MESES_CORTOS[lun.getMonth()]
  return `Semana del ${lun.getDate()} al ${dom.getDate()} ${sufijo}`
}

function _agruparRecepcionesPorMes(lista) {
  const porMes = {}
  lista.forEach(r => {
    const mes = (r.fecha || '').slice(0, 7)
    if (!porMes[mes]) porMes[mes] = []
    porMes[mes].push(r)
  })
  const meses = Object.keys(porMes).sort().reverse()
  return { meses, porMes }
}

function _agruparRecepcionesPorSemana(lista) {
  const porSemana = {}
  lista.forEach(r => {
    const lunes = _getLunesRecepcion(r.fecha)
    if (!porSemana[lunes]) porSemana[lunes] = []
    porSemana[lunes].push(r)
  })
  const semanas = Object.keys(porSemana).sort().reverse()
  return { semanas, porSemana }
}

function _recMesLabelDe(mes, soloUnAño) {
  const [year, month] = mes.split('-')
  return soloUnAño ? REC_MESES_NOMBRES[Number(month) - 1] : `${REC_MESES_NOMBRES[Number(month) - 1]} ${year}`
}

function _recGasto(r) {
  return Number(r.total_con_impuestos ?? r.subtotal ?? 0) || 0
}

async function vistaRecepciones() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando recepciones...</p>`

  try {
    const tenant_id = await getTenantId()

    const [
      { data: recepciones, error: errR },
      { data: proveedores, error: errP }
    ] = await Promise.all([
      window._db.from('recepciones')
        .select('*')
        .eq('tenant_id', tenant_id)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false }),
      window._db.from('proveedores')
        .select('id_proveedor, nombre, nombre_corto')
        .eq('tenant_id', tenant_id)
        .eq('activo', true)
        .order('nombre')
    ])

    if (errR) throw errR
    if (errP) throw errP

    const nombreProv = {}
    ;(proveedores || []).forEach(p => { nombreProv[p.id_proveedor] = p.nombre_corto || p.nombre })

    const badgeEstatus = {
      SIN_FACTURA: 'background:rgba(184,92,42,0.12);color:#B85C2A;border:1px solid rgba(184,92,42,0.3)',
      CON_FACTURA: 'background:rgba(200,137,42,0.12);color:#c8892a;border:1px solid rgba(200,137,42,0.3)',
      PAGADO:      'background:rgba(76,153,80,0.12);color:#3A8C3E;border:1px solid rgba(76,153,80,0.3)'
    }
    const iconoEstatus = { SIN_FACTURA: '✕', CON_FACTURA: '!', PAGADO: '✓' }

    window._recepciones   = recepciones || []
    window._nombreProv    = nombreProv
    window._proveedoresRec = proveedores || []
    window._badgeEstatus  = badgeEstatus
    window._iconoEstatus  = iconoEstatus
    window._recFiltroProv = ''
    window._recNivel1     = 'Todo'
    window._recMesSel     = null
    window._recSemanaSel  = null

    const nombresMap = {}
    try {
      const { data: users } = await window._db.rpc('get_usuarios_nombres')
      if (users) users.forEach(u => { if (u.email) nombresMap[u.email] = u.nombre_corto })
    } catch (e) {}
    window._recNombresMap = nombresMap

    content.innerHTML = `
      <div class="vista-header">
        <h2>📦 Recepciones</h2>
        <button class="btn-accion btn-aprobar" onclick="vistaRecepcionCaptura()">+ Nueva recepción</button>
      </div>

      <div id="form-recepcion-wrap"></div>

      <div id="recepciones-controles">
        <div id="recepciones-filtro-periodo" style="margin-bottom:16px"></div>

        <div id="recepciones-cabecero"></div>

        <div class="filtros-bar" style="margin-bottom:16px">
          <select id="filtro-rec-prov" class="filtro-select" onchange="filtrarRecepciones()">
            <option value="">Todos los proveedores</option>
            ${(proveedores || []).map(p => `<option value="${p.id_proveedor}">${p.nombre_corto || p.nombre}</option>`).join('')}
          </select>
        </div>

        <div id="recepciones-lista"></div>
      </div>
    `

    window.filtrarRecepciones = function() {
      window._recFiltroProv = document.getElementById('filtro-rec-prov')?.value || ''
      const filtradas = _recepcionesFiltroCombinado()
      renderCabeceroRecepciones(filtradas)
      renderListaRecepciones(filtradas)
    }

    renderRecFiltroPeriodo()
    renderCabeceroRecepciones(window._recepciones)
    renderListaRecepciones(window._recepciones)

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function _recepcionesFiltroCombinado() {
  const prov = window._recFiltroProv
  let lista = (window._recepciones || []).filter(r => !prov || r.id_proveedor === prov)

  const nivel1 = window._recNivel1 || 'Todo'
  if (nivel1 === 'Mes' && window._recMesSel) {
    lista = lista.filter(r => (r.fecha || '').slice(0, 7) === window._recMesSel)
  } else if (nivel1 === 'Semana' && window._recMesSel) {
    lista = lista.filter(r => (r.fecha || '').slice(0, 7) === window._recMesSel)
    if (window._recSemanaSel) lista = lista.filter(r => _getLunesRecepcion(r.fecha) === window._recSemanaSel)
  }
  return lista
}

// ── Filtro Todo/Mes/Semana (mismo look que Cierres) ──────────────────────────────
function renderRecFiltroPeriodo() {
  const cont = document.getElementById('recepciones-filtro-periodo')
  if (!cont) return
  const { meses } = _agruparRecepcionesPorMes(window._recepciones || [])
  const añosDistintos = [...new Set(meses.map(m => m.split('-')[0]))]
  const soloUnAño = añosDistintos.length === 1
  const nivel1 = window._recNivel1 || 'Todo'

  let html = `
    <div class="cierres-segmented">
      ${['Todo', 'Mes', 'Semana'].map(p => `
        <button class="btn-periodo${nivel1 === p ? ' active' : ''}" onclick="setRecNivel1('${p}')">${p}</button>`).join('')}
    </div>`

  if (nivel1 === 'Mes' || nivel1 === 'Semana') {
    html += `
    <div class="cierres-segmented cierres-segmented-sub" style="margin-top:10px">
      ${meses.map(mes => `
        <button class="btn-periodo${window._recMesSel === mes ? ' active' : ''}" onclick="setRecMes('${mes}')">${_recMesLabelDe(mes, soloUnAño)}</button>`).join('')}
    </div>`
  }

  if (nivel1 === 'Semana' && window._recMesSel) {
    const recDelMes = (window._recepciones || []).filter(r => (r.fecha || '').slice(0, 7) === window._recMesSel)
    const { semanas } = _agruparRecepcionesPorSemana(recDelMes)
    html += `
    <div class="cierres-segmented cierres-segmented-sub" style="margin-top:8px">
      ${semanas.map(lunes => `
        <button class="btn-periodo${window._recSemanaSel === lunes ? ' active' : ''}" onclick="setRecSemana('${lunes}')">${_semLabelRecepcion(lunes)}</button>`).join('')}
    </div>`
  }

  cont.innerHTML = html
}

function setRecNivel1(nivel) {
  window._recNivel1    = nivel
  window._recMesSel    = null
  window._recSemanaSel = null
  renderRecFiltroPeriodo()
  window.filtrarRecepciones()
}

function setRecMes(mes) {
  window._recMesSel    = mes
  window._recSemanaSel = null
  renderRecFiltroPeriodo()
  window.filtrarRecepciones()
}

function setRecSemana(lunes) {
  window._recSemanaSel = lunes
  renderRecFiltroPeriodo()
  window.filtrarRecepciones()
}

// ── Cabecero: total gastado, recepciones, sin factura, donut por proveedor ─────
function renderCabeceroRecepciones(lista) {
  const cabeceroEl = document.getElementById('recepciones-cabecero')
  if (!cabeceroEl) return

  if (!lista.length) {
    cabeceroEl.innerHTML = ''
    return
  }

  const totalGastado = lista.reduce((s, r) => s + _recGasto(r), 0)
  const numRecepciones = lista.length
  const sinFactura = lista.filter(r => r.estatus === 'SIN_FACTURA').length

  const porProveedor = {}
  lista.forEach(r => {
    const key = r.id_proveedor || 'Inventario Inicial'
    porProveedor[key] = (porProveedor[key] || 0) + _recGasto(r)
  })
  const provEntries = Object.entries(porProveedor).sort((a, b) => b[1] - a[1])
  const nombreDe = (key) => key === 'Inventario Inicial' ? key : (window._nombreProv[key] || key)

  const tdH = `padding:10px 16px 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);white-space:nowrap`
  const tdV = (color = 'var(--color-text)') => `padding:2px 16px 10px;font-family:'Bebas Neue',sans-serif;font-size:20px;color:${color}`

  const barrasHtml = provEntries.length
    ? `<div style="display:flex;flex-direction:column;gap:10px">
        ${provEntries.map(([key, monto], i) => {
          const pct = totalGastado ? Math.round(monto / totalGastado * 100) : 0
          const color = REC_CHART_COLORS[i % REC_CHART_COLORS.length]
          return `
            <div>
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
                <span>${nombreDe(key)}</span>
                <span style="font-weight:600">$${formatNum(monto)} · ${pct}%</span>
              </div>
              <div style="background:var(--color-secondary);border-radius:6px;height:8px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${color};border-radius:6px"></div>
              </div>
            </div>`
        }).join('')}
       </div>`
    : ''

  cabeceroEl.innerHTML = `
    <style>
      @media(min-width:640px){
        #recep-cab-inner { flex-direction: row !important; align-items: flex-start !important; }
      }
    </style>
    <div class="card-surface" style="padding:20px;margin-bottom:18px">
      <div id="recep-cab-inner" style="display:flex;flex-direction:column;gap:20px">

        <div style="flex:1;display:flex;flex-direction:column;gap:14px">
          <div>
            <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-muted)">Total recibido</div>
            <div style="font-family:'Bebas Neue',sans-serif;font-size:48px;line-height:1;color:var(--color-primary)">$${formatNum(totalGastado)}</div>
          </div>
          <table style="border-collapse:collapse;background:var(--color-secondary);border-radius:8px;overflow:hidden">
            <tbody>
              <tr>
                <td style="${tdH}">📦 Recepciones</td>
                <td style="${tdH}">🧾 Sin factura</td>
              </tr>
              <tr>
                <td style="${tdV()}">${numRecepciones}</td>
                <td style="${tdV('#B85C2A')}">${sinFactura}</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${provEntries.length > 0 ? `
        <div style="flex:1;min-width:220px">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-muted);margin-bottom:10px">Gasto por proveedor</div>
          ${barrasHtml}
        </div>` : ''}

      </div>
    </div>
  `
}

// ── Lista agrupada mes → semana (acordeón, igual patrón que Cierres/Consumo) ───
function renderListaRecepciones(lista) {
  const wrap = document.getElementById('recepciones-lista')
  if (!wrap) return

  if (!lista.length) {
    wrap.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px;margin-top:16px">No hay recepciones registradas.</p>`
    return
  }

  const { meses, porMes } = _agruparRecepcionesPorMes(lista)
  const añosDistintos = [...new Set(meses.map(m => m.split('-')[0]))]
  const soloUnAño = añosDistintos.length === 1

  let html = `<div class="card-surface" style="padding:16px 20px">`
  html += soloUnAño
    ? `<div style="font-size:12px;color:var(--color-text-muted);margin-bottom:8px">Recepciones ${añosDistintos[0]}</div>`
    : ''

  meses.forEach((mes, mesIdx) => {
    const recMes   = porMes[mes]
    const totMes   = recMes.reduce((s, r) => s + _recGasto(r), 0)
    const mesLabel = _recMesLabelDe(mes, soloUnAño)
    const mesOpen  = mesIdx === 0
    const mesId    = `rec-mes-${mes}`

    const { semanas, porSemana } = _agruparRecepcionesPorSemana(recMes)

    let semanasHtml = ''
    semanas.forEach((lunes, semIdx) => {
      const recSem  = porSemana[lunes]
      const totSem  = recSem.reduce((s, r) => s + _recGasto(r), 0)
      const semOpen = mesIdx === 0 && semIdx === 0
      const semId   = `rec-sem-${mes}-${lunes}`

      const filasHtml = recSem.map(r => {
        const provNombre = r.id_proveedor ? (window._nombreProv[r.id_proveedor] || r.id_proveedor) : 'Inventario Inicial'
        const registradoPor = window._recNombresMap[r.created_by] || (r.created_by === 'sistema' ? 'Sistema' : (r.created_by || '—'))
        return `
          <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:10px 12px 10px 32px;
              border-bottom:1px solid var(--color-border);cursor:pointer;font-size:13px"
            onclick="verDetalleRecepcion('${r.id}')"
            onmouseenter="this.style.background='var(--color-secondary)'"
            onmouseleave="this.style.background=''">
            <span style="min-width:80px;font-weight:600">${r.fecha || '—'}</span>
            <span>${provNombre}</span>
            <span style="color:var(--color-text-muted);font-size:12px">${registradoPor}</span>
            <span style="color:var(--color-text-muted)">${r.num_remision || '—'}</span>
            <span style="margin-left:auto;font-weight:600">$${formatNum(_recGasto(r))}</span>
            ${r.estatus === 'SIN_FACTURA'
              ? `<button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 10px"
                  onclick="event.stopPropagation();registrarFactura('${r.id}')">Registrar factura</button>`
              : ''}
          </div>`
      }).join('')

      semanasHtml += `
        <div style="margin-left:16px">
          <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;
              font-size:13px;border-bottom:1px solid var(--color-border);background:var(--color-bg-alt)"
            onclick="(function(el){
              const b=document.getElementById('${semId}');
              const open=b.style.display!=='none';
              b.style.display=open?'none':'';
              el.querySelector('.sem-chev').textContent=open?'▶':'▼';
            })(this)">
            <span class="sem-chev" style="color:var(--color-text-muted);font-size:11px">${semOpen ? '▼' : '▶'}</span>
            <span>${_semLabelRecepcion(lunes)}</span>
            <span style="color:var(--color-text-muted)">· ${recSem.length} recepci${recSem.length !== 1 ? 'ones' : 'ón'}</span>
            <span style="font-weight:600;margin-left:auto">$${formatNum(totSem)}</span>
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
          <span style="color:var(--color-text-muted);font-size:13px">· ${recMes.length} recepci${recMes.length !== 1 ? 'ones' : 'ón'}</span>
          <span style="font-weight:700;color:var(--color-primary);margin-left:auto">$${formatNum(totMes)}</span>
        </div>
        <div id="${mesId}" style="display:${mesOpen ? '' : 'none'}">
          ${semanasHtml}
        </div>
      </div>`
  })

  html += `</div>`

  wrap.innerHTML = html
}

async function vistaRecepcionCaptura() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando...</p>`

  const tenant_id = await getTenantId()
  const hoy = new Date().toISOString().split('T')[0]

  const _fuentes = (window.FUENTES_POR_TENANT[tenant_id] || []).map(f => f.fuente)

  const [
    { data: proveedores, error: errProv },
    { data: productos, error: errProd }
  ] = await Promise.all([
    window._db.from('proveedores').select('id_proveedor, nombre').eq('tenant_id', tenant_id).eq('activo', true).order('nombre'),
    window._db.from('productos').select('id_producto, producto, unidad_medida, grupo').eq('tenant_id', tenant_id).eq('activo', true).eq('tipo', 'Insumo').in('fuente', _fuentes).order('producto')
  ])

  if (errProd) { alert(`Error al cargar insumos: ${errProd.message}`); await vistaRecepciones(); return }
  if (errProv) { alert(`Error al cargar proveedores: ${errProv.message}`); await vistaRecepciones(); return }

  window._productos_rec = productos || []
  window._tenant_id_rec = tenant_id

  content.innerHTML = `
    <div class="vista-header">
      <h2>📦 Nueva recepción</h2>
      <button class="btn-accion" style="border:1px solid var(--color-border);background:var(--color-secondary)"
        onclick="vistaRecepciones()">← Volver</button>
    </div>

    <div class="card-surface" style="padding:24px">
      <div class="filtros-cascada">
        <div class="filtro-cascada-item">
          <label class="filtro-label">Fecha</label>
          <input type="date" id="rec-fecha" class="filtro-select" value="${hoy}">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Proveedor</label>
          <select id="rec-proveedor" class="filtro-select">
            <option value="">— Seleccionar —</option>
            ${(proveedores || []).map(p => `<option value="${p.id_proveedor}">${p.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Folio</label>
          <input type="text" id="rec-folio" class="filtro-select" placeholder="Núm. factura o remisión">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Subir archivo</label>
          <input type="file" id="rec-archivo" class="filtro-select" accept="image/*,.pdf"
            style="padding:4px;font-size:12px">
        </div>
      </div>

      <h4 style="margin:20px 0 12px;font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;letter-spacing:1px">
        Insumos recibidos
      </h4>

      <div id="rec-items-wrap">
        <div id="rec-items-body" class="rec-items-body"></div>
        <button class="btn-accion" style="margin-top:12px;font-size:12px;border:1px solid var(--color-border)"
          onclick="agregarFilaRecepcion()">+ Agregar insumo</button>
      </div>

      <div id="rec-totales-wrap" style="margin-top:16px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-size:13px">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="color:var(--color-text-muted);width:100px;text-align:right">Subtotal</span>
          <span id="rec-subtotal-disp" style="font-weight:600;min-width:90px;text-align:right">$0.00</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="color:var(--color-text-muted);width:100px;text-align:right">IEPS</span>
          <span style="color:var(--color-text-muted)">$</span>
          <input type="number" id="rec-ieps-monto" class="edit-input edit-num" min="0" step="any"
            placeholder="0.00" style="width:90px;text-align:right">
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="color:var(--color-text-muted);width:100px;text-align:right">IVA</span>
          <span style="color:var(--color-text-muted)">$</span>
          <input type="number" id="rec-iva-monto" class="edit-input edit-num" min="0" step="any"
            placeholder="0.00" style="width:90px;text-align:right">
        </div>
        <div style="border-top:1.5px solid var(--color-border);padding-top:8px;display:flex;align-items:center;gap:12px">
          <span style="font-weight:700;width:100px;text-align:right">Total</span>
          <span id="rec-total-final-disp" style="font-weight:700;font-size:15px;color:var(--color-primary);min-width:90px;text-align:right">$0.00</span>
        </div>
      </div>

      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn-accion btn-aprobar" onclick="guardarRecepcion()">Guardar recepción</button>
        <button class="btn-accion" style="border:1px solid var(--color-border);background:var(--color-secondary)"
          onclick="vistaRecepciones()">Cancelar</button>
      </div>
    </div>
  `

  window._recItemCount = 0
  agregarFilaRecepcion()

  document.getElementById('rec-ieps-monto').addEventListener('input', _actualizarTotalRecepcion)
  document.getElementById('rec-iva-monto').addEventListener('input', _actualizarTotalRecepcion)
}

function _actualizarTotalRecepcion() {
  const filas = document.querySelectorAll('[id^="rec-item-"]')
  let total = 0
  filas.forEach(fila => {
    const idx      = fila.id.replace('rec-item-', '')
    const piezas   = parseFloat(document.getElementById(`rec-piezas-${idx}`)?.value) || 0
    const contenido = parseFloat(document.getElementById(`rec-contenido-${idx}`)?.value)
    const cantidad  = (piezas > 0 && !isNaN(contenido) && contenido > 0) ? piezas * contenido : piezas
    const costo     = parseFloat(document.getElementById(`rec-costo-${idx}`)?.value) || 0
    const item_total = piezas * costo

    total += item_total

    const cantEl = document.getElementById(`rec-cant-${idx}`)
    if (cantEl) cantEl.value = cantidad > 0 ? cantidad : ''

    const td = document.getElementById(`rec-total-item-${idx}`)
    if (td) td.textContent = `$${formatNum(item_total)}`
  })
  const fmt = (n) => '$' + formatNum(n)

  const subtotalEl = document.getElementById('rec-subtotal-disp')
  if (subtotalEl) subtotalEl.textContent = fmt(total)

  const iepsMonto  = parseFloat(document.getElementById('rec-ieps-monto')?.value) || 0
  const ivaMonto   = parseFloat(document.getElementById('rec-iva-monto')?.value)  || 0
  const totalFinal = total + iepsMonto + ivaMonto

  const totalFinalEl = document.getElementById('rec-total-final-disp')
  if (totalFinalEl) totalFinalEl.textContent = fmt(totalFinal)
}

function _recGlobalDrop() {
  let drop = document.getElementById('rec-global-drop')
  if (!drop) {
    drop = document.createElement('div')
    drop.id = 'rec-global-drop'
    drop.style.cssText = [
      'display:none', 'position:fixed', 'z-index:9999',
      'background:var(--color-surface,#fff)', 'border:1px solid var(--color-border)',
      'border-radius:6px', 'max-height:220px', 'overflow-y:auto',
      'box-shadow:0 4px 16px rgba(0,0,0,0.18)', 'min-width:200px'
    ].join(';')
    document.body.appendChild(drop)
  }
  return drop
}

function agregarFilaRecepcion() {
  const i = window._recItemCount++
  const body = document.getElementById('rec-items-body')
  const card = document.createElement('div')
  card.className = 'rec-item-card'
  card.id = `rec-item-${i}`
  card.innerHTML = `
    <div class="rec-item-buscar">
      <input type="text" class="edit-select" id="rec-buscar-${i}" placeholder="Buscar insumo..."
        style="width:100%" autocomplete="off">
      <input type="hidden" id="rec-prod-${i}">
    </div>

    <div class="rec-item-row">
      <div class="rec-item-field">
        <label class="rec-item-label">Piezas</label>
        <input type="number" class="edit-input edit-num" id="rec-piezas-${i}" min="0" step="any" value="1">
      </div>
      <span class="rec-item-op">×</span>
      <div class="rec-item-field">
        <label class="rec-item-label">Contenido/pieza</label>
        <input type="number" class="edit-input edit-num" id="rec-contenido-${i}" min="0" step="any" placeholder="—">
        <span id="rec-unidad-${i}" class="rec-item-unidad"></span>
      </div>
      <span class="rec-item-op">=</span>
      <div class="rec-item-field rec-item-field-resultado">
        <label class="rec-item-label">Cantidad total</label>
        <input type="text" class="edit-input" id="rec-cant-${i}" readonly placeholder="—">
      </div>
    </div>

    <div class="rec-item-row">
      <div class="rec-item-field">
        <label class="rec-item-label">Costo/pieza</label>
        <input type="number" class="edit-input edit-num" id="rec-costo-${i}" min="0" step="any" placeholder="$0.00">
      </div>
      <div class="rec-item-field rec-item-field-resultado">
        <label class="rec-item-label">Total</label>
        <div id="rec-total-item-${i}" class="rec-item-total-valor">$0.00</div>
      </div>
      ${i > 0 ? `<button type="button" class="btn-fila btn-inactivar-ing rec-item-borrar" title="Eliminar insumo"
        onclick="this.closest('.rec-item-card').remove();_actualizarTotalRecepcion()">×</button>` : ''}
    </div>
  `
  body.appendChild(card)

  const inputEl = document.getElementById(`rec-buscar-${i}`)
  inputEl.addEventListener('input',  () => _filtrarInsumo(i))
  inputEl.addEventListener('focus',  () => _filtrarInsumo(i))
  inputEl.addEventListener('blur',   () => _cerrarDropdown(i))
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') _cerrarDropdown(i) })

  document.getElementById(`rec-piezas-${i}`).addEventListener('input', _actualizarTotalRecepcion)
  document.getElementById(`rec-contenido-${i}`).addEventListener('input', _actualizarTotalRecepcion)
  document.getElementById(`rec-costo-${i}`).addEventListener('input', _actualizarTotalRecepcion)
}

function _filtrarInsumo(idx) {
  const inputEl = document.getElementById(`rec-buscar-${idx}`)
  const query   = (inputEl?.value || '').toLowerCase().trim()
  const drop    = _recGlobalDrop()

  window._recDropActivo = idx

  if (query.length < 2) { drop.style.display = 'none'; return }

  const resultados = (window._productos_rec || []).filter(p =>
    p.producto.toLowerCase().includes(query)
  ).slice(0, 20)

  drop.innerHTML = ''

  if (!resultados.length) {
    const noRes = document.createElement('div')
    noRes.style.cssText = 'padding:10px 14px;color:var(--color-text-muted);font-size:13px'
    noRes.textContent = 'Sin resultados'
    drop.appendChild(noRes)
  } else {
    resultados.forEach(p => {
      const item = document.createElement('div')
      item.style.cssText = 'padding:8px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--color-border,#eee)'
      item.innerHTML = `<span style="font-weight:600">${p.producto}</span><span style="color:var(--color-text-muted);font-size:11px;margin-left:8px">${p.unidad_medida || ''}${p.grupo ? ' · ' + p.grupo : ''}</span>`
      item.addEventListener('mouseenter', () => { item.style.background = 'rgba(0,0,0,0.04)' })
      item.addEventListener('mouseleave', () => { item.style.background = '' })
      item.addEventListener('mousedown', (e) => {
        e.preventDefault()
        _seleccionarInsumo(idx, p.id_producto, p.producto, p.unidad_medida)
      })
      drop.appendChild(item)
    })
  }

  const rect = inputEl.getBoundingClientRect()
  drop.style.left  = rect.left + 'px'
  drop.style.top   = (rect.bottom + 2) + 'px'
  drop.style.width = rect.width + 'px'
  drop.style.display = 'block'
}

function _seleccionarInsumo(idx, id_producto, nombre, unidad) {
  const input    = document.getElementById(`rec-buscar-${idx}`)
  const hidden   = document.getElementById(`rec-prod-${idx}`)
  const drop     = document.getElementById('rec-global-drop')
  const unidadEl = document.getElementById(`rec-unidad-${idx}`)
  if (input)    input.value  = nombre
  if (hidden)   hidden.value = id_producto
  if (drop)     drop.style.display = 'none'
  if (unidadEl) unidadEl.textContent = unidad || ''
}

function _cerrarDropdown(idx) {
  setTimeout(() => {
    const drop = document.getElementById('rec-global-drop')
    if (drop && window._recDropActivo === idx) drop.style.display = 'none'
  }, 200)
}

async function guardarRecepcion() {
  const tenant_id    = await getTenantId()
  const fecha        = document.getElementById('rec-fecha')?.value
  const id_proveedor = document.getElementById('rec-proveedor')?.value
  const folio        = document.getElementById('rec-folio')?.value?.trim() || null
  const archivoInput = document.getElementById('rec-archivo')

  if (!fecha || !id_proveedor) {
    alert('Fecha y proveedor son obligatorios')
    return
  }

  const filas = document.querySelectorAll('[id^="rec-item-"]')
  const items = []

  for (const fila of filas) {
    const idx        = fila.id.replace('rec-item-', '')
    const id_producto = document.getElementById(`rec-prod-${idx}`)?.value
    const piezas     = parseFloat(document.getElementById(`rec-piezas-${idx}`)?.value)
    const contenido  = parseFloat(document.getElementById(`rec-contenido-${idx}`)?.value)
    const costo      = parseFloat(document.getElementById(`rec-costo-${idx}`)?.value)
    if (!id_producto || isNaN(piezas) || piezas <= 0) continue
    const cantidad_recibida = (!isNaN(contenido) && contenido > 0) ? piezas * contenido : piezas
    // costo por unidad base: si hay contenido, dividir costo/pieza entre unidades/pieza
    const costo_unitario = isNaN(costo) ? 0
      : (!isNaN(contenido) && contenido > 0) ? costo / contenido
      : costo
    items.push({ id_producto, cantidad_recibida, costo_unitario })
  }

  if (!items.length) { alert('Agrega al menos un insumo'); return }

  // Subir archivo si se seleccionó
  let archivo_url = null
  const archivoFile = archivoInput?.files?.[0]
  if (archivoFile) {
    const ext = archivoFile.name.split('.').pop()
    const folioPath = folio ? folio.replace(/[^a-zA-Z0-9_\-]/g, '_') : 'sin_folio'
    const storagePath = `${tenant_id}/${fecha}/${folioPath}.${ext}`
    const { data: uploadData, error: uploadErr } = await window._db.storage
      .from('recepciones')
      .upload(storagePath, archivoFile, { upsert: true })
    if (uploadErr) {
      alert(`Error al subir archivo: ${uploadErr.message}`)
      console.warn('Upload archivo fallido:', uploadErr.message)
    } else {
      // Guardar el path relativo — la signed URL se genera al abrir el detalle
      archivo_url = storagePath
    }
  }

  // Calcular subtotal = suma(piezas × costo/pieza) para guardar en BD
  let _subtotalFinal = 0
  document.querySelectorAll('[id^="rec-item-"]').forEach(fila => {
    const idx    = fila.id.replace('rec-item-', '')
    const piezas = parseFloat(document.getElementById(`rec-piezas-${idx}`)?.value) || 0
    const costo  = parseFloat(document.getElementById(`rec-costo-${idx}`)?.value)  || 0
    _subtotalFinal += piezas * costo
  })
  const _iepsMonto  = parseFloat(document.getElementById('rec-ieps-monto')?.value) || null
  const _ivaMonto   = parseFloat(document.getElementById('rec-iva-monto')?.value)  || null
  const _totalFinal = _subtotalFinal + (_iepsMonto || 0) + (_ivaMonto || 0)

  const { data: recepcion, error: errR } = await window._db
    .from('recepciones')
    .insert({
      tenant_id, fecha, id_proveedor,
      num_remision: folio,
      estatus: 'SIN_FACTURA',
      archivo_url,
      subtotal:            _subtotalFinal || null,
      ieps_porcentaje:     null,
      ieps_monto:          _iepsMonto,
      iva_porcentaje:      null,
      iva_monto:           _ivaMonto,
      total_con_impuestos: _totalFinal || null,
      created_by: window._email || null
    })
    .select().single()

  if (errR) { alert(`Error: ${errR.message}`); return }

  const rows = items.map(it => ({ ...it, id_recepcion: recepcion.id }))
  const { error: errI } = await window._db.from('recepcion_items').insert(rows)
  if (errI) { alert(`Error al guardar items: ${errI.message}`); return }

  await vistaRecepciones()
}

async function registrarFactura(id) {
  const num = prompt('Número de factura:')
  if (!num) return
  const { error } = await window._db
    .from('recepciones')
    .update({ estatus: 'CON_FACTURA', num_factura: num.trim() })
    .eq('id', id)
  if (error) { alert(`Error: ${error.message}`); return }
  await vistaRecepciones()
}

async function marcarPagado(id) {
  if (!confirm('¿Confirmar como pagado?')) return
  const { error } = await window._db
    .from('recepciones')
    .update({ estatus: 'PAGADO' })
    .eq('id', id)
  if (error) { alert(`Error: ${error.message}`); return }
  await vistaRecepciones()
}

async function verDetalleRecepcion(id) {
  const controles = document.getElementById('recepciones-controles')
  if (controles) controles.style.display = 'none'

  const tenant_id = await getTenantId()

  const [
    { data: rec },
    { data: items },
    { data: productos }
  ] = await Promise.all([
    window._db.from('recepciones').select('*').eq('id', id).single(),
    window._db.from('recepcion_items').select('*').eq('id_recepcion', id),
    window._db.from('productos').select('id_producto, producto, unidad_medida').eq('tenant_id', tenant_id).eq('activo', true)
  ])

  if (!rec) return

  const prodMap = {}
  ;(productos || []).forEach(p => { prodMap[p.id_producto] = p })

  const wrap = document.getElementById('form-recepcion-wrap')
  const subtotalItems = (items || []).reduce((s, i) => s + (Number(i.cantidad_recibida) * Number(i.costo_unitario || 0)), 0)
  const provNombre = rec.id_proveedor
    ? (window._nombreProv[rec.id_proveedor] || rec.id_proveedor)
    : 'Inventario Inicial'

  // Generar signed URL fresca si hay archivo (path relativo en BD) — se muestra oculta por defecto
  let archivoHtml = ''
  if (rec.archivo_url) {
    let archivoDisplayUrl = null
    if (!rec.archivo_url.startsWith('http')) {
      const { data: signed } = await window._db.storage.from('recepciones').createSignedUrl(rec.archivo_url, 60 * 60 * 2)
      archivoDisplayUrl = signed?.signedUrl || null
    } else {
      archivoDisplayUrl = rec.archivo_url
    }
    if (archivoDisplayUrl) {
      archivoHtml = `
        <div style="margin-top:16px">
          <a href="${archivoDisplayUrl}" target="_blank" rel="noopener"
            class="btn-accion" style="border:1px solid var(--color-border);text-decoration:none;display:inline-block">
            📎 Ver documento adjunto
          </a>
        </div>`
    }
  }

  // Pie de totales con IEPS/IVA si aplica
  const fmtMXN = (n) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const subtotalBD = rec.subtotal ?? subtotalItems
  let totalesHtml = `
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;margin-top:8px;font-size:13px">
      <div><span style="color:var(--color-text-muted);margin-right:16px">Subtotal</span><span style="font-weight:600">${fmtMXN(subtotalBD)}</span></div>`
  if (rec.ieps_monto) totalesHtml += `
      <div><span style="color:var(--color-text-muted);margin-right:16px">IEPS</span><span>${fmtMXN(rec.ieps_monto)}</span></div>`
  if (rec.iva_monto) totalesHtml += `
      <div><span style="color:var(--color-text-muted);margin-right:16px">IVA</span><span>${fmtMXN(rec.iva_monto)}</span></div>`
  if (rec.ieps_monto || rec.iva_monto) totalesHtml += `
      <div style="border-top:1.5px solid var(--color-border);padding-top:6px;margin-top:2px">
        <span style="font-weight:700;margin-right:16px">Total</span>
        <span style="font-weight:700;font-size:15px;color:var(--color-primary)">${fmtMXN(rec.total_con_impuestos ?? subtotalBD)}</span>
      </div>`
  totalesHtml += `</div>`

  wrap.innerHTML = `
    <div class="card-surface" style="padding:24px;margin-bottom:24px">
      <div class="detalle-header">
        <div>
          <h3>Recepción — ${rec.num_remision || rec.id.slice(0,8)}</h3>
          <p class="detalle-categoria">${provNombre} · ${rec.fecha}</p>
        </div>
        <span class="badge-status" style="${window._badgeEstatus[rec.estatus] || ''}">
          ${window._iconoEstatus[rec.estatus] || ''} ${rec.estatus?.replace('_',' ')}
        </span>
      </div>

      ${archivoHtml}

      <table class="tabla" style="margin-top:16px">
        <thead>
          <tr>
            <th>Insumo</th>
            <th style="text-align:right">Cant. recibida</th>
            <th style="text-align:right">Cant. solicitada</th>
            <th style="text-align:right">Costo unit.</th>
            <th style="text-align:right">Total</th>
            <th style="text-align:right">Desv. precio</th>
          </tr>
        </thead>
        <tbody>
          ${(items || []).map(i => {
            const total = Number(i.cantidad_recibida) * Number(i.costo_unitario || 0)
            const desv  = i.desviacion_porcentaje ?? i.variacion_pct ?? null
            let rowStyle = ''
            let desvHtml = '—'
            if (desv !== null) {
              if (desv > 5) {
                rowStyle = 'background:rgba(184,92,42,0.08)'
                desvHtml = `<span style="color:#B85C2A;font-weight:700">▲ ${formatNum(desv, 1)}%</span>`
              } else if (desv >= 1) {
                rowStyle = 'background:rgba(200,137,42,0.08)'
                desvHtml = `<span style="color:#c8892a;font-weight:600">▲ ${formatNum(desv, 1)}%</span>`
              } else {
                desvHtml = `<span style="color:var(--color-text-muted)">${formatNum(desv, 1)}%</span>`
              }
            }
            return `
              <tr style="${rowStyle}">
                <td>${prodMap[i.id_producto]?.producto || i.id_producto}</td>
                <td style="text-align:right">${formatInt(i.cantidad_recibida)} ${prodMap[i.id_producto]?.unidad_medida || ''}</td>
                <td style="text-align:right;color:var(--color-text-muted)">${i.cantidad_solicitada != null ? formatInt(i.cantidad_solicitada) : '—'}</td>
                <td style="text-align:right">$${formatNum(i.costo_unitario || 0)}</td>
                <td style="text-align:right;font-weight:600">$${formatNum(total)}</td>
                <td style="text-align:right">${desvHtml}</td>
              </tr>`
          }).join('')}
        </tbody>
      </table>

      ${totalesHtml}

      <div style="margin-top:16px">
        <button class="btn-accion" style="border:1px solid var(--color-border);background:var(--color-secondary)"
          onclick="
            const c=document.getElementById('recepciones-controles');
            if(c) c.style.display='';
            document.getElementById('form-recepcion-wrap').innerHTML=''
          ">Cerrar</button>
      </div>
    </div>
  `
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
