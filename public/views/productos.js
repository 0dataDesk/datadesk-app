async function vistaProductos() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando...</p>`

  try {
    const tenant_id = await getTenantId()
    const rol        = window._rol || 'operador'
    const puedeEditar = ['admin', 'editor', 'cocina'].includes(rol)

    const [
      { data: productos, error: errP },
      { data: unidades,  error: errU }
    ] = await Promise.all([
      window._db.from('productos').select('*').eq('tenant_id', tenant_id).in('fuente', ['carga_eugenio','barra_nacho']).order('producto'),
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
        <div class="export-bar">
          <select id="export-fuente" class="filtro-select">
            <option value="carga_eugenio">Cocina</option>
            <option value="barra_nacho">Barra</option>
          </select>
          <button id="btn-export-pdf" class="btn-primary">Exportar PDF</button>
        </div>
      </div>

      <div class="filtros-bar">
        <select id="filtro-fuente" class="filtro-select" disabled>
          <option value="cocina_barra" selected>Cocina + Barra</option>
        </select>
        <input type="text" id="insumos-search" placeholder="Buscar insumo..." class="filtro-search" />
        <select id="filtro-grupo" class="filtro-select">
          <option value="">Todos los grupos</option>
          ${grupos.map(g => `<option value="${g}">${g}</option>`).join('')}
        </select>

      </div>

      <div id="insumos-lista-wrap"></div>
    `

    const aplicarFiltros = () => {
      const texto  = document.getElementById('insumos-search')?.value.toLowerCase() || ''
      const grupo  = document.getElementById('filtro-grupo')?.value || ''
      const fuentesPermitidas = ['carga_eugenio','barra_nacho']

      return window._productos.filter(p => {
        const matchFuente = fuentesPermitidas.includes(p.fuente)
        const matchTexto  = !texto  || p.producto?.toLowerCase().includes(texto)
        const matchGrupo  = !grupo  || p.grupo === grupo
        return matchFuente && matchTexto && matchGrupo
      })
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
        ${puedeEditar ? `<td style="text-align:right"><button class="btn-fila btn-guardar-ing"
          onclick="guardarProducto('${p.id_producto}')">💾</button></td>` : ''}
      </tr>
    `

    const renderTabla = (filtrados) => {
      const wrap = document.getElementById('insumos-lista-wrap')

      if (!filtrados.length) {
        wrap.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px">No hay insumos para mostrar.</p>`
        return
      }

      const porCategoria = {}
      filtrados.forEach(p => {
        const cat = p.grupo || 'General'
        if (!porCategoria[cat]) porCategoria[cat] = []
        porCategoria[cat].push(p)
      })
      const categorias = Object.keys(porCategoria).sort()

      let html = `
        <div class="precios-nav">
          ${categorias.map(c => `
            <button class="precios-nav-pill"
              onclick="document.getElementById('prod-sec-${c.replace(/\s+/g,'-')}').scrollIntoView({behavior:'smooth',block:'start'})">
              ${c} (${porCategoria[c].length})
            </button>`).join('')}
        </div>
      `

      categorias.forEach((cat, idx) => {
        const secId  = `prod-sec-${cat.replace(/\s+/g, '-')}`
        const bodyId = `prod-body-${cat.replace(/\s+/g, '-')}`
        html += `
          <div class="precios-seccion" id="${secId}">
            <div class="precios-seccion-header" onclick="toggleSeccion('${bodyId}')">
              <span>${cat} <span class="precios-seccion-count">${porCategoria[cat].length} insumos</span></span>
              <span class="precios-seccion-chevron" id="chev-${bodyId}">${idx === 0 ? '▾' : '▸'}</span>
            </div>
            <div class="precios-seccion-body" id="${bodyId}" style="display:${idx === 0 ? 'block' : 'none'}">
              <table class="tabla">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Insumo</th>
                    <th>Unidad</th>
                    ${puedeEditar ? '<th></th>' : ''}
                  </tr>
                </thead>
                <tbody>
                  ${porCategoria[cat].map(p => renderFilaProducto(p)).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `
      })

      wrap.innerHTML = html
    }

    const onFiltro = () => renderTabla(aplicarFiltros())

    document.getElementById('insumos-search').addEventListener('input', onFiltro)
    document.getElementById('filtro-grupo').addEventListener('change', onFiltro)
    document.getElementById('btn-export-pdf').addEventListener('click', () => {
      const fuente = document.getElementById('export-fuente').value
      exportarInsumosPDF(fuente)
    })

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
  const { error } = await window._db
    .from('productos')
    .update({ producto: nombre, unidad_medida: unidad || null })
    .eq('id_producto', idProducto)
    .eq('tenant_id', tenant_id)
  if (error) alert(`Error: ${error.message}`)
}

async function exportarInsumosPDF(fuente) {
  const etiquetas = { carga_eugenio: 'Cocina', barra_nacho: 'Barra' }
  const etiqueta = etiquetas[fuente] || fuente
  const tenant_id = await getTenantId()
  const tenantNombre = window._tenantNombre || tenant_id

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

window.toggleSeccion = function(bodyId) {
  const body = document.getElementById(bodyId)
  const chev = document.getElementById('chev-' + bodyId)
  if (!body) return
  const open = body.style.display !== 'none'
  body.style.display = open ? 'none' : 'block'
  if (chev) chev.textContent = open ? '▸' : '▾'
}
