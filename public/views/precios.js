async function vistaPrecios() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando precios...</p>`

  try {
    const tenant_id = await getTenantId()
    const hoy = new Date().toISOString().split('T')[0]

    // 1. Traer todos los insumos activos del tenant
    const { data: productos, error: errP } = await window._db
      .from('productos')
      .select('id_producto, producto, categoria, grupo, unidad_medida')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)
      .order('grupo')
      .order('producto')

    if (errP) throw errP

    // 2. Traer todos los precios vigentes del tenant
    const { data: precios, error: errPr } = await window._db
      .from('precios_proveedores')
      .select('id_producto, id_proveedor, codigo_proveedor, nombre_proveedor_producto, precio, unidad_precio, cantidad_unidad, unidad_base, precio_por_unidad_base, notas')
      .eq('tenant_id', tenant_id)
      .lte('fecha_inicio', hoy)
      .gte('fecha_fin', hoy)

    if (errPr) throw errPr

    // 3. Traer nombres de proveedores
    const { data: proveedores } = await window._db
      .from('proveedores')
      .select('id_proveedor, nombre')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)

    const nombreProv = {}
    if (proveedores) proveedores.forEach(p => { nombreProv[p.id_proveedor] = p.nombre })

    // Agrupar precios por id_producto
    const preciosPorProducto = {}
    ;(precios || []).forEach(pr => {
      if (!preciosPorProducto[pr.id_producto]) preciosPorProducto[pr.id_producto] = []
      preciosPorProducto[pr.id_producto].push(pr)
    })

    // Solo insumos que tienen al menos un precio
    const productosConPrecios = (productos || []).filter(p => preciosPorProducto[p.id_producto]?.length > 0)

    if (productosConPrecios.length === 0) {
      content.innerHTML = `
        <div class="vista-header"><h2>Precios por Insumo</h2></div>
        <p style="color:var(--color-text-muted)">No hay precios registrados para este tenant.</p>
      `
      return
    }

    // Valores únicos para filtros
    const grupos = [...new Set(productosConPrecios.map(p => p.grupo).filter(Boolean))].sort()
    const provsUnicos = [...new Set((precios || []).map(p => p.id_proveedor).filter(Boolean))]

    content.innerHTML = `
      <div class="vista-header"><h2>Precios por Insumo</h2></div>

      <div class="filtros-bar">
        <input type="text" id="precios-search" placeholder="Buscar insumo..." class="filtro-search" />
        <select id="filtro-precios-grupo" class="filtro-select">
          <option value="">Todos los grupos</option>
          ${grupos.map(g => `<option value="${g}">${g}</option>`).join('')}
        </select>
        <select id="filtro-precios-prov" class="filtro-select">
          <option value="">Todos los proveedores</option>
          ${provsUnicos.map(id => `<option value="${id}">${nombreProv[id] || id}</option>`).join('')}
        </select>
      </div>

      <div id="precios-lista-wrap"></div>
    `

    const aplicarFiltros = () => {
      const texto = document.getElementById('precios-search')?.value.toLowerCase() || ''
      const grupo = document.getElementById('filtro-precios-grupo')?.value || ''
      const prov  = document.getElementById('filtro-precios-prov')?.value || ''

      return productosConPrecios
        .filter(p => {
          const matchTexto = !texto || p.producto?.toLowerCase().includes(texto)
          const matchGrupo = !grupo || p.grupo === grupo
          const matchProv  = !prov  || preciosPorProducto[p.id_producto]?.some(f => f.id_proveedor === prov)
          return matchTexto && matchGrupo && matchProv
        })
        .map(p => ({
          ...p,
          filas: prov
            ? preciosPorProducto[p.id_producto].filter(f => f.id_proveedor === prov)
            : preciosPorProducto[p.id_producto]
        }))
    }

    window.toggleSeccion = function(bodyId) {
      const body = document.getElementById(bodyId)
      const chev = document.getElementById('chev-' + bodyId)
      if (!body) return
      const open = body.style.display !== 'none'
      body.style.display = open ? 'none' : 'block'
      if (chev) chev.textContent = open ? '▸' : '▾'
    }

    const renderPrecios = (lista) => {
      const wrap = document.getElementById('precios-lista-wrap')

      if (!lista.length) {
        wrap.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px">No hay insumos para mostrar.</p>`
        return
      }

      // Agrupar por grupo
      const porGrupo = {}
      lista.forEach(p => {
        const g = p.grupo || 'General'
        if (!porGrupo[g]) porGrupo[g] = []
        porGrupo[g].push(p)
      })

      const grupos = Object.keys(porGrupo).sort()

      // Barra de navegación por grupo
      let html = `
        <div class="precios-nav">
          ${grupos.map(g => `
            <button class="precios-nav-pill"
              onclick="document.getElementById('sec-${g.replace(/\s+/g,'-')}').scrollIntoView({behavior:'smooth',block:'start'})">
              ${g}
            </button>`).join('')}
        </div>
      `

      // Secciones colapsables
      grupos.forEach((grupo, idx) => {
        const secId  = `sec-${grupo.replace(/\s+/g, '-')}`
        const bodyId = `body-${grupo.replace(/\s+/g, '-')}`
        const count  = porGrupo[grupo].length

        html += `
          <div class="precios-seccion" id="${secId}">
            <div class="precios-seccion-header" onclick="toggleSeccion('${bodyId}')">
              <span>${grupo} <span class="precios-seccion-count">${count}</span></span>
              <span class="precios-seccion-chevron" id="chev-${bodyId}">${idx === 0 ? '▾' : '▸'}</span>
            </div>
            <div class="precios-seccion-body" id="${bodyId}" style="display:${idx === 0 ? 'block' : 'none'}">
        `

        porGrupo[grupo].forEach(prod => {
          const filas = prod.filas || []

          const filasConPrecioBase = filas.filter(f => f.precio_por_unidad_base !== null && !f.notas?.includes('REVISAR'))
          const minPrecio = filasConPrecioBase.length > 0
            ? Math.min(...filasConPrecioBase.map(f => f.precio_por_unidad_base))
            : null

          html += `
            <div class="precio-card">
              <div class="precio-card-header">
                <span class="precio-insumo-nombre">${prod.producto}</span>
                <span class="precio-insumo-meta">${prod.id_producto} · ${prod.unidad_medida || ''}</span>
              </div>
              <div class="precio-tabla-wrap">
                <table class="precio-tabla">
                  <thead>
                    <tr>
                      <th>Proveedor</th>
                      <th>Producto cotizado</th>
                      <th>Precio</th>
                      <th>Presentación</th>
                      <th>$/unidad base</th>
                      <th>Notas</th>
                    </tr>
                  </thead>
                  <tbody>
          `

          filas.forEach(f => {
            const esMinimo    = minPrecio !== null && f.precio_por_unidad_base === minPrecio
            const tieneRevisa = f.notas?.includes('REVISAR')

            const precioDisplay = f.precio !== null
              ? `$${Number(f.precio).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '—'

            const ppubDisplay = f.precio_por_unidad_base !== null
              ? `$${Number(f.precio_por_unidad_base).toFixed(4)}/${f.unidad_base}`
              : '—'

            const presentacion = f.cantidad_unidad !== null && f.unidad_base
              ? `${f.unidad_precio} × ${f.cantidad_unidad} ${f.unidad_base}`
              : (f.unidad_precio || '—')

            html += `
              <tr class="${esMinimo ? 'fila-precio-min' : ''}${tieneRevisa ? ' fila-precio-revisar' : ''}">
                <td class="precio-prov-nombre" data-label="Proveedor">${nombreProv[f.id_proveedor] || f.id_proveedor}</td>
                <td class="precio-prod-nombre" data-label="Producto cotizado">${f.nombre_proveedor_producto || '—'}${f.codigo_proveedor ? ` <span class="precio-codigo">${f.codigo_proveedor}</span>` : ''}</td>
                <td class="precio-monto" data-label="Precio">${precioDisplay}</td>
                <td class="precio-presentacion" data-label="Presentación">${presentacion}</td>
                <td class="precio-base${esMinimo ? ' precio-base-min' : ''}" data-label="$/unidad base">${ppubDisplay}${esMinimo ? ' ✓' : ''}</td>
                <td class="precio-notas" data-label="Notas">${f.notas || ''}</td>
              </tr>
            `
          })

          html += `</tbody></table></div></div>`
        })

        html += `</div></div>`
      })

      wrap.innerHTML = html
    }

    const onFiltro = () => renderPrecios(aplicarFiltros())

    document.getElementById('precios-search').addEventListener('input', onFiltro)
    document.getElementById('filtro-precios-grupo').addEventListener('change', onFiltro)
    document.getElementById('filtro-precios-prov').addEventListener('change', onFiltro)

    renderPrecios(aplicarFiltros())

  } catch (err) {
    content.innerHTML = `<p>Error al cargar precios: ${err.message}</p>`
  }
}
