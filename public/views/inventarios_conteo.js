const IC_MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function icDiaLabel(fechaStr) {
  const d  = new Date(fechaStr + 'T12:00:00')
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const aa = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${aa}`
}

function icMesLabel(mesStr) {
  const [year, month] = mesStr.split('-')
  return `${IC_MESES_NOMBRES[Number(month)-1]} ${year}`
}

// ── Vista: Inventario Físico (conteos) ───────────────────────────────────────
async function vistaInventariosConteo() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando inventarios...</p>`

  try {
    const tenant_id = await getTenantId()

    const [{ data: inventarios, error }, { count: totalActivos }] = await Promise.all([
      window._db
        .from('inventarios')
        .select('id, fecha, estado, creado_por')
        .eq('tenant_id', tenant_id)
        .order('fecha', { ascending: false }),
      window._db
        .from('productos')
        .select('id_producto', { count: 'exact', head: true })
        .eq('tenant_id', tenant_id)
        .eq('activo', true)
    ])

    if (error) throw error

    const ids = (inventarios || []).map(i => i.id)
    let itemsCounts = {}
    if (ids.length > 0) {
      const { data: counts } = await window._db
        .from('inventario_items')
        .select('id_inventario')
        .in('id_inventario', ids)
      ;(counts || []).forEach(r => {
        itemsCounts[r.id_inventario] = (itemsCounts[r.id_inventario] || 0) + 1
      })
    }

    const nombresMap = {}
    try {
      const { data: users } = await window._db.rpc('get_usuarios_nombres')
      if (users) users.forEach(u => { if (u.email) nombresMap[u.email] = u.nombre_corto })
    } catch (e) {}

    const formatCreadoPor = (val) => {
      if (!val) return '—'
      return nombresMap[val] || val.split('@')[0]
    }

    const estadoBadge = {
      borrador: 'background:rgba(200,137,42,0.15);color:#c8892a',
      completo: 'background:rgba(76,153,80,0.12);color:#3A8C3E'
    }

    const porMes = {}
    ;(inventarios || []).forEach(inv => {
      const mes = inv.fecha.slice(0, 7)
      if (!porMes[mes]) porMes[mes] = []
      porMes[mes].push(inv)
    })
    const meses = Object.keys(porMes).sort().reverse()

    const accordionHTML = !meses.length
      ? `<p style="color:var(--color-text-muted);text-align:center;padding:24px">Sin inventarios registrados aún.</p>`
      : meses.map((mes, idx) => `
        <div class="ic-mes-grupo${idx === 0 ? ' open' : ''}" style="border:1px solid var(--color-border);border-radius:8px;margin-bottom:8px;overflow:hidden">
          <div class="ic-mes-header" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;background:var(--color-surface);user-select:none" onclick="this.parentElement.classList.toggle('open')">
            <span style="font-weight:600">${icMesLabel(mes)}</span>
            <span style="font-size:12px;color:var(--color-text-muted)">${porMes[mes].length} conteo${porMes[mes].length === 1 ? '' : 's'}</span>
          </div>
          <div class="ic-mes-body" style="display:none">
            <table class="tabla" style="margin:0;border-radius:0;border-top:1px solid var(--color-border)">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th style="text-align:right">Items</th>
                  <th>Creado por</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                ${porMes[mes].map(inv => `
                  <tr style="cursor:pointer" onclick="verDetalleInventario('${inv.id}')">
                    <td>${icDiaLabel(inv.fecha)}</td>
                    <td style="text-align:right;font-weight:600">${itemsCounts[inv.id] || 0}/${totalActivos || 0}</td>
                    <td style="font-size:12px;color:var(--color-text-muted)">${formatCreadoPor(inv.creado_por)}</td>
                    <td><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;${estadoBadge[inv.estado]||''}">${inv.estado || 'borrador'}</span></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`).join('')

    content.innerHTML = `
      <style>
        .ic-mes-grupo.open .ic-mes-body { display:block !important }
        .ic-mes-header:hover { opacity:.85 }
      </style>
      <div class="vista-header">
        <h2>📋 Conteos</h2>
        <button class="btn-accion btn-aprobar" onclick="mostrarFormLevantamiento()">+ Nuevo levantamiento</button>
      </div>
      <div id="lev-wrap"></div>
      <div id="inv-conteo-detalle"></div>
      <div id="inv-conteo-tabla-wrap" class="card-surface" style="padding:16px">
        ${accordionHTML}
      </div>
    `
  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function icBadge(contados, total, size) {
  const ok = contados === total && total > 0
  const fs = size || 11
  return `<span style="padding:2px 10px;border-radius:20px;font-size:${fs}px;font-weight:700;${ok ? 'background:rgba(76,153,80,0.15);color:#3A8C3E' : 'background:rgba(200,137,42,0.15);color:#c8892a'}">${contados}/${total}</span>`
}

async function verDetalleInventario(idInventario) {
  const tablaWrap = document.getElementById('inv-conteo-tabla-wrap')
  if (tablaWrap) tablaWrap.style.display = 'none'
  const tenant_id = await getTenantId()
  const wrap = document.getElementById('inv-conteo-detalle')
  if (wrap) wrap.innerHTML = `<p style="color:var(--color-text-muted)">Cargando conteo...</p>`

  try {
    const [
      { data: inv },
      { data: items },
      { data: productos },
      { data: proveedores }
    ] = await Promise.all([
      window._db.from('inventarios').select('*').eq('id', idInventario).single(),
      window._db.from('inventario_items').select('*').eq('id_inventario', idInventario),
      window._db.from('productos').select('id_producto, producto, unidad_medida, grupo, id_proveedor_preferencial').eq('tenant_id', tenant_id).eq('activo', true),
      window._db.from('proveedores').select('id_proveedor, nombre_corto').eq('tenant_id', tenant_id)
    ])

    if (!inv) { if (wrap) wrap.innerHTML = ''; return }

    const prodMap = {}
    ;(productos || []).forEach(p => { prodMap[p.id_producto] = p })

    const provMap = {}
    ;(proveedores || []).forEach(p => { provMap[p.id_proveedor] = p.nombre_corto })

    // Total productos activos por grupo (catálogo completo)
    const totalPorGrupo = {}
    ;(productos || []).forEach(p => {
      const g = p.grupo || 'Sin grupo'
      totalPorGrupo[g] = (totalPorGrupo[g] || 0) + 1
    })

    // Construir filas a partir del catálogo completo (left-join con inventario_items)
    const itemMap = {}
    ;(items || []).forEach(item => { itemMap[item.id_producto] = item })

    const filas = (productos || []).map(prod => {
      const item = itemMap[prod.id_producto]
      return {
        nombre:     prod.producto || prod.id_producto,
        unidad:     prod.unidad_medida || '',
        grupo:      prod.grupo || 'Sin grupo',
        contado:    item && item.cantidad_contada != null ? Number(item.cantidad_contada) : null,
        proveedor:  provMap[prod.id_proveedor_preferencial] || '—'
      }
    })

    // Agrupar por grupo
    const grupos = {}
    filas.forEach(f => {
      if (!grupos[f.grupo]) grupos[f.grupo] = []
      grupos[f.grupo].push(f)
    })

    // Ordenar dentro de cada grupo: mayor contado primero; 0/null al final; empates por nombre
    Object.values(grupos).forEach(arr => {
      arr.sort((a, b) => {
        const av = a.contado, bv = b.contado
        const aZero = av == null || av === 0
        const bZero = bv == null || bv === 0
        if (aZero && bZero) return a.nombre.localeCompare(b.nombre)
        if (aZero) return 1
        if (bZero) return -1
        return bv - av
      })
    })

    const GRUPO_META = {
      'Carnes y Proteínas': { orden: 1, emoji: '🥩', color: '#B85C2A' },
      'Lácteos y Quesos':   { orden: 2, emoji: '🧀', color: '#6A9BB5' },
      'Verduras y Frescos': { orden: 3, emoji: '🥬', color: '#4A7A3A' },
      'Despensa':           { orden: 4, emoji: '🥫', color: '#C8892A' },
      'Subrecetas':         { orden: 5, emoji: '⚗️', color: '#8A5FB0' },
      'Bebidas':            { orden: 6, emoji: '🥤', color: '#3D9BA8' },
      'Desechables':        { orden: 7, emoji: '🗑️', color: '#9B7B6A' }
    }
    const metaDefault = { orden: 99, emoji: '📦', color: '#9B7B6A' }

    // Orden de grupos por GRUPO_META, grupos desconocidos al final
    const grupoNames = Object.keys(grupos).sort((a, b) => {
      const ma = GRUPO_META[a] || metaDefault
      const mb = GRUPO_META[b] || metaDefault
      return ma.orden - mb.orden
    })

    const SECCION_2_GRUPOS = ['Subrecetas', 'Bebidas', 'Desechables']
    const seccion1 = grupoNames.filter(g => !SECCION_2_GRUPOS.includes(g))
    const seccion2 = grupoNames.filter(g => SECCION_2_GRUPOS.includes(g))

    function renderGrupo(g) {
      const arr      = grupos[g]
      const contados = arr.filter(f => f.contado != null && f.contado > 0).length
      const total    = totalPorGrupo[g] || arr.length
      const meta     = GRUPO_META[g] || metaDefault

      return `
        <div class="ic-grupo" data-grupo="${g.replace(/"/g,'&quot;')}"
          style="border:1px solid var(--color-border);border-left:4px solid ${meta.color};border-radius:8px;margin-bottom:8px;overflow:hidden">
          <div class="ic-grupo-header"
            style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;background:var(--color-surface);user-select:none"
            onclick="this.parentElement.classList.toggle('open')">
            <span style="font-weight:600">${meta.emoji} ${g}</span>
            ${icBadge(contados, total)}
          </div>
          <div class="ic-grupo-body" style="display:none">
            <table class="tabla" style="margin:0;border-radius:0;border-top:1px solid var(--color-border)">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th style="text-align:right">Cantidad contada</th>
                  <th class="ic-col-meta">Unidad</th>
                  <th class="ic-col-meta">Proveedor</th>
                </tr>
              </thead>
              <tbody>
                ${arr.map(f => `
                  <tr>
                    <td>${f.nombre}</td>
                    <td style="text-align:right;font-weight:600">${f.contado != null ? formatInt(f.contado) : '—'}</td>
                    <td class="ic-col-meta">${f.unidad}</td>
                    <td class="ic-col-meta">${f.proveedor}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`
    }

    function subtotal(nombresGrupos) {
      let c = 0, t = 0
      nombresGrupos.forEach(g => {
        c += grupos[g].filter(f => f.contado != null && f.contado > 0).length
        t += totalPorGrupo[g] || grupos[g].length
      })
      return { c, t }
    }
    const sub1 = subtotal(seccion1)
    const sub2 = subtotal(seccion2)
    const granTotal = { c: sub1.c + sub2.c, t: sub1.t + sub2.t }

    const accordionHTML = `
      <div style="margin-bottom:20px">
        ${seccion1.map(renderGrupo).join('')}
        <div style="display:flex;justify-content:flex-end;padding:6px 4px">Subtotal insumos ${icBadge(sub1.c, sub1.t, 12)}</div>
      </div>
      <div style="margin-bottom:12px">
        ${seccion2.map(renderGrupo).join('')}
        <div style="display:flex;justify-content:flex-end;padding:6px 4px">Subtotal ${icBadge(sub2.c, sub2.t, 12)}</div>
      </div>
      <div style="display:flex;justify-content:flex-end;padding:10px 4px;border-top:1px solid var(--color-border);font-weight:700">Total ${icBadge(granTotal.c, granTotal.t, 13)}</div>
    `

    if (wrap) wrap.innerHTML = `
      <style>
        .ic-grupo.open .ic-grupo-body { display:block !important }
        .ic-grupo-header:hover { opacity:.85 }
      </style>
      <div class="receta-detalle-card" style="margin-bottom:24px">
        <div class="detalle-header">
          <div>
            <h3>Conteo — ${inv.fecha}</h3>
          </div>
          <button class="btn-accion" style="border:1px solid var(--color-border)"
            onclick="
              document.getElementById('inv-conteo-tabla-wrap').style.display='';
              document.getElementById('inv-conteo-detalle').innerHTML=''
            ">Cerrar</button>
        </div>

        <input type="text" id="ic-buscador" placeholder="Buscar insumo..."
          style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text);font-size:14px;margin:16px 0"
          oninput="_icBuscar(this.value)">

        <div id="ic-grupos">${accordionHTML}</div>
        <div id="ic-lista-plana" style="display:none"></div>
      </div>
    `

    // Guardar filas para búsqueda
    window._icFilas = filas

    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (err) {
    if (wrap) wrap.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function _icBuscar(q) {
  const grupos = document.getElementById('ic-grupos')
  const lista  = document.getElementById('ic-lista-plana')
  if (!grupos || !lista) return

  const term = q.trim().toLowerCase()
  if (!term) {
    grupos.style.display = ''
    lista.style.display  = 'none'
    lista.innerHTML      = ''
    return
  }

  grupos.style.display = 'none'

  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(escapedTerm, 'gi')

  const matches = (window._icFilas || []).filter(f => f.nombre.toLowerCase().includes(term))

  if (!matches.length) {
    lista.innerHTML = `<p style="color:var(--color-text-muted);padding:12px 0">Sin resultados.</p>`
  } else {
    lista.innerHTML = `
      <table class="tabla">
        <thead>
          <tr>
            <th>Insumo</th>
            <th style="text-align:right">Cantidad contada</th>
            <th class="ic-col-meta">Unidad</th>
            <th class="ic-col-meta">Proveedor</th>
          </tr>
        </thead>
        <tbody>
          ${matches.map(f => {
            const hl = f.nombre.replace(re, m => `<mark style="background:rgba(200,137,42,0.3);color:inherit;border-radius:2px">${m}</mark>`)
            return `
              <tr>
                <td>${hl}</td>
                <td style="text-align:right;font-weight:600">${f.contado != null ? formatInt(f.contado) : '—'}</td>
                <td class="ic-col-meta">${f.unidad}</td>
                <td class="ic-col-meta">${f.proveedor}</td>
              </tr>`
          }).join('')}
        </tbody>
      </table>`
  }
  lista.style.display = ''
}

// ── Levantamiento: captura de un nuevo conteo (antes vista aparte, ahora vive aquí) ─
function mostrarFormLevantamiento() {
  const tablaWrap = document.getElementById('inv-conteo-tabla-wrap')
  const detalleEl = document.getElementById('inv-conteo-detalle')
  if (tablaWrap) tablaWrap.style.display = 'none'
  if (detalleEl) detalleEl.innerHTML = ''

  const wrap = document.getElementById('lev-wrap')
  if (!wrap) return

  const hoy = new Date().toISOString().split('T')[0]

  wrap.innerHTML = `
    <div class="card-surface" style="padding:24px;margin-bottom:24px">

      <div id="lev-filtros" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:20px">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
          Fecha
          <input type="date" id="lev-fecha" value="${hoy}"
            style="padding:8px 12px;border:1.5px solid var(--color-border);border-radius:8px;background:var(--color-card);color:var(--color-text);font-size:15px">
        </label>
        <label style="display:none;flex-direction:column;gap:4px;font-size:13px">
          Clasificación
          <select id="lev-abc"
            style="padding:8px 12px;border:1.5px solid var(--color-border);border-radius:8px;background:var(--color-card);color:var(--color-text);font-size:15px">
            <option value="todos">Todos</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </label>
        <label style="display:none;flex-direction:column;gap:4px;font-size:13px">
          Área
          <input type="text" id="lev-area" placeholder="Opcional"
            style="padding:8px 12px;border:1.5px solid var(--color-border);border-radius:8px;background:var(--color-card);color:var(--color-text);font-size:15px;width:140px">
        </label>
        <button id="lev-btn-cargar" class="btn-accion btn-aprobar" style="padding:9px 20px;font-size:14px">
          Cargar insumos →
        </button>
        <button id="lev-btn-cerrar-vista" class="btn-accion" style="border:1px solid var(--color-border);padding:9px 20px;font-size:14px"
          onclick="cerrarFormLevantamiento()">Cancelar</button>
      </div>

      <div id="lev-cuerpo" style="display:none">
        <!-- barra de búsqueda -->
        <div style="margin-bottom:12px">
          <input type="search" id="lev-search" placeholder="Buscar insumo…" autocomplete="off"
            style="width:100%;max-width:400px;padding:10px 14px;border:1.5px solid var(--color-border);border-radius:8px;background:var(--color-card);color:var(--color-text);font-size:15px">
        </div>

        <!-- pills de grupos -->
        <div id="lev-grupos-nav" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px"></div>

        <!-- progreso -->
        <div id="lev-progreso" style="font-size:13px;color:var(--color-text-muted);margin-bottom:12px"></div>

        <!-- lista -->
        <div id="lev-lista" style="padding-bottom:90px"></div>

        <!-- barra de acciones flotante -->
        <div id="lev-acciones-flotantes" style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:12px;background:var(--color-card);padding:10px 16px;border-radius:50px;box-shadow:0 4px 20px rgba(0,0,0,0.15);z-index:200;border:1px solid var(--color-border)">
          <button id="lev-btn-cancelar" title="Cancelar"
            style="width:44px;height:44px;border-radius:50%;border:1px solid var(--color-border);background:transparent;color:var(--color-text-muted);font-size:18px;cursor:pointer">✕</button>
          <button id="lev-btn-borrador" title="Guardar avance"
            style="width:44px;height:44px;border-radius:50%;border:2px solid var(--color-primary);background:var(--color-card);color:var(--color-primary);font-size:18px;cursor:pointer">💾</button>
          <button id="lev-btn-guardar-cerrar" title="Confirmar y enviar"
            style="width:44px;height:44px;border-radius:50%;border:none;background:var(--color-primary);color:#FAF7F2;font-size:18px;cursor:pointer">✓</button>
        </div>
      </div>

      <div id="lev-confirm" style="display:none;max-width:420px;text-align:center;padding:40px 24px;margin:0 auto;background:var(--color-card);border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
        <div style="font-size:52px;margin-bottom:16px">✅</div>
        <h3 id="lev-confirm-titulo" style="font-size:20px;margin-bottom:8px">Inventario cerrado</h3>
        <p id="lev-confirm-msg" style="color:var(--color-text-muted);font-size:15px"></p>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:20px">
          <button id="lev-btn-nuevo"
            style="padding:12px 22px;background:var(--color-primary);color:#FAF7F2;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer">
            Nuevo levantamiento
          </button>
          <button id="lev-btn-volver-conteos"
            style="padding:12px 22px;background:transparent;color:var(--color-text);border:1px solid var(--color-border);border-radius:10px;font-size:14px;font-weight:600;cursor:pointer">
            Ver en Conteos
          </button>
        </div>
      </div>

      <p id="lev-err" style="color:var(--color-highlight);margin-top:8px"></p>
    </div>
  `

  // Estado interno de la vista
  let levInsumos      = []
  let levInventarioId = null
  let levGrupoActivo  = 'todos'
  let levValores      = {}
  let levGrupos       = []

  const errEl = () => document.getElementById('lev-err')

  // ── Cargar insumos ──────────────────────────────────────────────────────────
  document.getElementById('lev-btn-cargar').addEventListener('click', async () => {
    errEl().textContent = ''
    const fecha = document.getElementById('lev-fecha').value
    if (!fecha) { errEl().textContent = 'Selecciona una fecha'; return }

    try {
      const tenant_id = await getTenantId()
      const abc       = document.getElementById('lev-abc').value

      let q = window._db.from('productos')
        .select('id_producto, producto, unidad_medida, clasificacion_abc, grupo')
        .eq('tenant_id', tenant_id)
        .eq('activo', true)
        .order('clasificacion_abc')
        .order('producto')

      if (abc !== 'todos') q = q.eq('clasificacion_abc', abc)

      const { data: productos, error } = await q
      if (error) throw error

      levInsumos      = productos || []
      levInventarioId = null
      levGrupoActivo  = 'todos'
      levValores      = {}
      levGrupos       = [...new Set(levInsumos.map(p => p.grupo || 'Sin grupo'))]

      document.getElementById('lev-filtros').style.display = 'none'
      document.getElementById('lev-cuerpo').style.display  = ''

      renderGruposNav()
      renderLista(insumosVisibles())
      actualizarProgreso()
    } catch (e) {
      errEl().textContent = 'Error: ' + e.message
    }
  })

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function esCaptured(id) {
    const input = document.getElementById('lev-qty-' + id)
    const v = input ? input.value : levValores[id]
    return v !== '' && v != null && !isNaN(parseFloat(v))
  }

  function insumosVisibles() {
    const texto = document.getElementById('lev-search')?.value.toLowerCase().trim() || ''
    return levInsumos.filter(p => {
      const enGrupo = levGrupoActivo === 'todos' || (p.grupo || 'Sin grupo') === levGrupoActivo
      const enTexto = !texto || p.producto.toLowerCase().includes(texto)
      return enGrupo && enTexto
    })
  }

  function guardarValoresDom() {
    levInsumos.forEach(p => {
      const inp = document.getElementById('lev-qty-' + p.id_producto)
      if (inp) levValores[p.id_producto] = inp.value
    })
  }

  function actualizarProgreso() {
    const cap   = levInsumos.filter(p => esCaptured(p.id_producto)).length
    const total = levInsumos.length
    const el = document.getElementById('lev-progreso')
    if (el) el.textContent = `${cap} de ${total} insumos capturados`
  }

  // ── Render grupos nav ────────────────────────────────────────────────────────
  function renderGruposNav() {
    const nav = document.getElementById('lev-grupos-nav')
    if (!nav) return

    const mkPill = (label, val, count, cap) => {
      const activo = levGrupoActivo === val ? `background:var(--color-primary);color:#FAF7F2;border-color:var(--color-primary)` : `background:var(--color-card);color:var(--color-text)`
      return `<button onclick="window._levFiltrarGrupo(${JSON.stringify(val)})"
        style="padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;border:1.5px solid var(--color-border);white-space:nowrap;${activo}">
        ${label} <span style="opacity:0.65;font-weight:400">${cap}/${count}</span>
      </button>`
    }

    const todosCap = levInsumos.filter(p => esCaptured(p.id_producto)).length
    let html = mkPill('Todos', 'todos', levInsumos.length, todosCap)
    levGrupos.forEach(g => {
      const items = levInsumos.filter(p => (p.grupo || 'Sin grupo') === g)
      const cap   = items.filter(p => esCaptured(p.id_producto)).length
      html += mkPill(g, g, items.length, cap)
    })
    nav.innerHTML = html
  }

  // ── Render lista ─────────────────────────────────────────────────────────────
  function renderLista(insumos) {
    const lista = document.getElementById('lev-lista')
    if (!lista) return

    if (!insumos.length) {
      lista.innerHTML = `<p style="color:var(--color-text-muted);text-align:center;padding:24px 0">Sin insumos para mostrar.</p>`
      return
    }

    const porGrupo = {}
    insumos.forEach(p => {
      const g = p.grupo || 'Sin grupo'
      if (!porGrupo[g]) porGrupo[g] = []
      porGrupo[g].push(p)
    })

    lista.innerHTML = Object.entries(porGrupo).map(([grupo, items]) => {
      const cap = items.filter(p => esCaptured(p.id_producto)).length
      const gKey = grupo.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')
      return `
        <div style="margin-bottom:4px">
          <div style="padding:7px 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--color-text-muted);display:flex;justify-content:space-between">
            <span>${grupo}</span>
            <span id="lev-gc-${gKey}" style="color:var(--color-primary)">${cap}/${items.length}</span>
          </div>
          ${items.map(p => {
            const captured = esCaptured(p.id_producto)
            const borderColor = captured ? '#3A8C3E' : 'var(--color-border)'
            const bgCard = captured ? 'var(--color-secondary)' : 'var(--color-card)'
            return `
              <div id="lev-card-${p.id_producto}"
                style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--color-border);background:${bgCard}">
                <div style="flex:1;min-width:0">
                  <div style="font-size:15px;font-weight:600">${p.producto}</div>
                  ${p.clasificacion_abc ? `<div style="font-size:12px;color:var(--color-text-muted)">${p.clasificacion_abc}</div>` : ''}
                </div>
                <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0">
                  <input type="number" id="lev-qty-${p.id_producto}"
                    placeholder="—" min="0" step="any" inputmode="decimal"
                    value="${levValores[p.id_producto] ?? ''}"
                    style="width:88px;padding:10px 6px;border:2px solid ${borderColor};border-radius:8px;font-size:22px;font-weight:700;text-align:center;color:var(--color-primary);background:var(--color-card);-webkit-appearance:none"
                    oninput="window._levOnQty(${JSON.stringify(p.id_producto)}, ${JSON.stringify(grupo)}, this)">
                  <span style="font-size:11px;color:var(--color-text-muted)">${p.unidad_medida || ''}</span>
                </div>
              </div>`
          }).join('')}
        </div>`
    }).join('')
  }

  // ── Callbacks globales (necesarios para oninput en strings HTML) ─────────────
  window._levOnQty = function(id, grupo, input) {
    levValores[id] = input.value
    const card = document.getElementById('lev-card-' + id)
    const captured = input.value !== '' && !isNaN(parseFloat(input.value))
    if (card) card.style.background = captured ? 'var(--color-secondary)' : 'var(--color-card)'
    input.style.borderColor = captured ? '#3A8C3E' : 'var(--color-border)'
    // Actualizar contador del grupo
    const gKey = grupo.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')
    const items = levInsumos.filter(p => (p.grupo || 'Sin grupo') === grupo)
    const cap   = items.filter(p => esCaptured(p.id_producto)).length
    const gcEl  = document.getElementById('lev-gc-' + gKey)
    if (gcEl) gcEl.textContent = `${cap}/${items.length}`
    renderGruposNav()
    actualizarProgreso()
  }

  window._levFiltrarGrupo = function(grupo) {
    guardarValoresDom()
    levGrupoActivo = grupo
    const s = document.getElementById('lev-search')
    if (s) s.value = ''
    renderGruposNav()
    renderLista(insumosVisibles())
  }

  document.getElementById('lev-search').addEventListener('input', () => {
    guardarValoresDom()
    renderLista(insumosVisibles())
  })

  // ── Guardar ──────────────────────────────────────────────────────────────────
  async function guardar(cerrar) {
    const btnB = document.getElementById('lev-btn-borrador')
    const btnC = document.getElementById('lev-btn-guardar-cerrar')
    btnB.disabled = true; btnC.disabled = true
    btnB.title = 'Guardando…'; btnC.title = 'Guardando…'

    const fecha = document.getElementById('lev-fecha')?.value || new Date().toISOString().split('T')[0]
    const abc   = document.getElementById('lev-abc')?.value   || 'todos'
    const area  = document.getElementById('lev-area')?.value  || null

    try {
      const tenant_id = await getTenantId()

      if (!levInventarioId) {
        const { data: inv, error: errI } = await window._db.from('inventarios').insert({
          tenant_id,
          fecha,
          clasificacion: abc,
          area:          area || null,
          estado:        'borrador',
          creado_por:    window._email || null
        }).select('id').single()
        if (errI) throw errI
        levInventarioId = inv.id
      }

      guardarValoresDom()
      const rows = levInsumos.map(p => {
        const val = levValores[p.id_producto]
        if (val === '' || val == null) return null
        const cant = parseFloat(val)
        if (isNaN(cant)) return null
        return {
          id_inventario:          levInventarioId,
          tenant_id,
          id_producto:            p.id_producto,
          clasificacion_abc_snap: p.clasificacion_abc || null,
          cantidad_contada:       cant
        }
      }).filter(Boolean)

      // Borrar items anteriores y reinsertar
      await window._db.from('inventario_items').delete().eq('id_inventario', levInventarioId)
      if (rows.length > 0) {
        const { error: errR } = await window._db.from('inventario_items').insert(rows)
        if (errR) throw errR
      }

      if (cerrar) {
        const { error: errU } = await window._db.from('inventarios')
          .update({ estado: 'completo', updated_at: new Date().toISOString() })
          .eq('id', levInventarioId)
        if (errU) throw errU

        document.getElementById('lev-confirm-msg').textContent = `${rows.length} insumos registrados`
        document.getElementById('lev-cuerpo').style.display  = 'none'
        document.getElementById('lev-confirm').style.display = ''
      } else {
        btnB.title = 'Borrador guardado'
        setTimeout(() => {
          btnB.title = 'Guardar avance'
          btnC.title = 'Confirmar y enviar'
          btnB.disabled = false; btnC.disabled = false
        }, 1500)
      }
    } catch (e) {
      errEl().textContent = 'Error: ' + e.message
      btnB.disabled = false; btnC.disabled = false
      btnB.title = 'Guardar avance'
      btnC.title = 'Confirmar y enviar'
    }
  }

  document.getElementById('lev-btn-borrador').addEventListener('click', () => guardar(false))
  document.getElementById('lev-btn-guardar-cerrar').addEventListener('click', () => guardar(true))
  document.getElementById('lev-btn-cancelar').addEventListener('click', () => {
    if (!window.confirm('¿Cancelar el levantamiento? Se perderá el progreso no guardado.')) return
    cerrarFormLevantamiento()
  })

  // ── Nuevo levantamiento (reinicia el formulario sin salir de esta pantalla) ───
  document.getElementById('lev-btn-nuevo').addEventListener('click', () => {
    mostrarFormLevantamiento()
  })

  // ── Volver a Conteos (recarga la lista, ya con el levantamiento recién cerrado) ─
  document.getElementById('lev-btn-volver-conteos').addEventListener('click', () => {
    vistaInventariosConteo()
  })
}

function cerrarFormLevantamiento() {
  const wrap = document.getElementById('lev-wrap')
  if (wrap) wrap.innerHTML = ''
  const tablaWrap = document.getElementById('inv-conteo-tabla-wrap')
  if (tablaWrap) tablaWrap.style.display = ''
}
