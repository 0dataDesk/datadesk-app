async function vistaCierres() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando cierres...</p>`

  try {
    await window._db.auth.refreshSession()
    const tenant_id = await getTenantId()

    const { data: cierres, error } = await window._db
      .from('cierres_caja')
      .select('id, fecha, total_general, num_tickets, desglose_metodo, propina_total, cerrado_por, created_at')
      .eq('tenant_id', tenant_id)
      .order('fecha', { ascending: false })

    if (error) throw error

    if (!cierres || !cierres.length) {
      content.innerHTML = `<div class="vista-header"><h2>🔒 Cierres</h2></div><p style="color:var(--color-text-muted)">No hay cierres registrados.</p>`
      return
    }

    const cierreIds = cierres.map(c => c.id)
    const descPorCierre = {}
    const { data: ventasDesc } = await window._db
      .from('ventas')
      .select('id_cierre, subtotal, descuento_porcentaje')
      .eq('tenant_id', tenant_id)
      .in('id_cierre', cierreIds)
      .not('descuento_porcentaje', 'is', null)
      .gt('descuento_porcentaje', 0)
    ;(ventasDesc || []).forEach(v => {
      if (!descPorCierre[v.id_cierre]) descPorCierre[v.id_cierre] = { count: 0, monto: 0 }
      descPorCierre[v.id_cierre].count++
      descPorCierre[v.id_cierre].monto += Math.round((Number(v.subtotal) || 0) * (Number(v.descuento_porcentaje) || 0)) / 100
    })

    const nombresMap = {}
    try {
      const { data: users } = await window._db.rpc('get_usuarios_nombres')
      if (users) users.forEach(u => { if (u.email) nombresMap[u.email] = u.nombre_corto })
    } catch (e) {}

    const formatCerradoPor = (val) => {
      if (!val) return '—'
      if (val === 'operador') return 'Operador'
      return nombresMap[val] || val.split('@')[0]
    }

    window._cierresData             = cierres
    window._cierresTenant           = tenant_id
    window._cierresDescMap          = descPorCierre
    window._cierresFormatCerradoPor = formatCerradoPor

    const periodoPorDefecto = 'Este mes'
    window._cierresPeriodoActual = periodoPorDefecto

    const periodos = ['Última semana', 'Este mes']
    content.innerHTML = `
      <div class="vista-header"><h2>🔒 Cierres</h2></div>
      <div id="cierres-filtro" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        ${periodos.map(p => `
          <button class="btn-periodo" data-periodo="${p}"
            onclick="setCierresPeriodo('${p}')"
            style="padding:5px 14px;border-radius:20px;border:1px solid var(--color-border);cursor:pointer;font-size:13px;
              background:${p === periodoPorDefecto ? 'var(--color-primary)' : 'transparent'};
              color:${p === periodoPorDefecto ? '#fff' : 'var(--color-text)'}">
            ${p}
          </button>`).join('')}
      </div>
      <div id="cierres-cabecero"></div>
      <div id="cierres-lista-wrap"></div>
      <div id="cierre-detalle-wrap" style="display:none"></div>
    `

    await renderCierresVista(periodoPorDefecto)

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function _filtrarCierresPorPeriodo(periodo) {
  const todos = window._cierresData || []
  const hoy = new Date()
  if (periodo === 'Última semana') {
    const d = new Date(hoy)
    const day = d.getDay() || 7
    d.setDate(d.getDate() - (day - 1) - 7)
    const desde = d.toISOString().split('T')[0]
    const domingoPasado = new Date(d)
    domingoPasado.setDate(domingoPasado.getDate() + 6)
    const hasta = domingoPasado.toISOString().split('T')[0]
    return todos.filter(c => c.fecha >= desde && c.fecha <= hasta)
  }
  let desde
  if (periodo === 'Este mes') {
    desde = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
  }
  return todos.filter(c => c.fecha >= desde)
}

async function setCierresPeriodo(periodo) {
  window._cierresPeriodoActual = periodo
  document.querySelectorAll('.btn-periodo').forEach(btn => {
    const active = btn.dataset.periodo === periodo
    btn.style.background = active ? 'var(--color-primary)' : 'transparent'
    btn.style.color      = active ? '#fff' : 'var(--color-text)'
  })
  await renderCierresVista(periodo)
}

async function renderCierresVista(periodo) {
  const cierresFiltrados  = _filtrarCierresPorPeriodo(periodo)
  const descPorCierre     = window._cierresDescMap || {}
  const formatCerradoPor  = window._cierresFormatCerradoPor || (v => v || '—')

  const CHART_COLORS = { efectivo: '#4A7A3A', debito: '#792c24', credito: '#C8892A', tarjeta: '#9B7B6A' }
  const MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const MESES_CORTOS  = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

  // Métricas acumuladas
  let ventaTotal = 0, propinaTotal = 0, descTotal = 0, ticketsTotal = 0
  const metodosSuma = {}
  cierresFiltrados.forEach(c => {
    ventaTotal   += Number(c.total_general) || 0
    propinaTotal += Number(c.propina_total) || 0
    ticketsTotal += Number(c.num_tickets)   || 0
    if (descPorCierre[c.id]) descTotal += descPorCierre[c.id].monto
    Object.entries(c.desglose_metodo || {}).forEach(([m, d]) => {
      metodosSuma[m] = (metodosSuma[m] || 0) + (Number(d.suma) || 0)
    })
  })
  const ventaNeta  = ventaTotal - propinaTotal
  const ticketProm = ticketsTotal ? ventaNeta / ticketsTotal : 0
  const metodosEntries   = Object.entries(metodosSuma)
  const totalMetodosSum  = metodosEntries.reduce((s, [, v]) => s + v, 0)

  // — Top 3 vendidos del periodo —
  let top3 = []
  let promoPiezas = 0
  let promoMonto = 0
  if (cierresFiltrados.length > 0) {
    const idsCierre = cierresFiltrados.map(c => c.id)
    const { data: ventasTop } = await window._db
      .from('ventas')
      .select('id')
      .eq('tenant_id', window._cierresTenant)
      .in('id_cierre', idsCierre)
    const ventaIds = (ventasTop || []).map(v => v.id)
    const { data: preciosPromo } = await window._db
      .from('precios_venta')
      .select('id_item, precio')
      .eq('tenant_id', window._cierresTenant)
      .eq('lista', 'promo_inauguracion')
    const promoPrecioPorItem = {}
    ;(preciosPromo || []).forEach(p => { promoPrecioPorItem[p.id_item] = Number(p.precio) })
    if (ventaIds.length > 0) {
      const { data: items } = await window._db
        .from('venta_items')
        .select('nombre, cantidad, id_item, precio_unitario, importe')
        .eq('tenant_id', window._cierresTenant)
        .in('id_venta', ventaIds)
      const excluidoTop3 = (id) => /^(BEB-|RBE-|REX-COM-)/.test(id || '')
      const sumas = {}
      ;(items || []).forEach(it => {
        if (it.id_item in promoPrecioPorItem && Number(it.precio_unitario) === promoPrecioPorItem[it.id_item]) {
          promoPiezas += Number(it.cantidad) || 0
          promoMonto  += Number(it.importe) || 0
        }
        if (excluidoTop3(it.id_item)) return
        sumas[it.nombre] = (sumas[it.nombre] || 0) + (Number(it.cantidad) || 0)
      })
      top3 = Object.entries(sumas).sort((a, b) => b[1] - a[1]).slice(0, 3)
    }
  }

  // — Cabecero —
  const cabeceroEl = document.getElementById('cierres-cabecero')
  if (cabeceroEl) {
    if (cierresFiltrados.length === 0) {
      cabeceroEl.innerHTML = ''
    } else {
      const legendHtml = metodosEntries.length > 0
        ? `<div style="display:grid;grid-template-columns:repeat(2,auto);gap:4px 20px;font-size:12px;justify-content:start">
            ${metodosEntries.map(([m, suma]) => {
              const pct   = totalMetodosSum ? Math.round(suma / totalMetodosSum * 100) : 0
              const color = CHART_COLORS[m] || '#9B7B6A'
              return `<div style="display:flex;align-items:center;gap:5px;white-space:nowrap">
                <span style="color:${color};font-size:14px;line-height:1">●</span>
                <span>${m.charAt(0).toUpperCase() + m.slice(1)} ${pct}% ($${formatNum(suma)})</span>
              </div>`
            }).join('')}
           </div>`
        : ''

      const promoHtml = promoPiezas > 0
        ? `<div style="background:rgba(200,137,42,0.15);color:#c8892a;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:600">
            Venta en promo inauguración: ${promoPiezas} pieza${promoPiezas !== 1 ? 's' : ''} — $${formatNum(promoMonto)}
           </div>`
        : ''

      const tdH = `padding:10px 16px 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);white-space:nowrap`
      const tdV = (color = 'var(--color-text)') => `padding:2px 16px 10px;font-family:'Bebas Neue',sans-serif;font-size:20px;color:${color}`

      cabeceroEl.innerHTML = `
        <style>
          @media(min-width:640px){
            #cierres-cab-inner { flex-direction: row !important; align-items: flex-start !important; }
            #cierres-cab-donut { align-items: flex-end !important; }
          }
          @media(max-width:639px){
            #cierres-cab-donut { align-items: center !important; }
          }
        </style>
        <div class="receta-card" style="margin-bottom:18px">
          <div id="cierres-cab-inner" style="display:flex;flex-direction:column;gap:20px">

            <!-- Izquierda: venta total + tabla 2x2 -->
            <div style="flex:1;display:flex;flex-direction:column;gap:14px">
              <div>
                <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-muted)">Venta total</div>
                <div style="font-family:'Bebas Neue',sans-serif;font-size:48px;line-height:1;color:var(--color-primary)">$${formatNum(ventaTotal)}</div>
              </div>
              <table style="border-collapse:collapse;background:var(--color-bg-alt,rgba(0,0,0,0.04));border-radius:8px;overflow:hidden">
                <tbody>
                  <tr>
                    <td style="${tdH}">💰 Propina</td>
                    <td style="${tdH}">🏷️ Descuentos</td>
                  </tr>
                  <tr>
                    <td style="${tdV()}">$${formatNum(propinaTotal)}</td>
                    <td style="${tdV('#3A8C3E')}">$${formatNum(descTotal)}</td>
                  </tr>
                  <tr>
                    <td style="${tdH}">🎟️ Tickets</td>
                    <td style="${tdH}">📊 T. Promedio</td>
                  </tr>
                  <tr>
                    <td style="${tdV()}">${ticketsTotal}</td>
                    <td style="${tdV()}">$${formatNum(ticketProm)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Centro: donut + leyenda -->
            ${metodosEntries.length > 0 ? `
            <div id="cierres-cab-donut" style="display:flex;flex-direction:column;gap:10px">
              <canvas id="cierre-chart-metodos" width="220" height="220"></canvas>
              ${legendHtml}
              ${promoHtml}
            </div>` : promoHtml}

            <!-- Derecha: top 3 -->
            ${top3.length > 0 ? `
            <div style="display:flex;flex-direction:column;gap:10px;min-width:160px">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-muted)">🏆 Top 3</div>
              ${top3.map(([nombre, cant], i) => `
                <div style="font-size:13px;display:flex;gap:6px;align-items:baseline">
                  <span style="color:var(--color-text-muted);min-width:14px">${i + 1}.</span>
                  <span style="font-weight:600;flex:1">${nombre}</span>
                  <span style="color:var(--color-text-muted);white-space:nowrap">× ${cant}</span>
                </div>`).join('')}
            </div>` : ''}

          </div>
        </div>
      `

      if (metodosEntries.length > 0) {
        const buildChart = () => {
          const canvas = document.getElementById('cierre-chart-metodos')
          if (!canvas) return
          if (window._cierresChart) { window._cierresChart.destroy(); window._cierresChart = null }

          const cs = getComputedStyle(document.documentElement)
          const colorText     = cs.getPropertyValue('--color-text').trim()     || '#2B1A0F'
          const colorTextMuted = cs.getPropertyValue('--color-text-muted').trim() || '#9B7B6A'

          const centerTextPlugin = {
            id: 'centerText',
            beforeDraw(chart) {
              const { ctx, chartArea: { top, bottom, left, right } } = chart
              const cx = (left + right) / 2
              const cy = (top + bottom) / 2
              ctx.save()
              ctx.font = "bold 12px 'DM Sans', sans-serif"
              ctx.fillStyle = colorTextMuted
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText('TOTAL', cx, cy - 12)
              ctx.font = "600 20px 'Bebas Neue', sans-serif"
              ctx.fillStyle = colorText
              ctx.fillText('$' + formatNum(totalMetodosSum), cx, cy + 11)
              ctx.restore()
            }
          }
          window.Chart.register(centerTextPlugin)

          window._cierresChart = new window.Chart(canvas, {
            type: 'doughnut',
            data: {
              labels: metodosEntries.map(([m]) => m.charAt(0).toUpperCase() + m.slice(1)),
              datasets: [{
                data: metodosEntries.map(([, v]) => v),
                backgroundColor: metodosEntries.map(([m]) => CHART_COLORS[m] || '#9B7B6A'),
                borderWidth: 0,
                borderRadius: 6,
                spacing: 3
              }]
            },
            options: {
              cutout: '58%',
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const pct = totalMetodosSum ? Math.round(ctx.parsed / totalMetodosSum * 100) : 0
                      return ` ${ctx.label}: $${formatNum(ctx.parsed)} (${pct}%)`
                    }
                  },
                  backgroundColor: 'rgba(30,10,5,0.85)',
                  titleFont: { family: 'DM Sans', size: 12 },
                  bodyFont:  { family: 'DM Sans', size: 12 },
                  padding: 10,
                  cornerRadius: 6
                }
              },
              animation: { animateRotate: true, duration: 500 }
            }
          })
        }

        if (window.Chart) {
          buildChart()
        } else {
          const s = document.createElement('script')
          s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js'
          s.onload = buildChart
          document.head.appendChild(s)
        }
      }
    }
  }

  // — Lista agrupada mes → semana —
  const listaEl = document.getElementById('cierres-lista-wrap')
  if (!listaEl) return

  if (cierresFiltrados.length === 0) {
    listaEl.innerHTML = `<p style="color:var(--color-text-muted)">Sin cierres en este período.</p>`
    return
  }

  function getLunes(fechaStr) {
    const d = new Date(fechaStr + 'T12:00:00')
    const day = d.getDay() || 7
    d.setDate(d.getDate() - (day - 1))
    return d.toISOString().split('T')[0]
  }

  function semLabel(lunesStr) {
    const lun = new Date(lunesStr + 'T12:00:00')
    const dom = new Date(lun); dom.setDate(dom.getDate() + 6)
    const sufijo = dom.getMonth() !== lun.getMonth()
      ? `${MESES_CORTOS[dom.getMonth()]}`
      : MESES_CORTOS[lun.getMonth()]
    return `Semana del ${lun.getDate()} al ${dom.getDate()} ${sufijo}`
  }

  // Agrupar por mes
  const porMes = {}
  cierresFiltrados.forEach(c => {
    const mes = c.fecha.slice(0, 7)
    if (!porMes[mes]) porMes[mes] = []
    porMes[mes].push(c)
  })
  const meses = Object.keys(porMes).sort().reverse()

  let html = ''
  meses.forEach((mes, mesIdx) => {
    const ciMes   = porMes[mes]
    const totMes  = ciMes.reduce((s, c) => s + (Number(c.total_general) || 0), 0)
    const [year, month] = mes.split('-')
    const mesLabel = `${MESES_NOMBRES[Number(month) - 1]} ${year}`
    const mesOpen  = mesIdx === 0
    const mesId    = `mes-${mes}`

    // Agrupar por semana
    const porSemana = {}
    ciMes.forEach(c => {
      const lunes = getLunes(c.fecha)
      if (!porSemana[lunes]) porSemana[lunes] = []
      porSemana[lunes].push(c)
    })
    const semanas = Object.keys(porSemana).sort().reverse()

    let semanasHtml = ''
    semanas.forEach((lunes, semIdx) => {
      const ciSem  = porSemana[lunes]
      const totSem = ciSem.reduce((s, c) => s + (Number(c.total_general) || 0), 0)
      const semOpen = mesIdx === 0 && semIdx === 0
      const semId   = `sem-${mes}-${lunes}`

      const filasHtml = ciSem.map(c => {
        const prop  = Number(c.propina_total) || 0
        const neta  = Number(c.total_general) - prop
        const tprom = c.num_tickets ? neta / c.num_tickets : 0
        const desc  = descPorCierre[c.id]
        return `
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 0 8px 32px;
              border-bottom:1px solid var(--color-border);cursor:pointer;font-size:13px"
            onclick="verDetalleCierre('${c.id}','${c.fecha}')"
            onmouseenter="this.style.background='var(--color-bg-alt,rgba(0,0,0,0.03))'"
            onmouseleave="this.style.background=''">
            <span style="min-width:90px;font-weight:600">${c.fecha}</span>
            <span style="color:var(--color-text-muted)">${c.num_tickets} ticket${c.num_tickets !== 1 ? 's' : ''}</span>
            <span style="font-weight:600">$${formatNum(c.total_general)}</span>
            ${prop ? `<span style="color:var(--color-text-muted)">propina $${formatNum(prop)}</span>` : ''}
            ${desc  ? `<span style="color:#3A8C3E;font-weight:600">-$${formatNum(desc.monto)}</span>` : ''}
            <span style="color:var(--color-text-muted);margin-left:auto">neta $${formatNum(neta)} · ~$${formatNum(tprom)}/ticket</span>
            <span style="color:var(--color-text-muted)">${formatCerradoPor(c.cerrado_por)}</span>
          </div>`
      }).join('')

      semanasHtml += `
        <div style="margin-left:16px">
          <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;
              font-size:13px;border-bottom:1px solid var(--color-border)"
            onclick="(function(el){
              const b=document.getElementById('${semId}');
              const open=b.style.display!=='none';
              b.style.display=open?'none':'';
              el.querySelector('.sem-chev').textContent=open?'▶':'▼';
            })(this)">
            <span class="sem-chev" style="color:var(--color-text-muted);font-size:11px">${semOpen ? '▼' : '▶'}</span>
            <span>${semLabel(lunes)}</span>
            <span style="color:var(--color-text-muted)">· ${ciSem.length} cierre${ciSem.length !== 1 ? 's' : ''}</span>
            <span style="font-weight:600;margin-left:auto">$${formatNum(totSem)}</span>
          </div>
          <div id="${semId}" style="display:${semOpen ? '' : 'none'}">
            ${filasHtml}
          </div>
        </div>`
    })

    html += `
      <div style="margin-bottom:8px;border:1px solid var(--color-border);border-radius:8px;overflow:hidden">
        <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer;
            background:var(--color-bg-card)"
          onclick="(function(el){
            const b=document.getElementById('${mesId}');
            const open=b.style.display!=='none';
            b.style.display=open?'none':'';
            el.querySelector('.mes-chev').textContent=open?'▶':'▼';
          })(this)">
          <span class="mes-chev" style="color:var(--color-text-muted);font-size:12px">${mesOpen ? '▼' : '▶'}</span>
          <strong style="font-size:14px">${mesLabel}</strong>
          <span style="color:var(--color-text-muted);font-size:13px">· ${ciMes.length} cierre${ciMes.length !== 1 ? 's' : ''}</span>
          <span style="font-weight:700;color:var(--color-primary);margin-left:auto">$${formatNum(totMes)}</span>
        </div>
        <div id="${mesId}" style="display:${mesOpen ? '' : 'none'}">
          ${semanasHtml}
        </div>
      </div>`
  })

  listaEl.innerHTML = html
}

async function verDetalleCierre(id_cierre, fecha) {
  const listaWrap   = document.getElementById('cierres-lista-wrap')
  const detalleWrap = document.getElementById('cierre-detalle-wrap')
  if (!listaWrap || !detalleWrap) return

  document.getElementById('cierres-filtro').style.display   = 'none'
  document.getElementById('cierres-cabecero').style.display = 'none'
  listaWrap.style.display   = 'none'
  detalleWrap.style.display = ''
  detalleWrap.innerHTML     = `<p style="color:var(--color-text-muted);margin-top:16px">Cargando detalle...</p>`

  const tenant_id = window._cierresTenant || await getTenantId()
  const cierre    = (window._cierresData || []).find(c => c.id === id_cierre)

  const { data: ventas, error } = await window._db
    .from('ventas')
    .select('id, folio, metodo_pago, total, subtotal, descuento_porcentaje, propina, created_at')
    .eq('tenant_id', tenant_id)
    .eq('id_cierre', id_cierre)
    .order('created_at')

  if (error) {
    detalleWrap.innerHTML = `<p style="color:var(--color-highlight)">Error: ${error.message}</p>`
    return
  }

  const ids = (ventas || []).map(v => v.id)
  const itemsPorVenta = {}
  if (ids.length > 0) {
    const { data: items } = await window._db
      .from('venta_items')
      .select('id_venta, nombre, cantidad, importe, modificadores')
      .eq('tenant_id', tenant_id)
      .in('id_venta', ids)
    ;(items || []).forEach(it => {
      if (!itemsPorVenta[it.id_venta]) itemsPorVenta[it.id_venta] = []
      itemsPorVenta[it.id_venta].push(it)
    })
  }

  function fmtItemsCierre(items, venta) {
    const lineas = items.map(it => {
      let modsText = ''
      if (it.modificadores) {
        const m = it.modificadores
        const parts = []
        const sin = (m.ingredientes || []).filter(i => !i.on).map(i => i.nombre)
        if (sin.length) parts.push('Sin: ' + sin.join(', '))
        const extras = (m.extras || []).filter(e => (e.qty || 0) > 0).map(e => e.nombre)
        if (extras.length) parts.push(extras.join(', '))
        const salsas = (m.salsas || []).map(s => s.nombre)
        if (salsas.length) parts.push(salsas.join(', '))
        if (m.nota) parts.push('📝 ' + m.nota)
        if (parts.length) modsText = `<div style="font-size:11px;color:var(--color-text-muted);margin-left:12px">${parts.join(' · ')}</div>`
      }
      return `<div style="padding:3px 0;font-size:13px">${it.nombre} ×${it.cantidad} — <strong>$${it.importe}</strong>${modsText}</div>`
    }).join('')

    let descFooter = ''
    if (venta && venta.descuento_porcentaje > 0) {
      const sub      = Number(venta.subtotal) || 0
      const pct      = Number(venta.descuento_porcentaje)
      const descMonto = Math.round(sub * pct) / 100
      descFooter = `
        <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--color-border)">
          <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--color-text-muted)">
            <span>Subtotal</span><span>$${formatNum(sub)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:13px;color:#3A8C3E;font-weight:600">
            <span>Descuento (${pct}%)</span><span>-$${formatNum(descMonto)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;margin-top:4px">
            <span>Total</span><span>$${formatNum(venta.total)}</span>
          </div>
        </div>`
    }
    return lineas + descFooter
  }

  const fmtHora  = iso => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  const desglose = cierre?.desglose_metodo || {}

  const ventasConDesc  = (ventas || []).filter(v => v.descuento_porcentaje > 0)
  const montoDescTotal = ventasConDesc.reduce((s, v) => s + Math.round((Number(v.subtotal) || 0) * (Number(v.descuento_porcentaje) || 0)) / 100, 0)
  const subtotalBruto  = ventasConDesc.reduce((s, v) => s + (Number(v.subtotal) || 0), 0)

  window._cierreDetalleActual = { fecha, cierre, ventas: ventas || [] }
  window._cierreItemsPorVenta = itemsPorVenta
  window._fmtItemsCierre      = fmtItemsCierre

  const secLabel = (txt) =>
    `<div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
      color:var(--color-text-muted);margin-bottom:8px">${txt}</div>`

  detalleWrap.innerHTML = `
    <div class="receta-card" style="margin-top:16px">

      <!-- Cabecera: volver + título + PDF -->
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:12px">
          <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="
            document.getElementById('cierres-filtro').style.display='';
            document.getElementById('cierres-cabecero').style.display='';
            document.getElementById('cierres-lista-wrap').style.display='';
            document.getElementById('cierre-detalle-wrap').style.display='none'">← Volver</button>
          <h3 style="margin:0">Cierre — ${fecha}</h3>
        </div>
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="exportarCierrePDF()">Exportar PDF</button>
      </div>

      <!-- Propina y Descuentos como columnas -->
      <div style="display:flex;gap:32px;margin-bottom:20px;flex-wrap:wrap">
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--color-text-muted)">💰 Propina</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--color-text)">$${formatNum(Number(cierre?.propina_total) || 0)}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--color-text-muted)">🏷️ Descuentos</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:#3A8C3E">$${formatNum(montoDescTotal)}</div>
        </div>
      </div>

      <!-- Resumen por método de pago -->
      ${secLabel('Resumen por método de pago')}
      <div style="overflow-x:auto;margin-bottom:24px">
        <table class="tabla">
          <thead>
            <tr>
              <th>Método de pago</th>
              <th style="text-align:right">Tickets</th>
              <th style="text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(desglose).map(([m, d]) => `
              <tr>
                <td>${m}</td>
                <td style="text-align:right">${d.count}</td>
                <td style="text-align:right;font-weight:600">$${formatNum(d.suma)}</td>
              </tr>`).join('')}
            <tr style="border-top:2px solid var(--color-primary)">
              <td style="padding-top:12px"><strong style="font-size:15px;color:var(--color-primary)">TOTAL</strong></td>
              <td style="text-align:right;padding-top:12px"><strong style="font-size:15px">${cierre?.num_tickets || 0} tickets</strong></td>
              <td style="text-align:right;padding-top:12px"><strong style="font-size:18px;color:var(--color-primary)">$${formatNum(cierre?.total_general || 0)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Detalle de ventas -->
      ${secLabel('Detalle de ventas')}
      <div style="overflow-x:auto">
        <table class="tabla">
          <thead>
            <tr>
              <th style="width:20px"></th>
              <th>Folio</th>
              <th>Método</th>
              <th style="text-align:right">Total</th>
              <th style="text-align:right">Descuento</th>
              <th style="text-align:right">Propina</th>
              <th>Hora</th>
            </tr>
          </thead>
          <tbody>
            ${(ventas || []).map(v => {
              const items    = itemsPorVenta[v.id] || []
              const hasItems = items.length > 0
              const pct      = Number(v.descuento_porcentaje) || 0
              const sub      = Number(v.subtotal) || 0
              const descMonto = pct > 0 ? Math.round(sub * pct) / 100 : 0
              const descCell  = pct > 0
                ? `<span style="color:#3A8C3E;font-weight:600">-$${formatNum(descMonto)}</span><br>
                   <span style="font-size:11px;color:var(--color-text-muted)">${pct}%</span>`
                : '—'
              return `
              <tr style="cursor:${hasItems ? 'pointer' : 'default'}"
                onclick="${hasItems ? `toggleItemsCierre('items-${v.id}')` : ''}">
                <td style="color:var(--color-text-muted);font-size:12px">${hasItems ? '▶' : ''}</td>
                <td>${v.folio || '—'}</td>
                <td>${v.metodo_pago || '—'}</td>
                <td style="text-align:right;font-weight:600">$${formatNum(v.total)}</td>
                <td style="text-align:right">${descCell}</td>
                <td style="text-align:right">${v.propina ? '$' + formatNum(v.propina) : '—'}</td>
                <td style="color:var(--color-text-muted)">${fmtHora(v.created_at)}</td>
              </tr>
              ${hasItems
                ? `<tr id="items-${v.id}" style="display:none">
                     <td colspan="7" style="padding:8px 12px 12px 32px;background:var(--color-bg-alt,rgba(0,0,0,0.03))">
                       ${fmtItemsCierre(items, v)}
                     </td>
                   </tr>`
                : ''}`
            }).join('')}
          </tbody>
        </table>
      </div>

    </div>
  `
}

function exportarCierrePDF() {
  const { fecha, cierre, ventas } = window._cierreDetalleActual || {}
  if (!cierre) return
  const desglose     = cierre.desglose_metodo || {}
  const fmtHora      = iso => new Date(iso).toLocaleTimeString('es-MX')
  const ventasConDesc = (ventas || []).filter(v => v.descuento_porcentaje > 0)
  const montoDesc    = ventasConDesc.reduce((s, v) =>
    s + Math.round((Number(v.subtotal) || 0) * (Number(v.descuento_porcentaje) || 0)) / 100, 0)

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Cierre ${fecha}</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #2B1A0F; margin: 0; padding: 40px; background: #FAF7F2; }
  .header { border-bottom: 3px solid #C8892A; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
  .header h1 { font-size: 22px; margin: 0; }
  .header small { color: #9B7B6A; font-size: 12px; }
  .sec-label { font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#9B7B6A;margin:20px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #fff; }
  thead th { padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #9B7B6A; border-bottom: 2px solid #E8DDD5; }
  td { padding: 8px 12px; border-bottom: 1px solid #E8DDD5; }
  .total-row td { border-top: 2px solid #C8892A; font-weight: 700; }
  .desc-row td { color: #3A8C3E; font-weight: 600; background: rgba(76,153,80,0.06); }
  .footer { margin-top: 30px; font-size: 11px; color: #9B7B6A; text-align: center; }
</style></head><body>
  <div class="header">
    <div><h1>Cierre de caja — Furia</h1><small>Fecha: ${fecha}</small></div>
    <div style="font-size:11px;color:#9B7B6A">${cierre.num_tickets} tickets</div>
  </div>

  <div class="sec-label">Resumen por método de pago</div>
  <table>
    <thead><tr><th>Método de pago</th><th style="text-align:right">Tickets</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>
      ${Object.entries(desglose).map(([m, d]) =>
        `<tr><td>${m}</td><td style="text-align:right">${d.count}</td><td style="text-align:right">$${formatNum(d.suma)}</td></tr>`
      ).join('')}
      ${ventasConDesc.length > 0
        ? `<tr class="desc-row"><td>🏷 Descuentos</td><td style="text-align:right">${ventasConDesc.length}</td><td style="text-align:right">-$${formatNum(montoDesc)}</td></tr>`
        : ''}
      <tr class="total-row">
        <td>TOTAL</td>
        <td style="text-align:right">${cierre.num_tickets}</td>
        <td style="text-align:right;color:#C8892A">$${formatNum(cierre.total_general)}</td>
      </tr>
    </tbody>
  </table>

  <div class="sec-label">Detalle de ventas</div>
  <table>
    <thead>
      <tr>
        <th>Folio</th><th>Método</th>
        <th style="text-align:right">Total</th>
        <th style="text-align:right">Descuento</th>
        <th style="text-align:right">Propina</th>
        <th>Hora</th>
      </tr>
    </thead>
    <tbody>
      ${(ventas || []).map(v => {
        const pct      = Number(v.descuento_porcentaje) || 0
        const descMonto = pct > 0 ? Math.round((Number(v.subtotal) || 0) * pct) / 100 : 0
        return `<tr>
          <td>${v.folio || '—'}</td>
          <td>${v.metodo_pago || '—'}</td>
          <td style="text-align:right">$${formatNum(v.total)}</td>
          <td style="text-align:right;color:${pct > 0 ? '#3A8C3E' : 'inherit'}">
            ${pct > 0 ? `-$${formatNum(descMonto)} (${pct}%)` : '—'}
          </td>
          <td style="text-align:right">${v.propina ? '$' + formatNum(v.propina) : '—'}</td>
          <td>${fmtHora(v.created_at)}</td>
        </tr>`
      }).join('')}
    </tbody>
  </table>

  <div class="footer">Documento generado por dataDesk · ${new Date().toLocaleDateString('es-MX')}</div>
</body></html>`

  const ventana = window.open('', '_blank')
  ventana.document.write(html)
  ventana.document.close()
  ventana.focus()
  setTimeout(() => ventana.print(), 500)
}

function toggleItemsCierre(rowId) {
  const row = document.getElementById(rowId)
  if (!row) return
  const visible = row.style.display !== 'none'
  row.style.display = visible ? 'none' : 'table-row'
  const trigger = row.previousElementSibling
  if (trigger) {
    const arrow = trigger.querySelector('td:first-child')
    if (arrow) arrow.textContent = visible ? '▶' : '▼'
  }
}
