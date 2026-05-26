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
      window._db.from('productos').select('*').eq('tenant_id', tenant_id).order('producto'),
      window._db.from('catalogo_unidades').select('*').eq('tenant_id', tenant_id).order('nombre')
    ])

    if (errP) throw errP
    if (errU) console.warn('catalogo_unidades:', errU.message)

    window._productos = productos || []
    window._unidades  = unidades  || []

    const hayUnidades = window._unidades.length > 0

    const fuentes = [...new Set(window._productos.map(p => p.fuente).filter(Boolean))].sort()
    const grupos  = [...new Set(window._productos.map(p => p.grupo).filter(Boolean))].sort()
    const cats    = [...new Set(window._productos.map(p => p.categoria).filter(Boolean))].sort()

    const uOptsFor = (valorActual) => {
      if (!hayUnidades) return `<option value="${valorActual}">${valorActual || '—'}</option>`
      return window._unidades
        .map(u => { const v = u.nombre || u.unidad || u.id; return `<option value="${v}"${v === valorActual ? ' selected' : ''}>${v}</option>` })
        .join('')
    }

    content.innerHTML = `
      <div class="vista-header">
        <h2>Insumos</h2>
      </div>

      <div class="filtros-bar">
        <select id="filtro-fuente" class="filtro-select">
          <option value="">Todas las fuentes</option>
          ${fuentes.map(f => `<option value="${f}">${f}</option>`).join('')}
        </select>
        <input type="text" id="insumos-search" placeholder="Buscar insumo..." class="filtro-search" />
        <select id="filtro-grupo" class="filtro-select">
          <option value="">Todos los grupos</option>
          ${grupos.map(g => `<option value="${g}">${g}</option>`).join('')}
        </select>
        <select id="filtro-categoria" class="filtro-select">
          <option value="">Todas las categorías</option>
          ${cats.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <select id="filtro-status" class="filtro-select">
          <option value="">Todos los status</option>
          <option value="pendiente">Pendiente</option>
          <option value="aprobado">Aprobado</option>
          <option value="archivado">Archivado</option>
        </select>
      </div>

      <div id="insumos-lista-wrap"></div>
    `

    const aplicarFiltros = () => {
      const fuente = document.getElementById('filtro-fuente')?.value || ''
      const texto  = document.getElementById('insumos-search')?.value.toLowerCase() || ''
      const grupo  = document.getElementById('filtro-grupo')?.value || ''
      const cat    = document.getElementById('filtro-categoria')?.value || ''
      const status = document.getElementById('filtro-status')?.value || ''

      return window._productos.filter(p => {
        const matchFuente = !fuente || p.fuente === fuente
        const matchTexto  = !texto  || p.producto?.toLowerCase().includes(texto)
        const matchGrupo  = !grupo  || p.grupo === grupo
        const matchCat    = !cat    || p.categoria === cat
        const matchStatus = !status || (p.status || 'pendiente') === status
        return matchFuente && matchTexto && matchGrupo && matchCat && matchStatus
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
          ? (hayUnidades
              ? `<select class="edit-select" id="prod-unidad-${p.id_producto}">
                   <option value="">—</option>
                   ${uOptsFor(p.unidad_medida || '')}
                 </select>`
              : `<input type="text" class="edit-input edit-num" id="prod-unidad-${p.id_producto}"
                      value="${(p.unidad_medida || '').replace(/"/g, '&quot;')}"
                      placeholder="unidad" style="width:60px">`)
          : (p.unidad_medida || '')}
        </td>
        <td><span class="badge-status ${p.status || 'pendiente'}">${p.status || 'pendiente'}</span></td>
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
                    <th>Status</th>
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

    document.getElementById('filtro-fuente').addEventListener('change', onFiltro)
    document.getElementById('insumos-search').addEventListener('input', onFiltro)
    document.getElementById('filtro-grupo').addEventListener('change', onFiltro)
    document.getElementById('filtro-categoria').addEventListener('change', onFiltro)
    document.getElementById('filtro-status').addEventListener('change', onFiltro)

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

window.toggleSeccion = function(bodyId) {
  const body = document.getElementById(bodyId)
  const chev = document.getElementById('chev-' + bodyId)
  if (!body) return
  const open = body.style.display !== 'none'
  body.style.display = open ? 'none' : 'block'
  if (chev) chev.textContent = open ? '▸' : '▾'
}
