
async function vistaProductos() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando...</p>`

  try {
    const tenant_id = await getTenantId()
    const rol              = window._rol || 'operador'
    const puedeEditar      = ['admin', 'editor', 'cocina'].includes(rol)
    const puedeInvEditar   = ['superadmin', 'owner', 'gerente', 'admin', 'editor'].includes(rol)

    const tenantActual   = (window._tenantConfig?.nombre || '').toLowerCase()
    const fuentesDef     = window.FUENTES_POR_TENANT[tenantActual] || []

    const query = window._db.from('productos').select('*').eq('tenant_id', tenant_id).eq('activo', true).order('producto')

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

    const grupos  = [...new Set(window._productos.map(p => p.grupo).filter(Boolean))].sort()

    const uOptsFor = (valorActual) => {
      if (!hayUnidades) return `<option value="${valorActual}">${valorActual || '—'}</option>`
      return window._unidades
        .map(u => { const v = u.nombre || u.unidad || u.id; return `<option value="${v}"${v === valorActual ? ' selected' : ''}>${v}</option>` })
        .join('')
    }

    content.innerHTML = `
      <div class="vista-header">
        <h2>Insumos</h2>
        ${fuentesDef.length ? `
        <div class="export-bar">
          <select id="export-fuente" class="filtro-select">
            ${fuentesDef.map(f => `<option value="${f.fuente}">${f.etiqueta}</option>`).join('')}
          </select>
          <button id="btn-export-pdf" class="btn-primary">Exportar PDF</button>
        </div>` : ''}
      </div>

      <div class="filtros-bar">
        <input type="text" id="insumos-search" placeholder="Buscar insumo..." class="filtro-search" />
      </div>
      <div id="prod-pills-nav" style="display:flex;gap:8px;overflow-x:auto;padding:10px 0 4px;scrollbar-width:none;flex-wrap:nowrap"></div>
      <div id="insumos-lista-wrap"></div>
    `

    window._prodGrupoActivo = 'todos'

    const aplicarFiltros = () => {
      const texto = document.getElementById('insumos-search')?.value.toLowerCase() || ''
      return window._productos.filter(p => {
        const matchTexto = !texto || p.producto?.toLowerCase().includes(texto)
        const matchGrupo = window._prodGrupoActivo === 'todos' || p.grupo === window._prodGrupoActivo
        return matchTexto && matchGrupo
      })
    }

    const renderPills = () => {
      const nav = document.getElementById('prod-pills-nav')
      if (!nav) return
      const ps = (activo) => `flex-shrink:0;padding:5px 13px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;border:1.5px solid ${activo?'var(--color-primary)':'var(--color-border)'};background:${activo?'var(--color-primary)':'transparent'};color:${activo?'#fff':'var(--color-text)'};white-space:nowrap`
      const todosConfig = window._productos.filter(p => p.clasificacion_abc).length
      nav.innerHTML = `<button style="${ps(window._prodGrupoActivo==='todos')}" onclick="prodFiltrarGrupo('todos')">Todos <span style="opacity:0.7;font-weight:400">${todosConfig}/${window._productos.length}</span></button>`
        + grupos.map(g => {
            const items  = window._productos.filter(p => p.grupo === g)
            const config = items.filter(p => p.clasificacion_abc).length
            const activo = window._prodGrupoActivo === g
            return `<button style="${ps(activo)}" onclick="prodFiltrarGrupo('${g.replace(/'/g,"\\'")}')">${g} <span style="opacity:0.7;font-weight:400">${config}/${items.length}</span></button>`
          }).join('')
    }

    window.prodFiltrarGrupo = function(grupo) {
      window._prodGrupoActivo = grupo
      document.getElementById('insumos-search').value = ''
      renderPills()
      renderTabla(aplicarFiltros())
    }

    const renderFilaProducto = (p) => `
      <tr data-prod-id="${p.id_producto}">
        <td style="font-size:11px;color:var(--color-text-muted)">${p.id_producto}</td>
        <td>${puedeEditar
          ? `<input type="text" class="edit-input" id="prod-nombre-${p.id_producto}"
                  value="${p.producto.replace(/"/g, '&quot;')}" style="width:100%">`
          : p.producto}
        </td>
        <td>${puedeEditar
          ? `<select class="edit-select" id="prod-unidad-${p.id_producto}">
               <option value=""${!p.unidad_medida ? ' selected' : ''}>—</option>
               ${uOptsFor(p.unidad_medida || '')}
             </select>
             ${!p.unidad_medida ? '<span class="badge-faltante" title="Este insumo no tiene unidad definida">⚠ falta unidad</span>' : ''}`
          : (p.unidad_medida || `<span class="badge-faltante">⚠ falta unidad</span>`)}
        </td>
        ${(puedeEditar || puedeInvEditar) ? `<td style="text-align:right;white-space:nowrap">
          ${puedeEditar ? `<button class="btn-fila btn-guardar-ing" onclick="guardarProducto('${p.id_producto}')">💾</button>` : ''}
          ${puedeInvEditar ? `<button class="btn-fila" style="margin-left:4px;background:rgba(200,137,42,0.12);color:#c8892a;border:1px solid rgba(200,137,42,0.3);border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer"
            onclick="toggleInventarioPanel('${p.id_producto}')">⚙ Inventario</button>` : ''}
        </td>` : ''}
      </tr>
      <tr id="inv-panel-${p.id_producto}" style="display:none">
        <td colspan="${puedeEditar ? 4 : 3}" style="padding:0">
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
                <label style="font-size:11px;color:var(--color-text-muted);display:block;margin-bottom:4px">Días de cobertura</label>
                <input type="number" class="edit-input edit-num" id="inv-dias-${p.id_producto}"
                  value="${p.dias_cobertura??3}" min="1" step="1" style="width:100%">
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

    const renderTabla = (filtrados) => {
      const wrap = document.getElementById('insumos-lista-wrap')
      if (!filtrados.length) {
        wrap.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px">No hay insumos para mostrar.</p>`
        return
      }
      wrap.innerHTML = `
        <table class="tabla">
          <thead>
            <tr>
              <th>ID</th>
              <th>Insumo</th>
              <th>Unidad</th>
              ${(puedeEditar || puedeInvEditar) ? '<th></th>' : ''}
            </tr>
          </thead>
          <tbody>${filtrados.map(p => renderFilaProducto(p)).join('')}</tbody>
        </table>
      `
    }

    // Cargar proveedores para el panel de inventario
    if (!window._proveedoresCache) {
      const { data: provs } = await window._db.from('proveedores')
        .select('id_proveedor, nombre').eq('tenant_id', tenant_id).eq('activo', true).order('nombre')
      window._proveedoresCache = provs || []
    }

    const onFiltro = () => renderTabla(aplicarFiltros())
    document.getElementById('insumos-search').addEventListener('input', onFiltro)
    if (fuentesDef.length) {
      document.getElementById('btn-export-pdf').addEventListener('click', () => {
        const fuente = document.getElementById('export-fuente').value
        exportarInsumosPDF(fuente)
      })
    }

    renderPills()
    renderTabla(aplicarFiltros())

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

async function exportarInsumosPDF(fuente) {
  const tenant_id    = await getTenantId()
  const tenantNombre = window._tenantConfig?.nombre || tenant_id
  const tenantActual = (window._tenantConfig?.nombre || '').toLowerCase()
  const etiqueta     = (FUENTES_POR_TENANT[tenantActual] || []).find(f => f.fuente === fuente)?.etiqueta || fuente

  const productos = (window._productos || []).filter(p =>
    p.activo !== false && p.fuente === fuente && p.tenant_id === tenant_id
  )

  const porGrupo = {}
  productos.forEach(p => {
    const g = p.grupo || 'General'
    if (!porGrupo[g]) porGrupo[g] = []
    porGrupo[g].push(p)
  })
  const grupos = Object.keys(porGrupo).sort()
  grupos.forEach(g => porGrupo[g].sort((a, b) => a.producto.localeCompare(b.producto)))

  const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Catálogo de Insumos — ${etiqueta}</title>
<style>
  body { font-family: Helvetica, Arial, sans-serif; color: #2B1A0F; margin: 0; }
  .pdf-header { border-bottom: 2px solid #C8892A; padding-bottom: 12px; margin-bottom: 18px; }
  .pdf-title { font-size: 22px; font-weight: bold; color: #2B1A0F; margin: 0; }
  .pdf-subtitle { font-size: 10px; color: #9B7B6A; margin-top: 4px; }
  .pdf-grupo-titulo { font-size: 13px; font-weight: bold; color: #C8892A; margin-top: 18px; margin-bottom: 6px; }
  .pdf-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .pdf-table th { background: #FAF7F2; color: #9B7B6A; text-align: left; padding: 5px 8px; border: 0.5px solid #E8DDD5; font-weight: bold; font-size: 9px; }
  .pdf-table td { padding: 4px 8px; border: 0.5px solid #E8DDD5; vertical-align: top; }
  .pdf-footer { position: fixed; bottom: 1cm; left: 0; right: 0; font-size: 8px; color: #9B7B6A; display: flex; justify-content: space-between; }
  @page { size: letter; margin: 2cm; @bottom-right { content: "Página " counter(page) " de " counter(pages); font-size: 8px; color: #9B7B6A; } }
</style>
</head>
<body>
<div class="pdf-header">
  <p class="pdf-title">Catálogo de Insumos — ${etiqueta}</p>
  <p class="pdf-subtitle">${fecha} · ${productos.length} insumos</p>
</div>
${grupos.map(g => `
  <p class="pdf-grupo-titulo">${g}</p>
  <table class="pdf-table">
    <thead><tr><th>Insumo</th><th>Unidad</th></tr></thead>
    <tbody>
      ${porGrupo[g].map(p => `<tr><td>${p.producto}</td><td>${p.unidad_medida || '—'}</td></tr>`).join('')}
    </tbody>
  </table>`).join('')}
<div class="pdf-footer">
  <span>dataDesk · ${tenantNombre}</span>
</div>
</body>
</html>`

  const win = window.open('', '_blank')
  win.document.write(html)
  win.document.close()
  win.onload = () => win.print()
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
  const dias      = parseInt(document.getElementById(`inv-dias-${idProducto}`)?.value) || 3
  const provPref  = document.getElementById(`inv-prov-${idProducto}`)?.value || null
  const msg       = document.getElementById(`inv-msg-${idProducto}`)

  const { error } = await window._db.from('productos').update({
    clasificacion_abc:       abc,
    merma_porcentaje:        merma,
    stock_maximo:            maxVal ? parseFloat(maxVal) : null,
    stock_alerta_porcentaje: alerta,
    dias_cobertura:          dias,
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
      prod.stock_alerta_porcentaje = alerta; prod.dias_cobertura = dias
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
