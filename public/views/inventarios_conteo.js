// ── Vista: Inventario Físico (conteos) ───────────────────────────────────────
async function vistaInventariosConteo() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando inventarios...</p>`

  try {
    const tenant_id = await getTenantId()

    const { data: inventarios, error } = await window._db
      .from('inventarios')
      .select('id, fecha, clasificacion, area, estado, creado_por, created_at')
      .eq('tenant_id', tenant_id)
      .order('fecha', { ascending: false })

    if (error) throw error

    // Contar items por inventario
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

    const estadoBadge = {
      borrador: 'background:rgba(200,137,42,0.15);color:#c8892a',
      completo: 'background:rgba(76,153,80,0.12);color:#3A8C3E'
    }

    content.innerHTML = `
      <div class="vista-header">
        <h2>Inventario Físico</h2>
      </div>
      <div id="inv-conteo-detalle"></div>
      <div class="tabla-wrapper">
        <table class="tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Clasificación</th>
              <th>Área</th>
              <th>Estado</th>
              <th>Creado por</th>
              <th style="text-align:right">Items</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${!(inventarios && inventarios.length)
              ? `<tr><td colspan="7" style="color:var(--color-text-muted);text-align:center;padding:24px">Sin inventarios registrados aún.</td></tr>`
              : (inventarios || []).map(inv => `
                <tr style="cursor:pointer" onclick="verDetalleInventario('${inv.id}')">
                  <td>${inv.fecha}</td>
                  <td>${inv.clasificacion || 'todos'}</td>
                  <td style="color:var(--color-text-muted)">${inv.area || '—'}</td>
                  <td>
                    <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;${estadoBadge[inv.estado]||''}">
                      ${inv.estado || 'borrador'}
                    </span>
                  </td>
                  <td style="font-size:12px;color:var(--color-text-muted)">${inv.creado_por || '—'}</td>
                  <td style="text-align:right;font-weight:600">${itemsCounts[inv.id] || 0}</td>
                  <td style="text-align:right">
                    <button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 10px"
                      onclick="event.stopPropagation();verDetalleInventario('${inv.id}')">Ver análisis</button>
                  </td>
                </tr>`).join('')
            }
          </tbody>
        </table>
      </div>
    `
  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

async function verDetalleInventario(idInventario) {
  const tenant_id = await getTenantId()
  const wrap = document.getElementById('inv-conteo-detalle')
  if (wrap) wrap.innerHTML = `<p style="color:var(--color-text-muted)">Cargando conteo...</p>`

  try {
    const [
      { data: inv },
      { data: items },
      { data: productos }
    ] = await Promise.all([
      window._db.from('inventarios').select('*').eq('id', idInventario).single(),
      window._db.from('inventario_items').select('*').eq('id_inventario', idInventario),
      window._db.from('productos').select('id_producto, producto, unidad_medida, grupo').eq('tenant_id', tenant_id).eq('activo', true)
    ])

    if (!inv) { if (wrap) wrap.innerHTML = ''; return }

    const prodMap = {}
    ;(productos || []).forEach(p => { prodMap[p.id_producto] = p })

    // Total productos activos por grupo (catálogo completo)
    const totalPorGrupo = {}
    ;(productos || []).forEach(p => {
      const g = p.grupo || 'Sin grupo'
      totalPorGrupo[g] = (totalPorGrupo[g] || 0) + 1
    })

    // Construir filas con grupo
    const filas = (items || []).map(item => {
      const prod = prodMap[item.id_producto] || {}
      return {
        nombre:  prod.producto || item.id_producto,
        unidad:  prod.unidad_medida || '',
        grupo:   prod.grupo || 'Sin grupo',
        contado: item.cantidad_contada != null ? Number(item.cantidad_contada) : null
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

    // Grupo con mayor ratio contados/total (abre por defecto)
    let bestGroup = null, bestRatio = -1
    Object.entries(grupos).forEach(([g, arr]) => {
      const contados = arr.filter(f => f.contado != null && f.contado > 0).length
      const total    = totalPorGrupo[g] || arr.length
      const ratio    = contados / Math.max(total, 1)
      if (ratio > bestRatio) { bestRatio = ratio; bestGroup = g }
    })

    // Orden de grupos: alfabético, "Sin grupo" al final
    const grupoNames = Object.keys(grupos).sort((a, b) => {
      if (a === 'Sin grupo') return 1
      if (b === 'Sin grupo') return -1
      return a.localeCompare(b)
    })

    const accordionHTML = grupoNames.map(g => {
      const arr      = grupos[g]
      const contados = arr.filter(f => f.contado != null && f.contado > 0).length
      const total    = totalPorGrupo[g] || arr.length

      return `
        <div class="ic-grupo" data-grupo="${g.replace(/"/g,'&quot;')}"
          style="border:1px solid var(--color-border);border-radius:8px;margin-bottom:8px;overflow:hidden">
          <div class="ic-grupo-header"
            style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;background:var(--color-surface);user-select:none"
            onclick="this.parentElement.classList.toggle('open')">
            <span style="font-weight:600">${g}</span>
            <span style="font-size:12px;color:var(--color-text-muted)">${contados}/${total}</span>
          </div>
          <div class="ic-grupo-body" style="display:none">
            <table class="tabla" style="margin:0;border-radius:0;border-top:1px solid var(--color-border)">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Unidad</th>
                  <th style="text-align:right">Cantidad contada</th>
                </tr>
              </thead>
              <tbody>
                ${arr.map(f => `
                  <tr>
                    <td>${f.nombre}</td>
                    <td style="color:var(--color-text-muted)">${f.unidad}</td>
                    <td style="text-align:right;font-weight:600">${f.contado != null ? formatNum(f.contado) : '—'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`
    }).join('')

    if (wrap) wrap.innerHTML = `
      <style>
        .ic-grupo.open .ic-grupo-body { display:block !important }
        .ic-grupo-header:hover { opacity:.85 }
      </style>
      <div class="receta-detalle-card" style="margin-bottom:24px">
        <div class="detalle-header">
          <div>
            <h3>Inventario — ${inv.fecha}</h3>
            <p class="detalle-categoria">${inv.clasificacion || 'todos'} · ${inv.area || 'sin área'} · ${inv.estado}</p>
          </div>
          <button class="btn-accion" style="border:1px solid var(--color-border)"
            onclick="document.getElementById('inv-conteo-detalle').innerHTML=''">Cerrar</button>
        </div>

        <input type="text" id="ic-buscador" placeholder="Buscar insumo..."
          style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text);font-size:14px;margin:16px 0"
          oninput="_icBuscar(this.value)">

        <div id="ic-grupos">${accordionHTML}</div>
        <div id="ic-lista-plana" style="display:none"></div>
      </div>
    `

    // Abrir grupo con mejor ratio
    if (bestGroup !== null) {
      wrap.querySelectorAll('.ic-grupo').forEach(el => {
        if (el.dataset.grupo === bestGroup) el.classList.add('open')
      })
    }

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
            <th>Unidad</th>
            <th style="text-align:right">Cantidad contada</th>
          </tr>
        </thead>
        <tbody>
          ${matches.map(f => {
            const hl = f.nombre.replace(re, m => `<mark style="background:rgba(200,137,42,0.3);color:inherit;border-radius:2px">${m}</mark>`)
            return `
              <tr>
                <td>${hl}</td>
                <td style="color:var(--color-text-muted)">${f.unidad}</td>
                <td style="text-align:right;font-weight:600">${f.contado != null ? formatNum(f.contado) : '—'}</td>
              </tr>`
          }).join('')}
        </tbody>
      </table>`
  }
  lista.style.display = ''
}
