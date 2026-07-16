const REC_CAT_META = {
  furia: {
    'Hamburguesas':     { emoji: '🍔', color: '#B85C2A' },
    'Pollo':            { emoji: '🍗', color: '#C8892A' },
    'Acompañamientos':  { emoji: '🍟', color: '#4A7A3A' },
    'Bebidas':          { emoji: '🥤', color: '#3D9BA8' },
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

// Nombre a mostrar de una categoría (distinto del valor guardado en BD, cuando aplica)
const REC_CAT_LABEL = {
  furia: { 'Hamburguesas': 'Hamburguesas de Res' }
}

// Bloques de navegación (nivel superior a categoría). Tenants sin bloques definidos
// arrancan directo en categorías (comportamiento anterior).
const REC_BLOQUES = {
  furia: {
    'Carta':      { emoji: '📋', categorias: ['Hamburguesas', 'Pollo', 'Acompañamientos'] },
    'Producción': { emoji: '🏭', categorias: ['Bebidas', 'Subrecetas'] }
  }
}

// Subcategorías dentro de "Subrecetas" (por ahora solo furia)
const REC_SUBCAT_META = {
  'Aderezos y Salsas': { emoji: '🥫' },
  'Complementos':      { emoji: '🧩' }
}

// Tiles compuestas: una sola tarjeta con 2 botones que abren cada uno su propia receta
const REC_PARES = {
  'RAC-004': { par: 'RAC-007', titulo: 'Papas',   labelA: 'Clásicas', labelB: 'Chicas' },
  'RHB-011': { par: 'RAC-008', titulo: 'Tenders', labelA: 'Normal',   labelB: 'Chicos' }
}
const REC_PARES_SECUNDARIOS = new Set(Object.values(REC_PARES).map(p => p.par))

function _recCatMeta(tenant, categoria) {
  return (REC_CAT_META[tenant] || {})[categoria] || REC_CAT_DEFAULT
}

function _recCatLabel(tenant, categoria) {
  return (REC_CAT_LABEL[tenant] || {})[categoria] || categoria
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
    window._recSubcategoriaSel = null
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
  if (window._recNivel === 'subcategoria') return renderRecSubcategorias(wrap)
  if (window._recNivel === 'platillo')     return renderRecPlatillos(wrap)
  if (window._recNivel === 'detalle')      return renderRecDetalleNivel(wrap)
  renderRecCategorias(wrap)
}

function _recTileEmojiArriba(emoji, titulo, subtitulo, colorBorde, onclick, destacado) {
  return `
    <button class="rec-tile" style="border-left:4px solid ${colorBorde};text-align:center;position:relative" onclick="${onclick}">
      ${destacado ? '<span style="position:absolute;top:6px;right:8px;font-size:14px">⭐</span>' : ''}
      <div style="font-size:26px;margin-bottom:6px">${emoji}</div>
      <div class="rec-tile-titulo">${titulo}</div>
      ${subtitulo ? `<div class="rec-tile-sub">${subtitulo}</div>` : ''}
    </button>`
}

// ── Categorías, agrupadas visualmente en secciones (Carta / Producción) cuando aplica ─
function renderRecCategorias(wrap) {
  const fuentesDef = FUENTES_POR_TENANT[window._recTenantActual] || []
  const recetasVisibles = _recRecetasFiltradas()
  const bloques = REC_BLOQUES[window._recTenantActual]

  const porCategoria = {}
  recetasVisibles.forEach(r => {
    const c = r.categoria || 'Sin categoría'
    if (!porCategoria[c]) porCategoria[c] = []
    porCategoria[c].push(r)
  })

  const renderTiles = (listaCategorias) => {
    const cats = listaCategorias.filter(c => porCategoria[c])
    if (!cats.length) return ''
    return `
      <div class="rec-tiles-grid">
        ${cats.map(c => {
          const meta = _recCatMeta(window._recTenantActual, c)
          const label = _recCatLabel(window._recTenantActual, c)
          return _recTileEmojiArriba(
            meta.emoji, label, `${porCategoria[c].length} platillo${porCategoria[c].length === 1 ? '' : 's'}`,
            meta.color, `recIrPlatillos('${c.replace(/'/g,"\\'")}')`
          )
        }).join('')}
      </div>`
  }

  let cuerpoHtml = ''
  if (bloques) {
    cuerpoHtml = Object.entries(bloques).map(([nombreBloque, info]) => {
      const tilesHtml = renderTiles(info.categorias)
      if (!tilesHtml) return ''
      return `
        <div style="margin-bottom:28px">
          <h3 style="display:flex;align-items:center;gap:8px;font-size:15px;margin-bottom:14px;color:var(--color-text)">
            <span>${info.emoji}</span> ${nombreBloque}
          </h3>
          ${tilesHtml}
        </div>`
    }).join('')
  } else {
    const categoriasOrdenadas = Object.keys(porCategoria).sort((a, b) =>
      indicePrioridad(window._recTenantActual, a) - indicePrioridad(window._recTenantActual, b)
    )
    cuerpoHtml = renderTiles(categoriasOrdenadas)
  }

  wrap.innerHTML = `
    ${fuentesDef.length > 1 ? `
    <div class="filtros-bar" style="margin-bottom:16px">
      <select id="rec-f-fuente" class="filtro-select">
        <option value="">Todas las fuentes</option>
        ${fuentesDef.map(f => `<option value="${f.fuente}"${f.fuente === window._recFuenteSel ? ' selected' : ''}>${f.etiqueta}</option>`).join('')}
      </select>
    </div>` : ''}
    ${cuerpoHtml || `<p style="color:var(--color-text-muted);font-size:13px">No hay recetas para mostrar.</p>`}
  `

  const fFuente = document.getElementById('rec-f-fuente')
  if (fFuente) fFuente.addEventListener('change', () => {
    window._recFuenteSel = fFuente.value
    renderRecCategorias(wrap)
  })
}

// ── Nivel 3 (solo Subrecetas): Subcategorías ─────────────────────────────────
function renderRecSubcategorias(wrap) {
  const categoria = window._recCategoriaSel
  const meta = _recCatMeta(window._recTenantActual, categoria)
  const recetas = _recRecetasFiltradas().filter(r => (r.categoria || '') === categoria)

  const porSubcat = {}
  recetas.forEach(r => {
    const s = r.subcategoria || 'Complementos'
    if (!porSubcat[s]) porSubcat[s] = []
    porSubcat[s].push(r)
  })
  const subcats = Object.keys(porSubcat).sort((a, b) => a.localeCompare(b))

  wrap.innerHTML = `
    <button class="rec-volver-btn" onclick="recIrCategoriasDesdeSubcat()">← ${_recCatLabel(window._recTenantActual, categoria)}</button>
    <h3 style="margin:8px 0 12px">${meta.emoji} ${_recCatLabel(window._recTenantActual, categoria)}</h3>
    <div class="rec-tiles-grid">
      ${subcats.map(s => {
        const sMeta = REC_SUBCAT_META[s] || { emoji: '📦' }
        return _recTileEmojiArriba(
          sMeta.emoji, s, `${porSubcat[s].length} platillo${porSubcat[s].length === 1 ? '' : 's'}`,
          meta.color, `recIrPlatillosDeSubcat('${s.replace(/'/g,"\\'")}')`
        )
      }).join('')}
    </div>`
}

window.recIrCategoriasDesdeSubcat = function() {
  window._recNivel = 'categoria'
  window._recSubcategoriaSel = null
  renderRecetasNivel()
}

window.recIrPlatillosDeSubcat = function(subcategoria) {
  window._recNivel = 'platillo'
  window._recSubcategoriaSel = subcategoria
  renderRecetasNivel()
}

// ── Nivel 4: Platillos ────────────────────────────────────────────────────────
function renderRecPlatillos(wrap) {
  const categoria = window._recCategoriaSel
  const meta = _recCatMeta(window._recTenantActual, categoria)
  const esSubrecetas = categoria === 'Subrecetas' && window._recTenantActual === 'furia'

  let recetas = _recRecetasFiltradas().filter(r => (r.categoria || 'Sin categoría') === categoria)
  if (esSubrecetas) {
    const sub = window._recSubcategoriaSel || 'Complementos'
    recetas = recetas.filter(r => (r.subcategoria || 'Complementos') === sub)
  }
  recetas = recetas
    .filter(r => !REC_PARES_SECUNDARIOS.has(r.id_receta))
    .sort((a, b) => {
      const oa = a.orden == null ? 999 : a.orden
      const ob = b.orden == null ? 999 : b.orden
      if (oa !== ob) return oa - ob
      return a.nombre_platillo.localeCompare(b.nombre_platillo)
    })

  const volverLabel = esSubrecetas
    ? window._recSubcategoriaSel
    : _recCatLabel(window._recTenantActual, categoria)

  wrap.innerHTML = `
    <button class="rec-volver-btn" onclick="${esSubrecetas ? `recIrSubcategorias()` : `recIrCategorias()`}">← ${volverLabel}</button>
    <h3 style="margin:8px 0 12px">${meta.emoji} ${esSubrecetas ? window._recSubcategoriaSel : _recCatLabel(window._recTenantActual, categoria)}</h3>
    ${recetas.length ? `
    <div class="rec-tiles-grid">
      ${recetas.map(r => {
        const par = REC_PARES[r.id_receta]
        if (par) {
          const recetaB = (window._recetas || []).find(x => x.id_receta === par.par)
          return `
            <div class="rec-tile" style="padding:0;overflow:hidden;display:flex;flex-direction:column;text-align:center">
              <div style="padding:14px 12px 8px;font-weight:600">${par.titulo}</div>
              <div style="display:flex;border-top:1px solid var(--color-border)">
                <button onclick="recIrDetalle('${r.id_receta}')" style="flex:1;padding:12px 6px;border:none;border-right:1px solid var(--color-border);background:transparent;cursor:pointer;font-size:13px;font-weight:600;color:var(--color-text)">${par.labelA}</button>
                ${recetaB ? `<button onclick="recIrDetalle('${recetaB.id_receta}')" style="flex:1;padding:12px 6px;border:none;background:transparent;cursor:pointer;font-size:13px;font-weight:600;color:var(--color-text)">${par.labelB}</button>` : ''}
              </div>
            </div>`
        }
        return `
          <button class="rec-tile" style="border-left:4px solid ${meta.color};position:relative" onclick="recIrDetalle('${r.id_receta}')">
            <div class="rec-tile-badges">
              ${r.destacado ? '<span class="rec-badge-destacado">⭐</span>' : ''}
              ${r.colaboracion ? '<span class="rec-badge-colab">🤝</span>' : ''}
            </div>
            <div class="rec-tile-titulo">${r.nombre_platillo}</div>
          </button>`
      }).join('')}
    </div>` : `<p style="color:var(--color-text-muted);font-size:13px">Sin platillos en esta categoría.</p>`}
  `
}

window.recIrCategorias = function() {
  window._recNivel = 'categoria'
  window._recCategoriaSel = null
  window._recSubcategoriaSel = null
  window._recRecetaSel = null
  renderRecetasNivel()
}

window.recIrSubcategorias = function() {
  window._recNivel = 'subcategoria'
  window._recRecetaSel = null
  renderRecetasNivel()
}

window.recIrPlatillos = function(categoria) {
  const esSubrecetas = categoria === 'Subrecetas' && window._recTenantActual === 'furia'
  const recetasCategoria = _recRecetasFiltradas().filter(r => (r.categoria || '') === categoria)
  const haySubcats = esSubrecetas && recetasCategoria.some(r => r.subcategoria)

  window._recCategoriaSel = categoria
  window._recRecetaSel = null

  if (haySubcats) {
    window._recNivel = 'subcategoria'
    window._recSubcategoriaSel = null
  } else {
    window._recNivel = 'platillo'
    window._recSubcategoriaSel = null
  }
  renderRecetasNivel()
}

window.recIrDetalle = function(idReceta) {
  window._recNivel = 'detalle'
  window._recRecetaSel = idReceta
  renderRecetasNivel()
}

function renderRecDetalleNivel(wrap) {
  const receta = (window._recetas || []).find(r => String(r.id_receta) === String(window._recRecetaSel))
  const esSubrecetas = window._recCategoriaSel === 'Subrecetas' && window._recTenantActual === 'furia'
  const volverLabel = esSubrecetas
    ? (window._recSubcategoriaSel || 'Subrecetas')
    : _recCatLabel(window._recTenantActual, window._recCategoriaSel || '')

  wrap.innerHTML = `
    <button class="rec-volver-btn" onclick="${esSubrecetas ? 'recIrPlatillosDeSubcat(window._recSubcategoriaSel)' : `recIrPlatillos('${(window._recCategoriaSel || '').replace(/'/g,"\\'")}')`}">← ${volverLabel}</button>
    <div id="receta-detalle-wrap"></div>
  `
  if (receta) cargarDetalleReceta(receta)
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

// Resuelve el costo de TODO el árbol de ingredientes (incluyendo subrecetas anidadas)
// en lote por nivel de profundidad (breadth-first) en vez de un round-trip por
// ingrediente. Misma prioridad (compra real > subreceta), mismo criterio de
// "completo" y mismo manejo de ciclos que la versión secuencial anterior — solo
// cambia cómo se obtienen los datos (lote por nivel en vez de uno por uno).
async function _recResolverCostosIngredientes(tenant_id, ingredientes) {
  const cache = {}
  const nivel0 = [...new Set((ingredientes || []).filter(i => i.id_producto).map(i => i.id_producto))]
  if (!nivel0.length) return {}

  // Nombre de cada producto (para la resolución por nombre, paso 3), se va
  // completando conforme se descubren nuevos ingredientes en niveles más profundos.
  const nombrePorProducto = {}
  ;(ingredientes || []).forEach(i => {
    if (i.id_producto && nombrePorProducto[i.id_producto] === undefined) nombrePorProducto[i.id_producto] = i.producto
  })

  // Catálogo completo del tenant, una sola vez — reemplaza las 3 consultas
  // secuenciales por ingrediente de la versión anterior por comparación en memoria.
  const { data: catalogo } = await window._db
    .from('catalogo_recetas')
    .select('id_receta, nombre_platillo')
    .eq('tenant_id', tenant_id)
    .eq('activo', true)

  const idRecetaSet = new Set((catalogo || []).map(c => c.id_receta))
  const nombreAIdReceta = {}
  ;(catalogo || []).forEach(c => {
    const key = (c.nombre_platillo || '').toLowerCase()
    if (key && nombreAIdReceta[key] === undefined) nombreAIdReceta[key] = c.id_receta
  })

  // Misma prioridad y orden que _recBuscarIdReceta: 1) misma id, 2) contraparte
  // RSA-/RSR- con el mismo número, 3) por nombre exacto (case-insensitive).
  function resolverIdRecetaEnMemoria(idProducto, nombreProducto) {
    if (idRecetaSet.has(idProducto)) return idProducto
    const m = idProducto.match(/^(RSR|RSA)-(\d+)$/)
    if (m) {
      const candidato = (m[1] === 'RSR' ? 'RSA' : 'RSR') + '-' + m[2]
      if (idRecetaSet.has(candidato)) return candidato
    }
    if (nombreProducto) {
      const idPorNombre = nombreAIdReceta[nombreProducto.toLowerCase()]
      if (idPorNombre) return idPorNombre
    }
    return null
  }

  // ── Resolución por niveles (breadth-first) ──────────────────────────────
  const directCosts = {}    // id_producto -> { promedio, variacion } (costo por compra)
  const hijosDe = {}        // id_producto -> ingredientes de su subreceta (o [] si no aplica)
  const visitadosGlobal = new Set(nivel0) // evita re-consultar el mismo producto en dos niveles (mismo propósito que `visitados`)

  let nivelActual = nivel0
  while (nivelActual.length) {
    // (a) costo real por compras, en lote para todo el nivel — siempre tiene prioridad
    const costosDirectos = await _recCalcularCostosPromedio(tenant_id, nivelActual)
    Object.assign(directCosts, costosDirectos)

    // (b) sin compra directa: resolver su id_receta contra el catálogo ya cargado
    const sinCostoDirecto = nivelActual.filter(id => !costosDirectos[id])
    const idRecetaDeEsteProducto = {}
    const idRecetasDelNivel = new Set()
    sinCostoDirecto.forEach(id => {
      const idReceta = resolverIdRecetaEnMemoria(id, nombrePorProducto[id])
      idRecetaDeEsteProducto[id] = idReceta
      if (idReceta) idRecetasDelNivel.add(idReceta)
    })

    // (c) ingredientes de TODAS las subrecetas de este nivel, en una sola consulta
    const ingredientesPorReceta = {}
    if (idRecetasDelNivel.size) {
      const { data: subIngs } = await window._db
        .from('receta_ingredientes')
        .select('id_receta, id_producto, producto, cantidad')
        .eq('tenant_id', tenant_id)
        .in('id_receta', [...idRecetasDelNivel])
        .neq('activo', false)

      ;(subIngs || []).forEach(s => {
        if (!ingredientesPorReceta[s.id_receta]) ingredientesPorReceta[s.id_receta] = []
        ingredientesPorReceta[s.id_receta].push(s)
      })
    }

    // (d) los ingredientes recién descubiertos (no vistos aún) forman el siguiente nivel
    const siguienteNivel = new Set()
    sinCostoDirecto.forEach(id => {
      const idReceta = idRecetaDeEsteProducto[id]
      const hijos = idReceta ? (ingredientesPorReceta[idReceta] || []) : []
      hijosDe[id] = hijos
      hijos.forEach(h => {
        if (h.id_producto && !visitadosGlobal.has(h.id_producto)) {
          visitadosGlobal.add(h.id_producto)
          siguienteNivel.add(h.id_producto)
          if (nombrePorProducto[h.id_producto] === undefined) nombrePorProducto[h.id_producto] = h.producto
        }
      })
    })

    nivelActual = [...siguienteNivel]
  }

  // ── Agregación bottom-up: misma recursión/memoización/manejo de ciclos que
  //    antes, ahora resuelta en memoria (sin más consultas) contra lo ya cargado. ──
  function resolverCostoEnMemoria(idProducto, visitados) {
    if (cache[idProducto] !== undefined) return cache[idProducto]
    if (visitados.has(idProducto)) { cache[idProducto] = null; return null } // ciclo, no seguir

    visitados.add(idProducto)

    if (directCosts[idProducto]) {
      const r = { promedio: directCosts[idProducto].promedio, derivado: false }
      cache[idProducto] = r
      return r
    }

    const hijos = hijosDe[idProducto]
    if (!hijos || !hijos.length) { cache[idProducto] = null; return null }

    let sumaCosto = 0, sumaCantidad = 0, completo = true
    for (const sub of hijos) {
      const cant = Number(sub.cantidad) || 0
      sumaCantidad += cant
      if (!sub.id_producto) { completo = false; continue }
      const c = resolverCostoEnMemoria(sub.id_producto, visitados)
      if (c) sumaCosto += cant * c.promedio
      else   completo = false
    }

    const resultado = (completo && sumaCantidad > 0) ? { promedio: sumaCosto / sumaCantidad, derivado: true } : null
    cache[idProducto] = resultado
    return resultado
  }

  const resultado = {}
  ;(ingredientes || []).forEach(ing => {
    if (!ing.id_producto) return
    const c = resolverCostoEnMemoria(ing.id_producto, new Set())
    if (c) resultado[ing.id_producto] = c
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
      costosPromedio = await _recResolverCostosIngredientes(tenant_id, ingredientes || [])
      ;(ingredientes || []).forEach(i => {
        const c = costosPromedio[i.id_producto]
        if (c && i.cantidad != null) {
          costoTotalReceta += Number(i.cantidad) * c.promedio
        } else {
          ingredientesSinCosto++
        }
      })
    }

    // ── Ingredientes (unidad desde catálogo) + Costeo fusionado en la misma tabla ──
    const puedeVerCosteo = window._recPuedeVerCosteo && !esReventaCosteo && (ingredientes || []).length
    const htmlIngredientes = `
      <div class="tabla-wrapper">
        <table class="tabla">
          <thead>
            <tr>
              <th>Ingrediente</th>
              <th>Cantidad</th>
              <th>Unidad</th>
              ${puedeVerCosteo ? '<th style="text-align:right">Costo/unidad</th>' : ''}
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            ${(ingredientes || []).map(i => {
              const c = puedeVerCosteo ? costosPromedio[i.id_producto] : null
              return `
              <tr>
                <td>${i.producto || ''}${c && c.derivado ? ' <span style="font-size:10px;color:var(--color-text-muted)">(subreceta)</span>' : ''}</td>
                <td>${i.cantidad != null ? formatInt(i.cantidad) : ''}</td>
                <td style="color:var(--color-text-muted)">${unidadPorProducto[i.id_producto] || ''}</td>
                ${puedeVerCosteo ? `
                <td style="text-align:right">
                  ${c
                    ? `<span style="padding:2px 10px;border-radius:12px;background:var(--color-secondary);font-weight:600">$${formatNum(c.promedio)}</span>`
                    : `<span style="color:var(--color-text-muted)">—</span>`}
                </td>` : ''}
                <td style="color:var(--color-text-muted);font-size:12px">${i.notas_ingrediente || ''}</td>
              </tr>`
            }).join('')}
          </tbody>
          ${puedeVerCosteo ? `
          <tfoot>
            <tr>
              <td colspan="3" style="text-align:right;font-weight:700;border-top:2px solid var(--color-border);padding-top:12px">Costo total de la receta</td>
              <td style="text-align:right;font-weight:700;color:var(--color-primary);border-top:2px solid var(--color-border);padding-top:12px">$${formatNum(costoTotalReceta)}</td>
              <td style="border-top:2px solid var(--color-border);padding-top:12px"></td>
            </tr>
          </tfoot>` : ''}
        </table>
        ${puedeVerCosteo && ingredientesSinCosto > 0 ? `
        <p style="font-size:11px;color:var(--color-text-muted);margin-top:6px">
          * ${ingredientesSinCosto} insumo${ingredientesSinCosto !== 1 ? 's' : ''} sin costo disponible (sin recepciones recientes, o subreceta sin receta capturada) — no se incluye en el total.
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
          .eq('tenant_id', tenant_id).eq('activo', true).eq('grupo', 'Productos Coca Cola').eq('fuente', 'menu_charly')
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
            <button class="btn-accion" style="border:1px solid var(--color-border);background:var(--color-secondary)" onclick="document.getElementById('receta-foto-input-${receta.id_receta}').click()">
              ${fotoUrl ? 'Cambiar foto' : '📷 Subir foto'}
            </button>
            <span id="receta-foto-msg-${receta.id_receta}" style="font-size:12px;color:#3A8C3E"></span>
          </div>` : ''}
      </div>`

    wrap.innerHTML = `
      <div class="receta-detalle-card">
        <div class="detalle-header">
          <div>
            <h3>${receta.nombre_platillo}${receta.destacado ? ' ⭐' : ''}${receta.colaboracion ? ' <span class="rec-badge-colab-inline">🤝 Colab</span>' : ''}</h3>
            <p class="detalle-categoria">${_recCatLabel(window._recTenantActual, receta.categoria || '')}${receta.subcategoria ? ' · ' + receta.subcategoria : ''}</p>
          </div>
        </div>

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
              <h4>Foto</h4>
              ${htmlFoto}
            </div>
          </div>

          <div style="margin-top:28px">
            <h4>Procedimiento</h4>
            ${htmlPasos}
            <h4>Notas adicionales</h4>
            ${htmlNotas}
          </div>
        ` : `
          <div style="max-width:340px;margin-bottom:20px">${htmlFoto}</div>
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
