async function vistaCosteo() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando costeo...</p>`

  try {
    const tenant_id = await getTenantId()
    const hoy = new Date().toISOString().split('T')[0]

    // 1. Catálogo de recetas activas
    const { data: recetas, error: errR } = await window._db
      .from('catalogo_recetas')
      .select('id_receta, nombre_platillo, categoria, status')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)
      .order('categoria')
      .order('nombre_platillo')

    if (errR) throw errR

    // 2. Todos los precios vigentes con precio_por_unidad_base
    const { data: todosPrecios, error: errP } = await window._db
      .from('precios_proveedores')
      .select('id_producto, id_proveedor, precio_por_unidad_base, unidad_base')
      .eq('tenant_id', tenant_id)
      .lte('fecha_inicio', hoy)
      .gte('fecha_fin', hoy)
      .not('precio_por_unidad_base', 'is', null)

    if (errP) throw errP

    // Índice: id_producto → precio más bajo
    const precioMejor = {}
    ;(todosPrecios || []).forEach(p => {
      if (!precioMejor[p.id_producto] || p.precio_por_unidad_base < precioMejor[p.id_producto].precio_por_unidad_base) {
        precioMejor[p.id_producto] = p
      }
    })

    // 3. Render inicial — selector de receta
    content.innerHTML = `
      <div class="vista-header"><h2>Costeo de Recetas</h2></div>
      <div class="filtros-bar">
        <select id="costeo-receta-select" class="filtro-select" style="max-width:400px">
          <option value="">— Seleccionar receta —</option>
          ${(recetas || []).map(r => `<option value="${r.id_receta}">${r.nombre_platillo} (${r.categoria || 'sin categoría'})</option>`).join('')}
        </select>
      </div>
      <div id="costeo-resultado"></div>
    `

    document.getElementById('costeo-receta-select').addEventListener('change', async (e) => {
      const id_receta  = e.target.value
      const resultado  = document.getElementById('costeo-resultado')
      if (!id_receta) { resultado.innerHTML = ''; return }

      resultado.innerHTML = `<p style="color:var(--color-text-muted)">Calculando...</p>`

      try {
        const { data: ingredientes, error: errI } = await window._db
          .from('receta_ingredientes')
          .select('id, id_producto, producto, cantidad, unidad, notas_ingrediente')
          .eq('tenant_id', tenant_id)
          .eq('id_receta', id_receta)
          .eq('activo', true)
          .order('id')

        if (errI) throw errI

        let costoTotal = 0
        let tieneIncompletos = false

        const filas = (ingredientes || []).map(ing => {
          const cantidad   = parseFloat(ing.cantidad) || null
          const mejor      = precioMejor[ing.id_producto]
          const ppu        = mejor?.precio_por_unidad_base ?? null
          const unidadBase = mejor?.unidad_base ?? null

          let costoIng  = null
          let flagUnidad = false

          if (cantidad !== null && ppu !== null) {
            const unidadIng = (ing.unidad || '').toLowerCase().trim()
            const unidadPr  = (unidadBase || '').toLowerCase().trim()
            if (unidadIng === unidadPr) {
              costoIng = cantidad * ppu
              costoTotal += costoIng
            } else {
              flagUnidad = true
              tieneIncompletos = true
            }
          } else {
            tieneIncompletos = true
          }

          return { ...ing, cantidad, ppu, unidadBase, costoIng, flagUnidad }
        })

        let html = `
          <div class="costeo-card">
            <table class="precio-tabla">
              <thead>
                <tr>
                  <th>Ingrediente</th>
                  <th>Cantidad</th>
                  <th>Unidad</th>
                  <th>$/unidad base</th>
                  <th>Costo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
        `

        filas.forEach(f => {
          const costoDisplay = f.costoIng !== null
            ? `$${f.costoIng.toFixed(4)}`
            : '—'
          const ppuDisplay = f.ppu !== null
            ? `$${f.ppu.toFixed(4)}/${f.unidadBase}`
            : '—'
          const flagDisplay = f.flagUnidad
            ? `<span class="flag-unidad" title="Unidad incompatible con el precio — revisar">⚠️</span>`
            : (f.ppu === null ? `<span class="flag-unidad" title="Sin precio registrado">sin precio</span>` : '')

          html += `
            <tr${f.costoIng === null ? ' class="fila-precio-revisar"' : ''}>
              <td data-label="Ingrediente">${f.producto || ''}</td>
              <td data-label="Cantidad">${f.cantidad ?? '—'}</td>
              <td data-label="Unidad">${f.unidad || '—'}</td>
              <td data-label="$/unidad base" class="precio-base">${ppuDisplay}</td>
              <td data-label="Costo" class="precio-monto">${costoDisplay}</td>
              <td>${flagDisplay}</td>
            </tr>
          `
        })

        html += `
              </tbody>
            </table>
            <div class="costeo-total">
              <span>Costo total de la receta</span>
              <strong>$${costoTotal.toFixed(2)} MXN</strong>
            </div>
            ${tieneIncompletos ? `<p class="costeo-aviso">⚠️ Algunos ingredientes no tienen precio registrado o tienen unidades incompatibles — el costo total es parcial.</p>` : ''}
          </div>
        `

        resultado.innerHTML = html

      } catch (err) {
        resultado.innerHTML = `<p>Error al calcular costeo: ${err.message}</p>`
      }
    })

  } catch (err) {
    content.innerHTML = `<p>Error al cargar costeo: ${err.message}</p>`
  }
}
