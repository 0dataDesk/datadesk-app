const REC_CAT_META = {
  furia: {
    'Hamburguesas':     { emoji: '🍔', color: '#B85C2A' },
    'Pollo':            { emoji: '🍗', color: '#C8892A' },
    'Acompañamientos':  { emoji: '🍟', color: '#4A7A3A' },
    'Bebidas':          { emoji: '🥤', color: '#3D9BA8' },
    'Aderezos':         { emoji: '🥫', color: '#8A5FB0' },
    'Subrecetas':       { emoji: '⚗️', color: '#6A9BB5' }
  },
  tita: {
    'Panadería Clásica':          { emoji: '🥖', color: '#C8892A' },
    'Panes':                      { emoji: '🍞', color: '#B8763A' },
    'Dulces & Pastelería':        { emoji: '🍰', color: '#B85C2A' },
    'Laminados Salados':          { emoji: '🥐', color: '#8A5FB0' },
    'Sándwiches':                 { emoji: '🥪', color: '#4A7A3A' },
    'Sándwiches de Miga':         { emoji: '🥪', color: '#6A9BB5' },
    'Salado':                     { emoji: '🧀', color: '#9B7B6A' },
    'Especialidades Regionales':  { emoji: '🌟', color: '#C8892A' },
    'Bebidas base café':          { emoji: '☕', color: '#6A4A2A' },
    'Bebidas base matcha':        { emoji: '🍵', color: '#4A7A3A' },
    'Bebidas base taro':          { emoji: '🟣', color: '#8A5FB0' },
    'Bebida chocolate':           { emoji: '🍫', color: '#6B3A1F' },
    'Bebidas frescas':            { emoji: '🧊', color: '#3D9BA8' },
    'Tés y tisanas':              { emoji: '🍵', color: '#7A9B6A' },
    'Subrecetas':                 { emoji: '⚗️', color: '#6A9BB5' }
  }
}
const REC_CAT_DEFAULT = { emoji: '📦', color: '#9B7B6A' }

function _recCatMeta(tenant, categoria) {
  return (REC_CAT_META[tenant] || {})[categoria] || REC_CAT_DEFAULT
}

function indicePrioridad(tenant, categoria) {
  const orden = Object.keys(REC_CAT_META[tenant] || {})
  const idx = orden.indexOf(categoria)
  return idx === -1 ? 999 : idx
}

async function vistaRecetas() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando...</p>`

  try {
    const tenant_id    = await getTenantId()
    const tenantActual = (window._tenantConfig?.nombre || '').toLowerCase()
    const fuentesDef    = FUENTES_POR_TENANT[tenantActual] || []
    const rol           = window._rol || 'operador'

    const { data: recetas, error: errR } = await window._db
      .from('catalogo_recetas')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)
      .neq('tipo_receta', 'config')
      .neq('categoria', 'Extras')
      .order('nombre_platillo')

    if (errR) throw errR

    window._recetas          = recetas || []
    window._recTenantActual  = tenantActual
    window._recPuedeEditar   = ['admin', 'editor', 'cocina'].includes(rol)
    window._recPuedeVerCosteo = rol === 'superadmin' || window._email === 'rafepa1978@gmail.com'

    window._recNivel         = 'categoria'
    window._recFuenteSel     = ''
    window._recCategoriaSel  = null
    window._recRecetaSel     = null

    content.innerHTML = `
      <div class="vista-header">
        <h2>📖 Recetas</h2>
      </div>
      <div id="rec-nivel-wrap"></div>
    `

    renderRecetasNivel()

  } catch (err) {
    content.innerHTML = `<p>Error al cargar recetas: ${err.message}</p>`
  }
}

function _recFiltroFuente() {
  const fuentesDef = FUENTES_POR_TENANT[window._recTenantActual] || []
  return fuentesDef.length > 1 ? (window._recFuenteSel || '') : ''
}

function _recRecetasFiltradas() {
  const fuente = _recFiltroFuente()
  return (window._recetas || []).filter(r => !fuente || r.fuente === fuente)
}

function renderRecetasNivel() {
  const wrap = document.getElementById('rec-nivel-wrap')
  if (!wrap) return
  if (window._recNivel === 'platillo') return renderRecPlatillos(wrap)
  if (window._recNivel === 'detalle')  return renderRecDetalleNivel(wrap)
  renderRecCategorias(wrap)
}

function renderRecCategorias(wrap) {
  const fuentesDef = FUENTES_POR_TENANT[window._recTenantActual] || []
  const recetasVisibles = _recRecetasFiltradas()

  const porCategoria = {}
  recetasVisibles.forEach(r => {
    const c = r.categoria || 'Sin categoría'
    if (!porCategoria[c]) porCategoria[c] = []
    porCategoria[c].push(r)
  })
  const categorias = Object.keys(porCategoria).sort((a, b) =>
    indicePrioridad(window._recTenantActual, a) - indicePrioridad(window._recTenantActual, b)
  )

  wrap.innerHTML = `
    ${fuentesDef.length > 1 ? `
    <div class="filtros-bar" style="margin-bottom:16px">
      <select id="rec-f-fuente" class="filtro-select">
        <option value="">Todas las fuentes</option>
        ${fuentesDef.map(f => `<option value="${f.fuente}"${f.fuente === window._recFuenteSel ? ' selected' : ''}>${f.etiqueta}</option>`).join('')}
      </select>
    </div>` : ''}
    ${categorias.length ? `
    <div class="rec-tiles-grid">
      ${categorias.map(c => {
        const meta = _recCatMeta(window._recTenantActual, c)
        return `
        <button class="rec-tile" style="border-left:4px solid ${meta.color}" onclick="recIrPlatillos('${c.replace(/'/g,"\\'")}')">
          <div class="rec-tile-titulo">${meta.emoji} ${c}</div>
          <div class="rec-tile-sub">${porCategoria[c].length} platillo${porCategoria[c].length === 1 ? '' : 's'}</div>
        </button>`
      }).join('')}
    </div>` : `<p style="color:var(--color-text-muted);font-size:13px">No hay recetas para mostrar.</p>`}
  `

  const fFuente = document.getElementById('rec-f-fuente')
  if (fFuente) fFuente.addEventListener('change', () => {
    window._recFuenteSel = fFuente.value
    renderRecCategorias(wrap)
  })
}

function renderRecPlatillos(wrap) {
  const categoria = window._recCategoriaSel
  const meta = _recCatMeta(window._recTenantActual, categoria)
  const recetas = _recRecetasFiltradas()
    .filter(r => (r.categoria || 'Sin categoría') === categoria)
    .sort((a, b) => a.nombre_platillo.localeCompare(b.nombre_platillo))

  wrap.innerHTML = `
    <button class="rec-volver-btn" onclick="recIrCategorias()">← Categorías</button>
    <h3 style="margin:8px 0 12px">${meta.emoji} ${categoria}</h3>
    ${recetas.length ? `
    <div class="rec-tiles-grid">
      ${recetas.map(r => `
        <button class="rec-tile" style="border-left:4px solid ${meta.color}" onclick="recIrDetalle('${r.id_receta}')">
          <div class="rec-tile-titulo">${r.nombre_platillo}</div>
        </button>`).join('')}
    </div>` : `<p style="color:var(--color-text-muted);font-size:13px">Sin platillos en esta categoría.</p>`}
  `
}

function renderRecDetalleNivel(wrap) {
  const receta = (window._recetas || []).find(r => String(r.id_receta) === String(window._recRecetaSel))
  wrap.innerHTML = `
    <button class="rec-volver-btn" onclick="recIrPlatillos('${(window._recCategoriaSel || '').replace(/'/g,"\\'")}')">← ${window._recCategoriaSel || 'Volver'}</button>
    <div id="receta-detalle-wrap"></div>
  `
  if (receta) cargarDetalleReceta(receta)
}

window.recIrCategorias = function() {
  window._recNivel = 'categoria'
  window._recCategoriaSel = null
  window._recRecetaSel = null
  renderRecetasNivel()
}

window.recIrPlatillos = function(categoria) {
  window._recNivel = 'platillo'
  window._recCategoriaSel = categoria
  window._recRecetaSel = null
  renderRecetasNivel()
}

window.recIrDetalle = function(idReceta) {
  window._recNivel = 'detalle'
  window._recRecetaSel = idReceta
  renderRecetasNivel()
}

async function _recCalcularCostosPromedio(tenant_id, idsProducto) {
  if (!idsProducto.length) return {}
  const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30)
  const hace30str = hace30.toISOString().split('T')[0]

  const { data } = await window._db
    .from('recepcion_items')
    .select('id_producto, cantidad_recibida, costo_unitario, recepciones!inner(fecha, tenant_id)')
    .eq('recepciones.tenant_id', tenant_id)
    .gte('recepciones.fecha', hace30str)
    .in('id_producto', idsProducto)

  const acc = {}
  ;(data || []).forEach(r => {
    const id    = r.id_producto
    const cant  = Number(r.cantidad_recibida) || 0
    const costo = Number(r.costo_unitario) || 0
    if (!cant || !costo) return
    if (!acc[id]) acc[id] = { sumCantCosto: 0, sumCant: 0, min: Infinity, max: -Infinity }
    acc[id].sumCantCosto += cant * costo
    acc[id].sumCant       += cant
    if (costo < acc[id].min) acc[id].min = costo
    if (costo > acc[id].max) acc[id].max = costo
  })

  const resultado = {}
  Object.entries(acc).forEach(([id, a]) => {
    const promedio  = a.sumCant ? a.sumCantCosto / a.sumCant : 0
    const variacion = promedio ? ((a.max - a.min) / promedio) * 100 : 0
    resultado[id] = { promedio, variacion }
  })
  return resultado
}

async function cargarDetalleReceta(receta) {
  const wrap = document.getElementById('receta-detalle-wrap')
  wrap.innerHTML = `<p style="color:var(--color-text-muted);margin-top:24px">Cargando receta...</p>`

  try {
    const tenant_id = await getTenantId()

    const [
      { data: ingredientes, error: errI },
      { data: pasos,        error: errP },
      { data: productos,    error: errPr }
    ] = await Promise.all([
      window._db.from('receta_ingredientes')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id_receta', receta.id_receta)
        .neq('activo', false)
        .order('orden', { ascending: true, nullsFirst: false }),
      window._db.from('receta_procedimientos')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id_receta', receta.id_receta)
        .neq('activo', false)
        .order('paso_num'),
      window._db.from('productos')
        .select('id_producto, unidad_medida')
        .eq('tenant_id', tenant_id)
        .eq('activo', true)
    ])

    if (errI) throw errI
    if (errP) throw errP

    const ingSinCantidad = (ingredientes || []).filter(i => i.cantidad === null || i.cantidad === '' || i.cantidad === undefined)
    const hayCantidadFaltante = ingSinCantidad.length > 0

    // Índice de unidad por id_producto
    const unidadPorProducto = {}
    ;(productos || []).forEach(p => { unidadPorProducto[p.id_producto] = p.unidad_medida })

    // ── Costeo (solo superadmin / Ramiro, por ahora) ─────────────────────
    const esReventaCosteo = receta.tipo_receta === 'reventa'
    let costosPromedio = {}
    let costoTotalReceta = 0
    let ingredientesSinCosto = 0
    if (window._recPuedeVerCosteo && !esReventaCosteo && (ingredientes || []).length) {
      const idsIngredientes = [...new Set((ingredientes || []).map(i => i.id_producto).filter(Boolean))]
      costosPromedio = await _recCalcularCostosPromedio(tenant_id, idsIngredientes)
      ;(ingredientes || []).forEach(i => {
        const c = costosPromedio[i.id_producto]
        if (c && i.cantidad != null) {
          costoTotalReceta += Number(i.cantidad) * c.promedio
        } else {
          ingredientesSinCosto++
        }
      })
    }

    // ── Ingredientes (unidad desde catálogo) ─────────────────────────────
    const htmlIngredientes = `
      <div class="tabla-wrapper">
        <table class="tabla">
          <thead>
            <tr>
              <th>Ingrediente</th>
              <th>Cantidad</th>
              <th>Unidad</th>
              <th>Nota</th>
              ${window._recPuedeVerCosteo && !esReventaCosteo ? `
              <th style="text-align:right">Costo/unidad (prom. 30d)</th>
              <th style="text-align:right">Variación</th>
              <th style="text-align:right">Subtotal</th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${(ingredientes || []).map(i => {
              const c = costosPromedio[i.id_producto]
              const subtotal = c && i.cantidad != null ? Number(i.cantidad) * c.promedio : null
              return `
              <tr>
                <td>${i.producto || ''}</td>
                <td>${i.cantidad != null ? i.cantidad : ''}</td>
                <td style="color:var(--color-text-muted)">${unidadPorProducto[i.id_producto] || ''}</td>
                <td style="color:var(--color-text-muted);font-size:12px">${i.notas_ingrediente || ''}</td>
                ${window._recPuedeVerCosteo && !esReventaCosteo ? `
                <td style="text-align:right">${c ? '$' + formatNum(c.promedio) : '<span style="color:var(--color-text-muted)">—</span>'}</td>
                <td style="text-align:right${c && c.variacion > 15 ? ';color:#B85C2A;font-weight:600' : ''}">${c ? formatNum(c.variacion, 0) + '%' : '—'}</td>
                <td style="text-align:right;font-weight:600">${subtotal != null ? '$' + formatNum(subtotal) : '—'}</td>` : ''}
              </tr>`}).join('')}
          </tbody>
          ${window._recPuedeVerCosteo && !esReventaCosteo ? `
          <tfoot>
            <tr>
              <td colspan="6" style="text-align:right;font-weight:700;border-top:2px solid var(--color-border);padding-top:10px">Costo total de la receta</td>
              <td style="text-align:right;font-weight:700;color:var(--color-primary);border-top:2px solid var(--color-border);padding-top:10px">$${formatNum(costoTotalReceta)}</td>
            </tr>
          </tfoot>` : ''}
        </table>
        ${window._recPuedeVerCosteo && !esReventaCosteo && ingredientesSinCosto > 0 ? `
        <p style="font-size:11px;color:var(--color-text-muted);margin-top:6px">
          * ${ingredientesSinCosto} insumo${ingredientesSinCosto !== 1 ? 's' : ''} sin recepciones en los últimos 30 días — no se incluye en el total.
        </p>` : ''}
      </div>`

    // ── Procedimiento agrupado por sección ───────────────────────────────
    const steps = pasos || []
    let htmlPasos = ''

    if (steps.length > 0) {
      const secciones = []
      let seccionActual = null

      steps.forEach(p => {
        const sec = p.seccion || 'Procedimiento'
        if (sec !== seccionActual) {
          secciones.push({ nombre: sec, pasos: [] })
          seccionActual = sec
        }
        secciones[secciones.length - 1].pasos.push(p)
      })

      const mostrarEncabezados = secciones.length > 1

      htmlPasos = secciones.map(sec => `
        ${mostrarEncabezados ? `<h5 class="seccion-procedimiento">${sec.nombre}</h5>` : ''}
        <ol class="procedimiento" ${mostrarEncabezados ? 'style="margin-bottom:20px"' : ''}>
          ${sec.pasos.map(p => `<li>${limpiarPaso(p.proceso)}</li>`).join('')}
        </ol>
      `).join('')
    }

    // ── Notas adicionales ────────────────────────────────────────────────
    const htmlNotas = receta.notas_revision
      ? `<div class="solicitudes-texto">${receta.notas_revision}</div>`
      : `<p style="color:var(--color-text-muted);font-size:13px">Sin notas adicionales.</p>`

    // ── Reventa: sabores disponibles (solo RBE-004 Refresco) ─────────────
    const esReventa = receta.tipo_receta === 'reventa'

    let htmlSabores = ''
    if (esReventa) {
      const filtrosPorReceta = {
        'RBE-004': () => window._db.from('productos').select('producto')
          .eq('tenant_id', tenant_id).eq('activo', true).eq('grupo', 'Bebidas').eq('fuente', 'menu_charly')
          .not('id_producto', 'in', '(BEB-001,BEB-025,BEB-026,BEB-031,BEB-037)')
          .order('producto'),
        'RBE-005': () => window._db.from('productos').select('producto')
          .eq('tenant_id', tenant_id).eq('activo', true)
          .in('id_producto', ['BEB-031']),
        'RBE-006': () => window._db.from('productos').select('producto')
          .eq('tenant_id', tenant_id).eq('activo', true)
          .in('id_producto', ['BEB-026'])
      }

      const titulo = {
        'RBE-004': 'Sabores disponibles',
        'RBE-005': 'Marca',
        'RBE-006': 'Marca'
      }

      const fetcher = filtrosPorReceta[receta.id_receta]
      if (fetcher) {
        const { data: opciones } = await fetcher()
        htmlSabores = `
          <h4>${titulo[receta.id_receta] || 'Opciones disponibles'}</h4>
          <ul class="procedimiento">
            ${(opciones || []).map(s => `<li>${s.producto}</li>`).join('')}
          </ul>
        `
      }
    }

    // ── Foto ──────────────────────────────────────────────────────────────
    let fotoUrl = null
    if (receta.foto_url) {
      const { data } = window._db.storage.from('recetas').getPublicUrl(receta.foto_url)
      fotoUrl = data?.publicUrl || null
    }

    const htmlFoto = `
      <div class="receta-foto-wrap">
        ${fotoUrl
          ? `<img src="${fotoUrl}" class="receta-foto" alt="${receta.nombre_platillo}">`
          : (window._recPuedeEditar ? `<div class="receta-foto-placeholder">Sin foto todavía</div>` : '')}
        ${window._recPuedeEditar ? `
          <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
            <input type="file" accept="image/*" id="receta-foto-input-${receta.id_receta}" style="display:none" onchange="subirFotoReceta('${receta.id_receta}', this)">
            <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="document.getElementById('receta-foto-input-${receta.id_receta}').click()">
              ${fotoUrl ? 'Cambiar foto' : '📷 Subir foto'}
            </button>
            <span id="receta-foto-msg-${receta.id_receta}" style="font-size:12px;color:#3A8C3E"></span>
          </div>` : ''}
      </div>`

    wrap.innerHTML = `
      <div class="receta-detalle-card">
        <div class="detalle-header">
          <div>
            <h3>${receta.nombre_platillo}</h3>
            <p class="detalle-categoria">${receta.categoria || ''}</p>
          </div>
        </div>

        ${htmlFoto}

        ${!esReventa ? `
          ${hayCantidadFaltante ? `
          <div class="banner-aviso">
            ⚠ Esta receta tiene ${ingSinCantidad.length} ingrediente${ingSinCantidad.length > 1 ? 's' : ''} sin cantidad capturada.
          </div>` : ''}

          <div class="receta-detalle-grid">
            <div>
              <h4>Ingredientes</h4>
              ${htmlIngredientes}
            </div>
            <div>
              <h4>Procedimiento</h4>
              ${htmlPasos}
              <h4>Notas adicionales</h4>
              ${htmlNotas}
            </div>
          </div>
        ` : `
          ${htmlSabores}
          <h4>Notas adicionales</h4>
          ${htmlNotas}
        `}
      </div>
    `

  } catch (err) {
    wrap.innerHTML = `<p style="margin-top:24px;color:var(--color-highlight)">Error al cargar receta: ${err.message}</p>`
  }
}

window.subirFotoReceta = async function(idReceta, inputEl) {
  const file = inputEl.files && inputEl.files[0]
  if (!file) return
  const msg = document.getElementById(`receta-foto-msg-${idReceta}`)
  if (msg) { msg.style.color = 'var(--color-text-muted)'; msg.textContent = 'Subiendo...' }

  try {
    const tenant_id = await getTenantId()
    const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${tenant_id}/${idReceta}.${ext}`

    const { error: upErr } = await window._db.storage.from('recetas').upload(path, file, { upsert: true })
    if (upErr) throw upErr

    const { error: dbErr } = await window._db.from('catalogo_recetas')
      .update({ foto_url: path, updated_at: new Date().toISOString() })
      .eq('id_receta', idReceta)
      .eq('tenant_id', tenant_id)
    if (dbErr) throw dbErr

    const receta = (window._recetas || []).find(r => r.id_receta === idReceta)
    if (receta) receta.foto_url = path

    if (msg) { msg.style.color = '#3A8C3E'; msg.textContent = '✓ Guardado' }
    if (receta) cargarDetalleReceta(receta)
  } catch (err) {
    if (msg) { msg.style.color = '#B85C2A'; msg.textContent = 'Error: ' + err.message }
  }
}

function limpiarPaso(texto) {
  if (!texto) return ''
  return texto.replace(/^Paso\s+\d+\s*[—\-:]\s*/i, '').trim()
}
