async function vistaProductos() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando...</p>`

  try {
    const tenant_id  = await getTenantId()
    const rol        = window._rol || 'operador'
    const esAdmin    = rol === 'admin'

    const [
      { data: productos,    error: errP },
      { data: ingredientes, error: errI }
    ] = await Promise.all([
      window._db.from('productos').select('*').eq('tenant_id', tenant_id).order('producto'),
      window._db.from('receta_ingredientes').select('id_producto, id_receta, catalogo_recetas(nombre_platillo)')
    ])

    if (errP) throw errP

    window._productos = productos || []

    // Recetas por producto
    const recetasPor = {}
    ;(ingredientes || []).forEach(i => {
      if (!i.id_producto) return
      if (!recetasPor[i.id_producto]) recetasPor[i.id_producto] = []
      const nombre = i.catalogo_recetas?.nombre_platillo
      if (nombre && !recetasPor[i.id_producto].includes(nombre))
        recetasPor[i.id_producto].push(nombre)
    })
    window._recetasPorProducto = recetasPor

    // Valores únicos para los filtros
    const grupos    = [...new Set(window._productos.map(p => p.grupo).filter(Boolean))].sort()
    const cats0     = [...new Set(window._productos.map(p => p.categoria).filter(Boolean))].sort()
    const prods0    = [...window._productos].sort((a, b) => a.producto.localeCompare(b.producto))

    content.innerHTML = `
      <div class="vista-header">
        <h2>Revisión de Insumos</h2>
      </div>

      <div class="filtros-cascada">
        <div class="filtro-cascada-item">
          <label class="filtro-label">Grupo</label>
          <select id="f-grupo" class="filtro-select">
            <option value="">Todos los grupos</option>
            ${grupos.map(g => `<option value="${g}">${g}</option>`).join('')}
          </select>
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Categoría</label>
          <select id="f-categoria" class="filtro-select">
            <option value="">Todas las categorías</option>
            ${cats0.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Insumo</label>
          <select id="f-insumo" class="filtro-select">
            <option value="">Selecciona un insumo...</option>
            ${prods0.map(p => `<option value="${p.id_producto}">${p.producto}</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="insumo-detalle-wrap"></div>
    `

    const fGrupo    = document.getElementById('f-grupo')
    const fCategoria = document.getElementById('f-categoria')
    const fInsumo   = document.getElementById('f-insumo')

    const actualizarFiltros = () => {
      const grupo     = fGrupo.value
      const categoria = fCategoria.value

      // Categorías según grupo
      const catsDisp = [...new Set(
        window._productos
          .filter(p => !grupo || p.grupo === grupo)
          .map(p => p.categoria).filter(Boolean)
      )].sort()

      const catActual = fCategoria.value
      fCategoria.innerHTML =
        `<option value="">Todas las categorías</option>` +
        catsDisp.map(c => `<option value="${c}"${c === catActual ? ' selected' : ''}>${c}</option>`).join('')

      // Insumos según grupo + categoría
      const prodsDisp = window._productos
        .filter(p =>
          (!grupo    || p.grupo    === grupo) &&
          (!categoria || p.categoria === categoria)
        )
        .sort((a, b) => a.producto.localeCompare(b.producto))

      fInsumo.innerHTML =
        `<option value="">Selecciona un insumo...</option>` +
        prodsDisp.map(p => `<option value="${p.id_producto}">${p.producto}</option>`).join('')

      document.getElementById('insumo-detalle-wrap').innerHTML = ''
    }

    fGrupo.addEventListener('change',    () => actualizarFiltros())
    fCategoria.addEventListener('change', () => actualizarFiltros())

    fInsumo.addEventListener('change', () => {
      const val = fInsumo.value
      document.getElementById('insumo-detalle-wrap').innerHTML = ''
      if (!val) return
      const producto = window._productos.find(p => String(p.id_producto) === String(val))
      if (producto) mostrarDetalleInsumo(producto, esAdmin)
    })

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function mostrarDetalleInsumo(producto, esAdmin) {
  const wrap = document.getElementById('insumo-detalle-wrap')
  const recetas = window._recetasPorProducto[producto.id_producto] || []

  wrap.innerHTML = `
    <div class="receta-detalle-card">

      <div class="detalle-header">
        <div>
          <h3>${producto.producto}</h3>
          <p class="detalle-categoria">${[producto.grupo, producto.categoria].filter(Boolean).join(' · ')}</p>
        </div>
        <div class="detalle-acciones">
          <span class="badge-status ${producto.status || 'pendiente'}">${producto.status || 'pendiente'}</span>
          ${esAdmin ? `
            <div class="acciones-receta" style="margin-top:8px">
              <button class="btn-accion btn-aprobar" id="btn-aprobar-ins">Aprobar</button>
              <button class="btn-accion btn-archivar" id="btn-archivar-ins">Archivar</button>
            </div>` : ''}
        </div>
      </div>

      <h4>Datos del insumo</h4>
      <div class="insumo-datos-grid">
        ${fila('Tipo',     producto.tipo)}
        ${fila('Fuente',   producto.fuente)}
        ${fila('Unidad',   producto.unidad_medida)}
        ${fila('Grupo',    producto.grupo)}
        ${fila('Categoría', producto.categoria)}
      </div>

      <h4>Recetas que lo usan</h4>
      ${recetas.length
        ? `<ul class="recetas-lista-ins">
            ${recetas.map(r => `<li>${r}</li>`).join('')}
           </ul>`
        : `<p class="solicitudes-hint">Este insumo no aparece en ninguna receta registrada.</p>`
      }

      <h4>Solicitudes y comentarios</h4>
      <p class="solicitudes-hint">
        Usá este espacio para pedir cambios sobre este insumo: corrección de nombre, unidad, grupo, etc.
      </p>
      <textarea id="notas-insumo" class="edit-textarea" rows="4"
        placeholder="Ej: Cambiar unidad a kg. Mover al grupo Lácteos. Revisar fuente..."
      >${producto.notas || ''}</textarea>
      <button class="btn-accion btn-guardar-sec" id="btn-guardar-notas-ins" style="margin-top:10px">
        Guardar solicitud
      </button>

    </div>
  `

  // Admin: aprobar / archivar
  if (esAdmin) {
    document.getElementById('btn-aprobar-ins')?.addEventListener('click', () =>
      cambiarStatusInsumo(producto, 'aprobado'))
    document.getElementById('btn-archivar-ins')?.addEventListener('click', () =>
      cambiarStatusInsumo(producto, 'archivado'))
  }

  // Guardar notas
  document.getElementById('btn-guardar-notas-ins')?.addEventListener('click', async () => {
    const notas = document.getElementById('notas-insumo')?.value || ''
    const { error } = await window._db.from('productos')
      .update({ notas })
      .eq('id_producto', producto.id_producto)
    if (!error) {
      producto.notas = notas
      mostrarToast('Solicitud guardada')
    } else {
      mostrarToast('Error al guardar')
      console.error(error)
    }
  })
}

function fila(label, valor) {
  if (!valor) return ''
  return `<div class="insumo-dato-fila">
    <span class="insumo-dato-label">${label}</span>
    <span class="insumo-dato-valor">${valor}</span>
  </div>`
}

async function cambiarStatusInsumo(producto, nuevoStatus) {
  const { error } = await window._db.from('productos')
    .update({ status: nuevoStatus })
    .eq('id_producto', producto.id_producto)
  if (error) { mostrarToast('Error: ' + error.message); return }

  producto.status = nuevoStatus
  const p = window._productos?.find(p => p.id_producto === producto.id_producto)
  if (p) p.status = nuevoStatus

  mostrarToast(`Insumo ${nuevoStatus}`)
  mostrarDetalleInsumo(producto, true)
}
