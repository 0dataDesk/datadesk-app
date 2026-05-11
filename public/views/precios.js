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

    // Solo mostrar insumos que tienen al menos un precio
    const productosConPrecios = (productos || []).filter(p => preciosPorProducto[p.id_producto]?.length > 0)

    if (productosConPrecios.length === 0) {
      content.innerHTML = `
        <div class="vista-header"><h2>Precios por Insumo</h2></div>
        <p style="color:var(--color-text-muted)">No hay precios registrados para este tenant.</p>
      `
      return
    }

    // Agrupar por grupo para mostrar secciones
    const porGrupo = {}
    productosConPrecios.forEach(p => {
      const g = p.grupo || 'General'
      if (!porGrupo[g]) porGrupo[g] = []
      porGrupo[g].push(p)
    })

    let html = `<div class="vista-header"><h2>Precios por Insumo</h2></div>`

    Object.keys(porGrupo).sort().forEach(grupo => {
      html += `<h3 class="seccion-titulo">${grupo}</h3>`

      porGrupo[grupo].forEach(prod => {
        const filas = preciosPorProducto[prod.id_producto] || []

        // Precio más bajo por unidad base (ignorando nulls y filas con REVISAR)
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
    })

    content.innerHTML = html

  } catch (err) {
    content.innerHTML = `<p>Error al cargar precios: ${err.message}</p>`
  }
}
