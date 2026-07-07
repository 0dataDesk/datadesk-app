const IC_MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function icDiaLabel(fechaStr) {
  const d  = new Date(fechaStr + 'T12:00:00')
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const aa = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${aa}`
}

function icMesLabel(mesStr) {
  const [year, month] = mesStr.split('-')
  return `${IC_MESES_NOMBRES[Number(month)-1]} ${year}`
}

// ── Vista: Inventario Físico (conteos) ───────────────────────────────────────
async function vistaInventariosConteo() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando inventarios...</p>`

  try {
    const tenant_id = await getTenantId()

    const [{ data: inventarios, error }, { count: totalActivos }] = await Promise.all([
      window._db
        .from('inventarios')
        .select('id, fecha, estado, creado_por')
        .eq('tenant_id', tenant_id)
        .order('fecha', { ascending: false }),
      window._db
        .from('productos')
        .select('id_producto', { count: 'exact', head: true })
        .eq('tenant_id', tenant_id)
        .eq('activo', true)
    ])

    if (error) throw error

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

    const nombresMap = {}
    try {
      const { data: users } = await window._db.rpc('get_usuarios_nombres')
      if (users) users.forEach(u => { if (u.email) nombresMap[u.email] = u.nombre_corto })
    } catch (e) {}

    const formatCreadoPor = (val) => {
      if (!val) return '—'
      return nombresMap[val] || val.split('@')[0]
    }

    const estadoBadge = {
      borrador: 'background:rgba(200,137,42,0.15);color:#c8892a',
      completo: 'background:rgba(76,153,80,0.12);color:#3A8C3E'
    }

    const porMes = {}
    ;(inventarios || []).forEach(inv => {
      const mes = inv.fecha.slice(0, 7)
      if (!porMes[mes]) porMes[mes] = []
      porMes[mes].push(inv)
    })
    const meses = Object.keys(porMes).sort().reverse()

    const accordionHTML = !meses.length
      ? `<p style="color:var(--color-text-muted);text-align:center;padding:24px">Sin inventarios registrados aún.</p>`
      : meses.map((mes, idx) => `
        <div class="ic-mes-grupo${idx === 0 ? ' open' : ''}" style="border:1px solid var(--color-border);border-radius:8px;margin-bottom:8px;overflow:hidden">
          <div class="ic-mes-header" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;background:var(--color-surface);user-select:none" onclick="this.parentElement.classList.toggle('open')">
            <span style="font-weight:600">${icMesLabel(mes)}</span>
            <span style="font-size:12px;color:var(--color-text-muted)">${porMes[mes].length} conteo${porMes[mes].length === 1 ? '' : 's'}</span>
          </div>
          <div class="ic-mes-body" style="display:none">
            <table class="tabla" style="margin:0;border-radius:0;border-top:1px solid var(--color-border)">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th style="text-align:right">Items</th>
                  <th>Creado por</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                ${porMes[mes].map(inv => `
                  <tr style="cursor:pointer" onclick="verDetalleInventario('${inv.id}')">
                    <td>${icDiaLabel(inv.fecha)}</td>
                    <td style="text-align:right;font-weight:600">${itemsCounts[inv.id] || 0}/${totalActivos || 0}</td>
                    <td style="font-size:12px;color:var(--color-text-muted)">${formatCreadoPor(inv.creado_por)}</td>
                    <td><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;${estadoBadge[inv.estado]||''}">${inv.estado || 'borrador'}</span></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`).join('')

    content.innerHTML = `
      <style>
        .ic-mes-grupo.open .ic-mes-body { display:block !important }
        .ic-mes-header:hover { opacity:.85 }
      </style>
      <div class="vista-header">
        <h2>📋 Conteos</h2>
      </div>
      <div id="inv-conteo-detalle"></div>
      <div id="inv-conteo-tabla-wrap" class="card-surface" style="padding:16px">
        ${accordionHTML}
      </div>
    `
  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function icBadge(contados, total, size) {
  const ok = contados === total && total > 0
  const fs = size || 11
  return `<span style="padding:2px 10px;border-radius:20px;font-size:${fs}px;font-weight:700;${ok ? 'background:rgba(76,153,80,0.15);color:#3A8C3E' : 'background:rgba(200,137,42,0.15);color:#c8892a'}">${contados}/${total}</span>`
}

async function verDetalleInventario(idInventario) {
  const tablaWrap = document.getElementById('inv-conteo-tabla-wrap')
  if (tablaWrap) tablaWrap.style.display = 'none'
  const tenant_id = await getTenantId()
  const wrap = document.getElementById('inv-conteo-detalle')
  if (wrap) wrap.innerHTML = `<p style="color:var(--color-text-muted)">Cargando conteo...</p>`

  try {
    const [
      { data: inv },
      { data: items },
      { data: productos },
      { data: proveedores }
    ] = await Promise.all([
      window._db.from('inventarios').select('*').eq('id', idInventario).single(),
      window._db.from('inventario_items').select('*').eq('id_inventario', idInventario),
      window._db.from('productos').select('id_producto, producto, unidad_medida, grupo, id_proveedor_preferencial').eq('tenant_id', tenant_id).eq('activo', true),
      window._db.from('proveedores').select('id_proveedor, nombre_corto').eq('tenant_id', tenant_id)
    ])

    if (!inv) { if (wrap) wrap.innerHTML = ''; return }

    const prodMap = {}
    ;(productos || []).forEach(p => { prodMap[p.id_producto] = p })

    const provMap = {}
    ;(proveedores || []).forEach(p => { provMap[p.id_proveedor] = p.nombre_corto })

    // Total productos activos por grupo (catálogo completo)
    const totalPorGrupo = {}
    ;(productos || []).forEach(p => {
      const g = p.grupo || 'Sin grupo'
      totalPorGrupo[g] = (totalPorGrupo[g] || 0) + 1
    })

    // Construir filas a partir del catálogo completo (left-join con inventario_items)
    const itemMap = {}
    ;(items || []).forEach(item => { itemMap[item.id_producto] = item })

    const filas = (productos || []).map(prod => {
      const item = itemMap[prod.id_producto]
      return {
        nombre:     prod.producto || prod.id_producto,
        unidad:     prod.unidad_medida || '',
        grupo:      prod.grupo || 'Sin grupo',
        contado:    item && item.cantidad_contada != null ? Number(item.cantidad_contada) : null,
        proveedor:  provMap[prod.id_proveedor_preferencial] || '—'
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

    const GRUPO_META = {
      'Carnes y Proteínas': { orden: 1, emoji: '🥩', color: '#B85C2A' },
      'Lácteos y Quesos':   { orden: 2, emoji: '🧀', color: '#6A9BB5' },
      'Verduras y Frescos': { orden: 3, emoji: '🥬', color: '#4A7A3A' },
      'Despensa':           { orden: 4, emoji: '🥫', color: '#C8892A' },
      'Subrecetas':         { orden: 5, emoji: '⚗️', color: '#8A5FB0' },
      'Bebidas':            { orden: 6, emoji: '🥤', color: '#3D9BA8' },
      'Desechables':        { orden: 7, emoji: '🗑️', color: '#9B7B6A' }
    }
    const metaDefault = { orden: 99, emoji: '📦', color: '#9B7B6A' }

    // Orden de grupos por GRUPO_META, grupos desconocidos al final
    const grupoNames = Object.keys(grupos).sort((a, b) => {
      const ma = GRUPO_META[a] || metaDefault
      const mb = GRUPO_META[b] || metaDefault
      return ma.orden - mb.orden
    })

    const SECCION_2_GRUPOS = ['Subrecetas', 'Bebidas', 'Desechables']
    const seccion1 = grupoNames.filter(g => !SECCION_2_GRUPOS.includes(g))
    const seccion2 = grupoNames.filter(g => SECCION_2_GRUPOS.includes(g))

    function renderGrupo(g) {
      const arr      = grupos[g]
      const contados = arr.filter(f => f.contado != null && f.contado > 0).length
      const total    = totalPorGrupo[g] || arr.length
      const meta     = GRUPO_META[g] || metaDefault

      return `
        <div class="ic-grupo" data-grupo="${g.replace(/"/g,'&quot;')}"
          style="border:1px solid var(--color-border);border-left:4px solid ${meta.color};border-radius:8px;margin-bottom:8px;overflow:hidden">
          <div class="ic-grupo-header"
            style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;background:var(--color-surface);user-select:none"
            onclick="this.parentElement.classList.toggle('open')">
            <span style="font-weight:600">${meta.emoji} ${g}</span>
            ${icBadge(contados, total)}
          </div>
          <div class="ic-grupo-body" style="display:none">
            <table class="tabla" style="margin:0;border-radius:0;border-top:1px solid var(--color-border)">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th style="text-align:right">Cantidad contada</th>
                  <th class="ic-col-meta">Unidad</th>
                  <th class="ic-col-meta">Proveedor</th>
                </tr>
              </thead>
              <tbody>
                ${arr.map(f => `
                  <tr>
                    <td>${f.nombre}</td>
                    <td style="text-align:right;font-weight:600">${f.contado != null ? formatInt(f.contado) : '—'}</td>
                    <td class="ic-col-meta">${f.unidad}</td>
                    <td class="ic-col-meta">${f.proveedor}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`
    }

    function subtotal(nombresGrupos) {
      let c = 0, t = 0
      nombresGrupos.forEach(g => {
        c += grupos[g].filter(f => f.contado != null && f.contado > 0).length
        t += totalPorGrupo[g] || grupos[g].length
      })
      return { c, t }
    }
    const sub1 = subtotal(seccion1)
    const sub2 = subtotal(seccion2)
    const granTotal = { c: sub1.c + sub2.c, t: sub1.t + sub2.t }

    const accordionHTML = `
      <div style="margin-bottom:20px">
        ${seccion1.map(renderGrupo).join('')}
        <div style="display:flex;justify-content:flex-end;padding:6px 4px">Subtotal insumos ${icBadge(sub1.c, sub1.t, 12)}</div>
      </div>
      <div style="margin-bottom:12px">
        ${seccion2.map(renderGrupo).join('')}
        <div style="display:flex;justify-content:flex-end;padding:6px 4px">Subtotal ${icBadge(sub2.c, sub2.t, 12)}</div>
      </div>
      <div style="display:flex;justify-content:flex-end;padding:10px 4px;border-top:1px solid var(--color-border);font-weight:700">Total ${icBadge(granTotal.c, granTotal.t, 13)}</div>
    `

    if (wrap) wrap.innerHTML = `
      <style>
        .ic-grupo.open .ic-grupo-body { display:block !important }
        .ic-grupo-header:hover { opacity:.85 }
      </style>
      <div class="receta-detalle-card" style="margin-bottom:24px">
        <div class="detalle-header">
          <div>
            <h3>Conteo — ${inv.fecha}</h3>
          </div>
          <button class="btn-accion" style="border:1px solid var(--color-border)"
            onclick="
              document.getElementById('inv-conteo-tabla-wrap').style.display='';
              document.getElementById('inv-conteo-detalle').innerHTML=''
            ">Cerrar</button>
        </div>

        <input type="text" id="ic-buscador" placeholder="Buscar insumo..."
          style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text);font-size:14px;margin:16px 0"
          oninput="_icBuscar(this.value)">

        <div id="ic-grupos">${accordionHTML}</div>
        <div id="ic-lista-plana" style="display:none"></div>
      </div>
    `

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
            <th style="text-align:right">Cantidad contada</th>
            <th class="ic-col-meta">Unidad</th>
            <th class="ic-col-meta">Proveedor</th>
          </tr>
        </thead>
        <tbody>
          ${matches.map(f => {
            const hl = f.nombre.replace(re, m => `<mark style="background:rgba(200,137,42,0.3);color:inherit;border-radius:2px">${m}</mark>`)
            return `
              <tr>
                <td>${hl}</td>
                <td style="text-align:right;font-weight:600">${f.contado != null ? formatInt(f.contado) : '—'}</td>
                <td class="ic-col-meta">${f.unidad}</td>
                <td class="ic-col-meta">${f.proveedor}</td>
              </tr>`
          }).join('')}
        </tbody>
      </table>`
  }
  lista.style.display = ''
}
