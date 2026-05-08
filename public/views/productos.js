async function vistaProductos() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando insumos...</p>`

  try {
    const tenant_id = await getTenantId()

    const [{ data: productos, error: errP }, { data: ingredientes, error: errI }] = await Promise.all([
      window._db.from('productos').select('*').eq('tenant_id', tenant_id),
      window._db.from('receta_ingredientes').select('id_producto')
    ])

    if (errP) throw errP
    if (errI) throw errI

    // Contar recetas por producto
    const recetasPorProducto = {}
    ;(ingredientes || []).forEach(i => {
      if (i.id_producto) {
        recetasPorProducto[i.id_producto] = (recetasPorProducto[i.id_producto] || 0) + 1
      }
    })

    // Contadores de status
    const total      = productos.length
    const aprobados  = productos.filter(p => p.status === 'aprobado').length
    const pendientes = productos.filter(p => !p.status || p.status === 'pendiente').length
    const archivados = productos.filter(p => p.status === 'archivado').length

    // Desglose por grupo
    const porGrupo = {}
    productos.forEach(p => {
      const g = p.grupo || 'Sin grupo'
      porGrupo[g] = (porGrupo[g] || 0) + 1
    })

    const grupos     = [...new Set(productos.map(p => p.grupo).filter(Boolean))].sort()
    const categorias = [...new Set(productos.map(p => p.categoria).filter(Boolean))].sort()
    const fuentes    = [...new Set(productos.map(p => p.fuente).filter(Boolean))].sort()

    content.innerHTML = `
      <div class="vista-header"><h2>Insumos</h2></div>

      <!-- Contadores -->
      <div class="dashboard-grid">
        <div class="dashboard-card">
          <div class="card-valor">${total}</div>
          <div class="card-label">Total</div>
        </div>
        <div class="dashboard-card aprobado">
          <div class="card-valor">${aprobados}</div>
          <div class="card-label">Aprobados</div>
        </div>
        <div class="dashboard-card pendiente">
          <div class="card-valor">${pendientes}</div>
          <div class="card-label">Pendientes</div>
        </div>
        <div class="dashboard-card archivado">
          <div class="card-valor">${archivados}</div>
          <div class="card-label">Archivados</div>
        </div>
      </div>

      <!-- Desglose por grupo -->
      <h3 class="seccion-titulo">Por grupo</h3>
      <div class="grupo-grid">
        ${Object.entries(porGrupo)
            .sort((a, b) => b[1] - a[1])
            .map(([g, n]) => `
              <div class="grupo-item">
                <span class="grupo-nombre">${g}</span>
                <span class="grupo-count">${n}</span>
              </div>
            `).join('')}
      </div>

      <!-- Filtros + Tabla -->
      <div class="filtros" style="margin-bottom:16px">
        <select id="filtro-grupo">
          <option value="">Todos los grupos</option>
          ${grupos.map(g => `<option value="${g}">${g}</option>`).join('')}
        </select>
        <select id="filtro-categoria">
          <option value="">Todas las categorías</option>
          ${categorias.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <select id="filtro-fuente">
          <option value="">Todas las fuentes</option>
          ${fuentes.map(f => `<option value="${f}">${f}</option>`).join('')}
        </select>
        <select id="filtro-status">
          <option value="">Todos los status</option>
          <option value="pendiente">Pendiente</option>
          <option value="aprobado">Aprobado</option>
          <option value="archivado">Archivado</option>
        </select>
        <input type="text" id="filtro-buscar" placeholder="Buscar insumo..." />
      </div>

      <div class="tabla-wrapper">
        <table class="tabla">
          <thead>
            <tr>
              <th>ID</th>
              <th>Insumo</th>
              <th>Tipo</th>
              <th>Grupo</th>
              <th>Categoría</th>
              <th>Fuente</th>
              <th>Unidad</th>
              <th>Recetas</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="tbody-productos"></tbody>
        </table>
      </div>
    `

    const renderTabla = () => {
      const grupo     = document.getElementById('filtro-grupo').value
      const categoria = document.getElementById('filtro-categoria').value
      const fuente    = document.getElementById('filtro-fuente').value
      const status    = document.getElementById('filtro-status').value
      const buscar    = document.getElementById('filtro-buscar').value.toLowerCase()

      const filtrados = productos.filter(p =>
        (!grupo     || p.grupo     === grupo) &&
        (!categoria || p.categoria === categoria) &&
        (!fuente    || p.fuente    === fuente) &&
        (!status    || (p.status || 'pendiente') === status) &&
        (!buscar    || p.producto.toLowerCase().includes(buscar))
      )

      document.getElementById('tbody-productos').innerHTML = filtrados.map(p => `
        <tr>
          <td>${p.id_producto}</td>
          <td>${p.producto}</td>
          <td>${p.tipo           || ''}</td>
          <td>${p.grupo          || ''}</td>
          <td>${p.categoria      || ''}</td>
          <td>${p.fuente         || ''}</td>
          <td>${p.unidad_medida  || ''}</td>
          <td>${recetasPorProducto[p.id_producto] || 0}</td>
          <td><span class="badge-status ${p.status || 'pendiente'}">${p.status || 'pendiente'}</span></td>
        </tr>
      `).join('')
    }

    ;['filtro-grupo', 'filtro-categoria', 'filtro-fuente', 'filtro-status'].forEach(id => {
      document.getElementById(id).addEventListener('change', renderTabla)
    })
    document.getElementById('filtro-buscar').addEventListener('input', renderTabla)

    renderTabla()

  } catch (err) {
    content.innerHTML = `<p>Error al cargar insumos: ${err.message}</p>`
  }
}
