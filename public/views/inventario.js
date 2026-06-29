async function vistaInventario() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando inventario...</p>`

  try {
    const tenant_id = await getTenantId()

    content.innerHTML = `
      <div class="vista-header"><h2>Inventario</h2></div>
      <div class="filtros-bar">
        <input type="text" id="inv-search" placeholder="Buscar insumo..." class="filtro-search" oninput="invRenderizar()" />
        ${['superadmin','admin','gerente'].includes(window._rol) ? `<button class="btn-accion btn-aprobar" onclick="exportarInventarioExcel()">Exportar Excel</button>` : ''}
        ${['superadmin','admin','gerente'].includes(window._rol) ? `<button class="btn-accion" style="border:1px solid var(--color-border)" onclick="exportarInventarioPDF()">Exportar PDF</button>` : ''}
      </div>
      <div id="inv-grupos-nav" style="display:flex;gap:8px;overflow-x:auto;padding:10px 0 6px;scrollbar-width:none;flex-wrap:nowrap"></div>
      <div id="inv-resultado"><p style="color:var(--color-text-muted)">Cargando...</p></div>
    `

    const [{ data: items, error: errC }, { data: productos, error: errP }] = await Promise.all([
      window._db
        .from('recepcion_items')
        .select('id_producto, cantidad_recibida, unidad, notas, recepciones!inner(tenant_id)')
        .eq('recepciones.tenant_id', tenant_id),
      window._db
        .from('productos')
        .select('id_producto, producto, grupo, unidad_medida, clasificacion_abc, stock_minimo, stock_maximo, merma_porcentaje, dias_entrega')
        .eq('tenant_id', tenant_id)
        .eq('activo', true)
    ])

    if (errC) throw errC
    if (errP) throw errP

    const prodMap = {}
    ;(productos || []).forEach(p => { prodMap[p.id_producto] = p })
    window._invProdMap = prodMap

    const porProducto = {}
    ;(items || []).forEach(c => {
      if (!porProducto[c.id_producto]) {
        porProducto[c.id_producto] = {
          id_producto: c.id_producto,
          cantidad: 0,
          unidad: c.unidad,
          notas: c.notas
        }
      }
      porProducto[c.id_producto].cantidad += Number(c.cantidad_recibida)
    })

    window._invConteo = Object.values(porProducto).map(c => ({
      ...c,
      producto: prodMap[c.id_producto]?.producto || c.id_producto,
      grupo: prodMap[c.id_producto]?.grupo || 'Sin grupo'
    }))

    window._invGrupoActivo = 'todos'

    window.invRenderPills = function() {
      const nav = document.getElementById('inv-grupos-nav')
      if (!nav) return
      const grupos = [...new Set(window._invConteo.map(c => c.grupo))]
      const pillStyle = (activo) => `flex-shrink:0;padding:5px 13px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;border:1.5px solid ${activo ? 'var(--color-primary)' : 'var(--color-border)'};background:${activo ? 'var(--color-primary)' : 'transparent'};color:${activo ? '#fff' : 'var(--color-text)'};white-space:nowrap`

      const pm = window._invProdMap || {}
      const todosCap = window._invConteo.filter(c => pm[c.id_producto]?.clasificacion_abc).length
      nav.innerHTML = `<button style="${pillStyle(window._invGrupoActivo==='todos')}" onclick="invFiltrarGrupo('todos')">Todos <span style="opacity:0.7;font-weight:400">${todosCap}/${window._invConteo.length}</span></button>`
        + grupos.map(g => {
            const items = window._invConteo.filter(c => c.grupo === g)
            const cap   = items.filter(c => pm[c.id_producto]?.clasificacion_abc).length
            const activo = window._invGrupoActivo === g
            return `<button style="${pillStyle(activo)}" onclick="invFiltrarGrupo('${g.replace(/'/g,"\\'")}')">${g} <span style="opacity:0.7;font-weight:400">${cap}/${items.length}</span></button>`
          }).join('')
    }

    window.invFiltrarGrupo = function(grupo) {
      window._invGrupoActivo = grupo
      document.getElementById('inv-search').value = ''
      invRenderPills()
      invRenderizar()
    }

    window.invRenderizar = window.renderInventario = function() {
      const resultado = document.getElementById('inv-resultado')
      const texto = document.getElementById('inv-search')?.value.toLowerCase() || ''

      const filtrados = window._invConteo.filter(c => {
        const enGrupo = window._invGrupoActivo === 'todos' || c.grupo === window._invGrupoActivo
        const enTexto = !texto || c.producto.toLowerCase().includes(texto)
        return enGrupo && enTexto
      })

      if (!filtrados.length) {
        resultado.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px">Sin resultados.</p>`
        return
      }

      function nivelStock(cantidad, unidad) {
        const u = (unidad || '').toLowerCase()
        const n = Number(cantidad)
        if (n === 0) return 'rojo'
        if (u === 'pza' || u === 'pzas') return n < 6 ? 'amarillo' : 'verde'
        return n < 500 ? 'amarillo' : 'verde'
      }

      const colores = {
        rojo:     { punto: '#B85C2A', bg: 'rgba(184,92,42,0.08)',  orden: 0, label: 'Sin existencia' },
        amarillo: { punto: '#C8892A', bg: 'rgba(200,137,42,0.08)', orden: 1, label: 'Stock bajo' },
        verde:    { punto: '#3A8C3E', bg: 'rgba(76,153,80,0.08)',  orden: 2, label: 'En existencia' }
      }

      const conNivel = filtrados.map(c => ({
        ...c,
        nivel: nivelStock(c.cantidad, c.unidad)
      })).sort((a, b) => {
        const oa = colores[a.nivel].orden
        const ob = colores[b.nivel].orden
        if (oa !== ob) return oa - ob
        return a.producto.localeCompare(b.producto)
      })

      const resumen = { rojo: 0, amarillo: 0, verde: 0 }
      conNivel.forEach(c => resumen[c.nivel]++)

      const puedeEditar = ['superadmin','owner','gerente','admin'].includes(window._rol)

      const html = `
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px">
          ${['rojo','amarillo','verde'].map(n => `
            <div style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:${colores[n].bg};border-radius:8px;flex:1;min-width:100px">
              <span style="width:10px;height:10px;border-radius:50%;background:${colores[n].punto};flex-shrink:0"></span>
              <div>
                <div style="font-size:20px;font-weight:700;color:var(--color-primary)">${resumen[n]}</div>
                <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.5px">${colores[n].label}</div>
              </div>
            </div>`).join('')}
        </div>
        <div style="display:flex;flex-direction:column;gap:2px">
          ${conNivel.map(c => {
            const p = window._invProdMap?.[c.id_producto] || {}
            return `
            <div>
              <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:${colores[c.nivel].bg};border-radius:8px;cursor:pointer"
                onclick="${puedeEditar ? `toggleInvPanel('${c.id_producto}')` : ''}">
                <span style="width:8px;height:8px;border-radius:50%;background:${colores[c.nivel].punto};flex-shrink:0"></span>
                <span style="flex:1;font-size:14px;color:var(--color-text)">${c.producto}</span>
                <span style="font-size:11px;color:var(--color-text-muted);background:rgba(0,0,0,0.06);border-radius:4px;padding:2px 6px">${p.clasificacion_abc || '—'}</span>
                <span style="font-size:14px;font-weight:600;color:var(--color-primary)">${Math.round(Number(c.cantidad)).toLocaleString('es-MX')}</span>
                <span style="font-size:12px;color:var(--color-text-muted);min-width:28px;text-align:left">${c.unidad || ''}</span>
                ${puedeEditar ? `<span style="font-size:11px;color:var(--color-text-muted)">⚙</span>` : ''}
              </div>
              ${puedeEditar ? `
              <div id="inv-panel-${c.id_producto}" style="display:none;background:rgba(200,137,42,0.06);border:1px solid rgba(200,137,42,0.2);border-radius:0 0 8px 8px;padding:14px 16px;margin-top:-4px">
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">
                  <div>
                    <label style="font-size:11px;color:var(--color-text-muted);display:block;margin-bottom:4px">Clasificación ABC</label>
                    <select class="edit-select" id="inv-abc-${c.id_producto}" style="width:100%">
                      <option value="A"${(p.clasificacion_abc||'A')==='A'?' selected':''}>A — Alta rotación</option>
                      <option value="B"${p.clasificacion_abc==='B'?' selected':''}>B — Media rotación</option>
                      <option value="C"${p.clasificacion_abc==='C'?' selected':''}>C — Baja rotación</option>
                    </select>
                  </div>
                  <div>
                    <label style="font-size:11px;color:var(--color-text-muted);display:block;margin-bottom:4px">Stock mínimo (${p.unidad_medida||'u'})</label>
                    <input type="number" class="edit-input" id="inv-min-${c.id_producto}" value="${p.stock_minimo??''}" min="0" step="any" placeholder="—" style="width:100%">
                  </div>
                  <div>
                    <label style="font-size:11px;color:var(--color-text-muted);display:block;margin-bottom:4px">Stock máximo (${p.unidad_medida||'u'})</label>
                    <input type="number" class="edit-input" id="inv-max-${c.id_producto}" value="${p.stock_maximo??''}" min="0" step="any" placeholder="—" style="width:100%">
                  </div>
                  <div>
                    <label style="font-size:11px;color:var(--color-text-muted);display:block;margin-bottom:4px">Merma %</label>
                    <input type="number" class="edit-input" id="inv-merma-${c.id_producto}" value="${p.merma_porcentaje??''}" min="0" max="100" step="0.1" placeholder="—" style="width:100%">
                  </div>
                  <div>
                    <label style="font-size:11px;color:var(--color-text-muted);display:block;margin-bottom:4px">Días de entrega</label>
                    <input type="number" class="edit-input" id="inv-dias-${c.id_producto}" value="${p.dias_entrega??''}" min="0" step="1" placeholder="—" style="width:100%">
                  </div>
                </div>
                <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
                  <button class="btn-accion btn-aprobar" style="font-size:12px;padding:5px 14px"
                    onclick="event.stopPropagation();guardarInvInsumo('${c.id_producto}')">Guardar</button>
                  <span id="inv-msg-${c.id_producto}" style="font-size:12px;color:#3A8C3E"></span>
                </div>
              </div>` : ''}
            </div>`
          }).join('')}
        </div>
      `

      resultado.innerHTML = html
    }

    invRenderPills()
    invRenderizar()

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function exportarInventarioPDF() {
  const fecha = new Date().toISOString().split('T')[0]
  const conteo = window._invConteo || []

  const porGrupo = {}
  conteo.forEach(c => {
    const g = c.grupo || 'Sin grupo'
    if (!porGrupo[g]) porGrupo[g] = []
    porGrupo[g].push(c)
  })
  const grupos = Object.keys(porGrupo).sort()

  const seccionesHtml = grupos.map(g => {
    const filas = porGrupo[g]
      .slice()
      .sort((a, b) => a.producto.localeCompare(b.producto))
      .map(c => `<tr><td style="padding:6px 12px;border-bottom:1px solid #E8DDD5">${c.producto}</td><td style="padding:6px 12px;border-bottom:1px solid #E8DDD5;text-align:right;font-weight:600">${Math.round(Number(c.cantidad)).toLocaleString('es-MX')}</td><td style="padding:6px 12px;border-bottom:1px solid #E8DDD5;color:#9B7B6A">${c.unidad}</td><td style="padding:6px 12px;border-bottom:1px solid #E8DDD5;font-size:11px;color:#9B7B6A">${c.notas || ''}</td></tr>`).join('')
    return `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#9B7B6A;margin:20px 0 6px">${g}</h3>
<table style="width:100%;border-collapse:collapse;background:#fff;margin-bottom:8px">
<thead><tr><th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#9B7B6A;border-bottom:2px solid #E8DDD5">Insumo</th><th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#9B7B6A;border-bottom:2px solid #E8DDD5">Cantidad</th><th style="padding:8px 12px;font-size:11px;text-transform:uppercase;color:#9B7B6A;border-bottom:2px solid #E8DDD5">Unidad</th><th style="padding:8px 12px;font-size:11px;text-transform:uppercase;color:#9B7B6A;border-bottom:2px solid #E8DDD5">Notas</th></tr></thead>
<tbody>${filas}</tbody></table>`
  }).join('')

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Inventario ${fecha}</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #2B1A0F; margin: 0; padding: 40px; background: #FAF7F2; }
  .header { border-bottom: 3px solid #C8892A; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
  .header h1 { font-size: 22px; margin: 0; }
  .header small { color: #9B7B6A; font-size: 12px; }
  .footer { margin-top: 30px; font-size: 11px; color: #9B7B6A; text-align: center; border-top: 1px solid #E8DDD5; padding-top: 12px; }
</style></head><body>
  <div class="header">
    <div><h1>Inventario — Furia</h1><small>Conteo: ${fecha}</small></div>
    <div style="font-size:11px;color:#9B7B6A">${conteo.length} insumos</div>
  </div>
  ${seccionesHtml}
  <div class="footer">Documento generado por dataDesk · ${new Date().toLocaleDateString('es-MX')}</div>
</body></html>`

  const ventana = window.open('', '_blank')
  ventana.document.write(html)
  ventana.document.close()
  ventana.focus()
  setTimeout(() => ventana.print(), 500)
}

function exportarInventarioExcel() {
  const fecha = new Date().toISOString().split('T')[0]
  const filas = (window._invConteo || []).map(c => ({
    Grupo: c.grupo,
    Insumo: c.producto,
    Cantidad: Math.round(Number(c.cantidad)),
    Unidad: c.unidad,
    Notas: c.notas || ''
  }))
  filas.sort((a, b) => a.Grupo.localeCompare(b.Grupo) || a.Insumo.localeCompare(b.Insumo))

  const ws = XLSX.utils.json_to_sheet(filas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
  XLSX.writeFile(wb, `inventario_${window._tenantActivo || 'tenant'}_${fecha}.xlsx`)
}

window.toggleInvPanel = function(idProducto) {
  const panel = document.getElementById('inv-panel-' + idProducto)
  if (!panel) return
  panel.style.display = panel.style.display === 'none' ? '' : 'none'
}

window.guardarInvInsumo = async function(idProducto) {
  const tenant_id = await getTenantId()
  const msg = document.getElementById('inv-msg-' + idProducto)
  msg.textContent = 'Guardando…'

  const abc   = document.getElementById('inv-abc-'   + idProducto)?.value || null
  const min   = document.getElementById('inv-min-'   + idProducto)?.value
  const max   = document.getElementById('inv-max-'   + idProducto)?.value
  const merma = document.getElementById('inv-merma-' + idProducto)?.value
  const dias  = document.getElementById('inv-dias-'  + idProducto)?.value

  const update = {
    clasificacion_abc:  abc,
    stock_minimo:       min  !== '' && min  != null ? parseFloat(min)  : null,
    stock_maximo:       max  !== '' && max  != null ? parseFloat(max)  : null,
    merma_porcentaje:   merma !== '' && merma != null ? parseFloat(merma) : null,
    dias_entrega:       dias !== '' && dias != null ? parseInt(dias)   : null,
  }

  const { error } = await window._db.from('productos')
    .update(update)
    .eq('id_producto', idProducto)
    .eq('tenant_id', tenant_id)

  if (error) { msg.style.color = '#B85C2A'; msg.textContent = 'Error: ' + error.message; return }
  msg.style.color = '#3A8C3E'; msg.textContent = '✓ Guardado'
  setTimeout(() => { msg.textContent = '' }, 2000)
}
