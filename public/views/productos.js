const PR_GRUPO_META = {
  'Carnes y Proteínas': { orden: 1, emoji: '🥩', color: '#B85C2A' },
  'Lácteos y Quesos':   { orden: 2, emoji: '🧀', color: '#6A9BB5' },
  'Verduras y Frescos': { orden: 3, emoji: '🥬', color: '#4A7A3A' },
  'Despensa':           { orden: 4, emoji: '🥫', color: '#C8892A' },
  'Subrecetas':         { orden: 5, emoji: '⚗️', color: '#8A5FB0' },
  'Bebidas':            { orden: 6, emoji: '🥤', color: '#3D9BA8' },
  'Desechables':        { orden: 7, emoji: '🗑️', color: '#9B7B6A' }
}
const PR_META_DEFAULT = { orden: 99, emoji: '📦', color: '#9B7B6A' }
const PR_SECCION_2_GRUPOS = ['Subrecetas', 'Bebidas', 'Desechables', 'Empaque y Desechables']

function _prHighlight(texto, termino) {
  if (!termino) return texto
  const escaped = termino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(escaped, 'gi')
  return texto.replace(re, m => `<mark style="background:rgba(200,137,42,0.3);color:inherit;border-radius:2px">${m}</mark>`)
}

function _prBadge(n, size) {
  const fs = size || 12
  return `<span style="padding:2px 10px;border-radius:20px;font-size:${fs}px;font-weight:700;background:rgba(154,123,106,0.15);color:var(--color-text-muted)">${n}</span>`
}

async function vistaProductos() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando...</p>`

  try {
    const tenant_id = await getTenantId()
    const rol              = window._rol || 'operador'
    const puedeEditar      = ['admin', 'editor', 'cocina'].includes(rol)
    const puedeInvEditar   = ['superadmin', 'owner', 'gerente', 'admin', 'editor'].includes(rol)
    const mostrarAcciones  = puedeEditar || puedeInvEditar

    const _fuentes = (window.FUENTES_POR_TENANT[tenant_id] || []).map(f => f.fuente)
    const query = window._db.from('productos').select('*').eq('tenant_id', tenant_id).eq('activo', true).or('tipo.eq.Insumo,grupo.eq.Subrecetas').in('fuente', _fuentes).order('producto')

    const [
      { data: productos, error: errP },
      { data: unidades,  error: errU }
    ] = await Promise.all([
      query,
      window._db.from('catalogo_unidades').select('*').eq('tenant_id', tenant_id).order('nombre')
    ])

    if (errP) throw errP
    if (errU) console.warn('catalogo_unidades:', errU.message)

    window._productos = productos || []
    window._unidades  = unidades  || []

    const hayUnidades = window._unidades.length > 0

    const uOptsFor = (valorActual) => {
      if (!hayUnidades) return `<option value="${valorActual}">${valorActual || '—'}</option>`
      return window._unidades
        .map(u => { const v = u.nombre || u.unidad || u.id; return `<option value="${v}"${v === valorActual ? ' selected' : ''}>${v}</option>` })
        .join('')
    }

    content.innerHTML = `
      <div class="vista-header">
        <h2>🧂 Insumos y Subrecetas</h2>
      </div>

      <div class="filtros-bar">
        <input type="text" id="insumos-search" placeholder="Buscar insumo..." class="filtro-search" />
      </div>
      <div id="insumos-lista-wrap"></div>
    `

    const renderFilaProducto = (p, termino) => `
      <tr data-prod-id="${p.id_producto}">
        <td>${puedeEditar
          ? `<input type="text" class="edit-input" id="prod-nombre-${p.id_producto}"
                  value="${p.producto.replace(/"/g, '&quot;')}" style="width:100%">`
          : _prHighlight(p.producto, termino)}
        </td>
        <td>${puedeEditar
          ? `<select class="edit-select" id="prod-unidad-${p.id_producto}">
               <option value=""${!p.unidad_medida ? ' selected' : ''}>—</option>
               ${uOptsFor(p.unidad_medida || '')}
             </select>
             ${!p.unidad_medida ? '<span class="badge-faltante" title="Este insumo no tiene unidad definida">⚠ falta unidad</span>' : ''}`
          : (p.unidad_medida || `<span class="badge-faltante">⚠ falta unidad</span>`)}
        </td>
        ${mostrarAcciones ? `<td style="text-align:right;white-space:nowrap">
          ${puedeEditar ? `<button class="btn-fila btn-guardar-ing" onclick="guardarProducto('${p.id_producto}')">💾</button>` : ''}
          ${puedeInvEditar ? `<button class="btn-fila" style="margin-left:4px;background:rgba(200,137,42,0.12);color:#c8892a;border:1px solid rgba(200,137,42,0.3);border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer"
            onclick="toggleInventarioPanel('${p.id_producto}')">⚙ Inventario</button>` : ''}
        </td>` : ''}
      </tr>
      <tr id="inv-panel-${p.id_producto}" style="display:none">
        <td colspan="${mostrarAcciones ? 3 : 2}" style="padding:0">
          <div style="background:rgba(200,137,42,0.06);border:1px solid rgba(200,137,42,0.2);border-radius:8px;padding:16px;margin:4px 0">
            <div style="font-size:11px;font-weight:700;color:var(--color-accent);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Control de Inventario</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">
              <div>
                <label style="font-size:11px;color:var(--color-text-muted);display:block;margin-bottom:4px">Clasificación</label>
                <select class="edit-select" id="inv-abc-${p.id_producto}" style="width:100%">
                  <option value="A"${(p.clasificacion_abc||'A')==='A'?' selected':''}>A — Alta rotación</option>
                  <option value="B"${p.clasificacion_abc==='B'?' selected':''}>B — Media rotación</option>
                  <option value="C"${p.clasificacion_abc==='C'?' selected':''}>C — Baja rotación</option>
                </select>
              </div>
              <div>
                <label style="font-size:11px;color:var(--color-text-muted);display:block;margin-bottom:4px">Merma %</label>
                <input type="number" class="edit-input edit-num" id="inv-merma-${p.id_producto}"
                  value="${p.merma_porcentaje??0}" min="0" max="100" step="0.1" style="width:100%">
              </div>
              <div>
                <label style="font-size:11px;color:var(--color-text-muted);display:block;margin-bottom:4px">Stock máximo (${p.unidad_medida||'u'})</label>
                <input type="number" class="edit-input edit-num" id="inv-max-${p.id_producto}"
                  value="${p.stock_maximo??''}" min="0" step="any" placeholder="—" style="width:100%">
              </div>
              <div>
                <label style="font-size:11px;color:var(--color-text-muted);display:block;margin-bottom:4px">% de alerta</label>
                <input type="number" class="edit-input edit-num" id="inv-alerta-${p.id_producto}"
                  value="${p.stock_alerta_porcentaje??30}" min="0" max="100" step="1" style="width:100%">
              </div>
              <div>
                <label style="font-size:11px;color:var(--color-text-muted);display:block;margin-bottom:4px">Proveedor preferencial</label>
                <select class="edit-select" id="inv-prov-${p.id_producto}" style="width:100%">
                  <option value="">— Ninguno —</option>
                  ${(window._proveedoresCache||[]).map(pv=>`<option value="${pv.id_proveedor}"${p.id_proveedor_preferencial===pv.id_proveedor?' selected':''}>${pv.nombre}</option>`).join('')}
                </select>
              </div>
            </div>
            <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
              <button class="btn-accion btn-aprobar" style="font-size:12px;padding:5px 14px"
                onclick="guardarInventarioProducto('${p.id_producto}')">Guardar inventario</button>
              <span id="inv-msg-${p.id_producto}" style="font-size:12px;color:#3A8C3E"></span>
            </div>
          </div>
        </td>
      </tr>
    `

    const renderGrupo = (g, prods) => {
      const meta = PR_GRUPO_META[g] || PR_META_DEFAULT
      return `
        <div class="pr-grupo" data-grupo="${g.replace(/"/g,'&quot;')}"
          style="border:1px solid var(--color-border);border-left:4px solid ${meta.color};border-radius:8px;margin-bottom:8px;overflow:hidden">
          <div class="pr-grupo-header"
            style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;background:var(--color-surface);user-select:none"
            onclick="this.parentElement.classList.toggle('open')">
            <span style="font-weight:600">${meta.emoji} ${g}</span>
            <span style="font-size:12px;color:var(--color-text-muted)">${prods.length}</span>
          </div>
          <div class="pr-grupo-body" style="display:none">
            <table class="tabla" style="margin:0;border-radius:0;border-top:1px solid var(--color-border)">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Unidad</th>
                  ${mostrarAcciones ? '<th></th>' : ''}
                </tr>
              </thead>
              <tbody>${prods.map(p => renderFilaProducto(p, null)).join('')}</tbody>
            </table>
          </div>
        </div>`
    }

    const renderTabla = (filtrados, buscando, termino) => {
      const wrap = document.getElementById('insumos-lista-wrap')
      if (!filtrados.length) {
        wrap.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px">No hay insumos para mostrar.</p>`
        return
      }

      if (buscando) {
        wrap.innerHTML = `
          <div class="card-surface" style="padding:16px">
            <table class="tabla">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Unidad</th>
                  ${mostrarAcciones ? '<th></th>' : ''}
                </tr>
              </thead>
              <tbody>${filtrados.map(p => renderFilaProducto(p, termino)).join('')}</tbody>
            </table>
          </div>`
        return
      }

      const porGrupo = {}
      filtrados.forEach(p => {
        const g = p.grupo || 'Sin grupo'
        if (!porGrupo[g]) porGrupo[g] = []
        porGrupo[g].push(p)
      })
      const nombresGrupos = Object.keys(porGrupo).sort((a, b) => {
        const ma = PR_GRUPO_META[a] || PR_META_DEFAULT
        const mb = PR_GRUPO_META[b] || PR_META_DEFAULT
        return ma.orden - mb.orden
      })

      const seccion1 = nombresGrupos.filter(g => !PR_SECCION_2_GRUPOS.includes(g))
      const seccion2 = nombresGrupos.filter(g => PR_SECCION_2_GRUPOS.includes(g))
      const contarSeccion = (grs) => grs.reduce((acc, g) => acc + porGrupo[g].length, 0)
      const sub1 = contarSeccion(seccion1)
      const sub2 = contarSeccion(seccion2)

      wrap.innerHTML = `
        <style>
          .pr-grupo.open .pr-grupo-body { display:block !important }
          .pr-grupo-header:hover { opacity:.85 }
        </style>
        <div class="card-surface" style="padding:16px">
          <div style="margin-bottom:20px">
            ${seccion1.map(g => renderGrupo(g, porGrupo[g])).join('')}
            ${seccion1.length ? `<div style="display:flex;justify-content:flex-end;padding:6px 4px">Subtotal insumos ${_prBadge(sub1)}</div>` : ''}
          </div>
          <div style="margin-bottom:12px">
            ${seccion2.map(g => renderGrupo(g, porGrupo[g])).join('')}
            ${seccion2.length ? `<div style="display:flex;justify-content:flex-end;padding:6px 4px">Subtotal ${_prBadge(sub2)}</div>` : ''}
          </div>
          ${(seccion1.length && seccion2.length) ? `<div style="display:flex;justify-content:flex-end;padding:10px 4px;border-top:1px solid var(--color-border);font-weight:700">Total ${_prBadge(sub1 + sub2, 13)}</div>` : ''}
        </div>`
    }

    const aplicarFiltros = () => {
      const texto = document.getElementById('insumos-search')?.value.toLowerCase().trim() || ''
      if (!texto) return { lista: window._productos, buscando: false, termino: '' }
      return {
        lista: window._productos.filter(p => p.producto?.toLowerCase().includes(texto)),
        buscando: true,
        termino: texto
      }
    }

    // Cargar proveedores para el panel de inventario
    if (!window._proveedoresCache) {
      const { data: provs } = await window._db.from('proveedores')
        .select('id_proveedor, nombre').eq('tenant_id', tenant_id).eq('activo', true).order('nombre')
      window._proveedoresCache = provs || []
    }

    document.getElementById('insumos-search').addEventListener('input', () => {
      const { lista, buscando, termino } = aplicarFiltros()
      renderTabla(lista, buscando, termino)
    })

    const inicial = aplicarFiltros()
    renderTabla(inicial.lista, inicial.buscando, inicial.termino)

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

async function guardarProducto(idProducto) {
  const nombre    = document.getElementById(`prod-nombre-${idProducto}`)?.value?.trim()
  const unidad    = document.getElementById(`prod-unidad-${idProducto}`)?.value?.trim()
  const tenant_id = await getTenantId()
  if (!nombre) return
  let updated_by = null
  try {
    const { data: { user } } = await window._db.auth.getUser()
    updated_by = user?.email || null
  } catch (e) { console.error('getUser:', e) }
  const { error } = await window._db
    .from('productos')
    .update({ producto: nombre, unidad_medida: unidad || null, updated_by, updated_at: new Date().toISOString() })
    .eq('id_producto', idProducto)
    .eq('tenant_id', tenant_id)
  if (error) alert(`Error: ${error.message}`)
}

window.toggleInventarioPanel = function(idProducto) {
  const panel = document.getElementById(`inv-panel-${idProducto}`)
  if (!panel) return
  panel.style.display = panel.style.display === 'none' ? 'table-row' : 'none'
}

window.guardarInventarioProducto = async function(idProducto) {
  const tenant_id = await getTenantId()
  const abc       = document.getElementById(`inv-abc-${idProducto}`)?.value || 'A'
  const merma     = parseFloat(document.getElementById(`inv-merma-${idProducto}`)?.value) || 0
  const maxVal    = document.getElementById(`inv-max-${idProducto}`)?.value
  const alerta    = parseFloat(document.getElementById(`inv-alerta-${idProducto}`)?.value) || 30
  const provPref  = document.getElementById(`inv-prov-${idProducto}`)?.value || null
  const msg       = document.getElementById(`inv-msg-${idProducto}`)

  const { error } = await window._db.from('productos').update({
    clasificacion_abc:       abc,
    merma_porcentaje:        merma,
    stock_maximo:            maxVal ? parseFloat(maxVal) : null,
    stock_alerta_porcentaje: alerta,
    dias_cobertura:          null,
    id_proveedor_preferencial: provPref || null,
    updated_at: new Date().toISOString()
  }).eq('id_producto', idProducto).eq('tenant_id', tenant_id)

  if (error) {
    if (msg) { msg.style.color = '#B85C2A'; msg.textContent = 'Error: ' + error.message }
  } else {
    if (msg) {
      msg.style.color = '#3A8C3E'
      msg.textContent = '✓ Guardado'
      setTimeout(() => { if (msg) msg.textContent = '' }, 2000)
    }
    // actualizar cache local
    const prod = (window._productos||[]).find(p => p.id_producto === idProducto)
    if (prod) {
      prod.clasificacion_abc = abc; prod.merma_porcentaje = merma
      prod.stock_maximo = maxVal ? parseFloat(maxVal) : null
      prod.stock_alerta_porcentaje = alerta; prod.dias_cobertura = null
      prod.id_proveedor_preferencial = provPref || null
    }
  }
}

window.toggleSeccion = function(bodyId) {
  const body = document.getElementById(bodyId)
  const chev = document.getElementById('chev-' + bodyId)
  if (!body) return
  const open = body.style.display !== 'none'
  body.style.display = open ? 'none' : 'block'
  if (chev) chev.textContent = open ? '▸' : '▾'
}
