// ── Vista: Diagnóstico ────────────────────────────────────────────────────────
const IA_GRUPO_META = {
  'Carnes y Proteínas': { orden: 1, emoji: '🥩', color: '#B85C2A' },
  'Lácteos y Quesos':   { orden: 2, emoji: '🧀', color: '#6A9BB5' },
  'Verduras y Frescos': { orden: 3, emoji: '🥬', color: '#4A7A3A' },
  'Despensa':           { orden: 4, emoji: '🥫', color: '#C8892A' },
  'Subrecetas':         { orden: 5, emoji: '⚗️', color: '#8A5FB0' },
  'Bebidas':            { orden: 6, emoji: '🥤', color: '#3D9BA8' },
  'Desechables':        { orden: 7, emoji: '🗑️', color: '#9B7B6A' }
}
const IA_META_DEFAULT = { orden: 99, emoji: '📦', color: '#9B7B6A' }

const IA_MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const IA_MESES_CORTOS  = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function _iaFmt(d) { return d.toISOString().slice(0, 10) }

function _iaMesesDisponibles() {
  const hoy = new Date()
  const set = new Set((window._iaConteos || []).map(c => c.fecha.slice(0, 7)))
  set.add(_iaFmt(hoy).slice(0, 7))
  return [...set].sort().reverse()
}

function _iaSemanasDeMes(mes) {
  const [y, m] = mes.split('-').map(Number)
  const primerDia = new Date(y, m - 1, 1)
  const ultimoDia = new Date(y, m, 0)
  const lunesSet = new Set()
  for (let d = new Date(primerDia); d <= ultimoDia; d.setDate(d.getDate() + 1)) {
    const diaSemana = d.getDay() || 7
    const l = new Date(d)
    l.setDate(d.getDate() - (diaSemana - 1))
    lunesSet.add(_iaFmt(l))
  }
  return [...lunesSet].sort().reverse()
}

function _iaMesLabel(mes, soloUnAño) {
  const [year, month] = mes.split('-')
  return soloUnAño ? IA_MESES_NOMBRES[Number(month) - 1] : `${IA_MESES_NOMBRES[Number(month) - 1]} ${year}`
}

function _iaSemLabel(lunesStr) {
  const lun = new Date(lunesStr + 'T12:00:00')
  const dom = new Date(lun); dom.setDate(dom.getDate() + 6)
  const sufijo = dom.getMonth() !== lun.getMonth() ? IA_MESES_CORTOS[dom.getMonth()] : IA_MESES_CORTOS[lun.getMonth()]
  return `Semana del ${lun.getDate()} al ${dom.getDate()} ${sufijo}`
}

// Calcula desde/hasta según el nivel de filtro elegido (permite "viajar en el tiempo").
// desde siempre ancla al último conteo completo anterior o igual a "hasta".
function _iaRangoActual() {
  const hoy = new Date()
  const hoyStr = _iaFmt(hoy)
  let hasta = hoyStr

  if (window._iaNivel1 === 'Mes' && window._iaMesSel) {
    const [y, m] = window._iaMesSel.split('-').map(Number)
    const finMes = _iaFmt(new Date(y, m, 0))
    hasta = finMes < hoyStr ? finMes : hoyStr
  } else if (window._iaNivel1 === 'Semana' && window._iaSemanaSel) {
    const lunes = new Date(window._iaSemanaSel + 'T12:00:00')
    const domingo = new Date(lunes); domingo.setDate(domingo.getDate() + 6)
    const domStr = _iaFmt(domingo)
    hasta = domStr < hoyStr ? domStr : hoyStr
  }

  const conteoAncla = (window._iaConteos || []).find(c => c.fecha <= hasta)
  const desde = conteoAncla ? conteoAncla.fecha : hasta

  return { desde, hasta }
}

async function vistaInventarioAnalitico() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando...</p>`

  try {
    const tenant_id = await getTenantId()
    window._iaTenant = tenant_id

    const { data: conteos } = await window._db
      .from('inventarios')
      .select('id, fecha')
      .eq('tenant_id', tenant_id)
      .eq('estado', 'completo')
      .order('fecha', { ascending: false })
    window._iaConteos = conteos || []

    window._iaNivel1     = 'Hoy'
    window._iaMesSel     = null
    window._iaSemanaSel  = null
    window._iaBusq       = ''
    window._iaSortCol    = 'alerta'
    window._iaSortDir    = -1

    content.innerHTML = `
      <div class="vista-header">
        <h2>🔍 Diagnóstico</h2>
      </div>

      <div id="ia-filtro-periodo" style="margin-bottom:16px"></div>

      <div id="ia-cabecero"></div>

      <input type="text" id="ia-buscador" placeholder="Buscar insumo..."
        style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-card);color:var(--color-text);font-size:14px;margin-bottom:16px"
        oninput="_iaBuscarAnalitico(this.value)">

      <div id="ia-tabla-wrap">
        <p style="color:var(--color-text-muted)">Calculando...</p>
      </div>
    `

    _iaRenderFiltroPeriodo()
    await _iaCargar()

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

// ── Filtro Hoy/Mes/Semana (mismo look que Cierres) ──────────────────────────────
function _iaRenderFiltroPeriodo() {
  const cont = document.getElementById('ia-filtro-periodo')
  if (!cont) return

  const meses = _iaMesesDisponibles()
  const añosDistintos = [...new Set(meses.map(m => m.split('-')[0]))]
  const soloUnAño = añosDistintos.length === 1
  const nivel1 = window._iaNivel1 || 'Hoy'

  let html = `
    <div class="cierres-segmented">
      ${['Hoy', 'Mes', 'Semana'].map(p => `
        <button class="btn-periodo${nivel1 === p ? ' active' : ''}" onclick="_iaSetNivel1('${p}')">${p}</button>`).join('')}
    </div>`

  if (nivel1 === 'Mes' || nivel1 === 'Semana') {
    html += `
    <div class="cierres-segmented cierres-segmented-sub" style="margin-top:10px">
      ${meses.map(mes => `
        <button class="btn-periodo${window._iaMesSel === mes ? ' active' : ''}" onclick="_iaSetMes('${mes}')">${_iaMesLabel(mes, soloUnAño)}</button>`).join('')}
    </div>`
  }

  if (nivel1 === 'Semana' && window._iaMesSel) {
    const semanas = _iaSemanasDeMes(window._iaMesSel)
    html += `
    <div class="cierres-segmented cierres-segmented-sub" style="margin-top:8px">
      ${semanas.map(lunes => `
        <button class="btn-periodo${window._iaSemanaSel === lunes ? ' active' : ''}" onclick="_iaSetSemana('${lunes}')">${_iaSemLabel(lunes)}</button>`).join('')}
    </div>`
  }

  cont.innerHTML = html
}

function _iaSetNivel1(nivel) {
  window._iaNivel1    = nivel
  window._iaMesSel    = null
  window._iaSemanaSel = null
  _iaRenderFiltroPeriodo()
  _iaCargar()
}

function _iaSetMes(mes) {
  window._iaMesSel    = mes
  window._iaSemanaSel = null
  _iaRenderFiltroPeriodo()
  _iaCargar()
}

function _iaSetSemana(lunes) {
  window._iaSemanaSel = lunes
  _iaRenderFiltroPeriodo()
  _iaCargar()
}

async function _iaCargar() {
  const wrap = document.getElementById('ia-tabla-wrap')
  if (!wrap) return
  wrap.innerHTML = `<p style="color:var(--color-text-muted)">Calculando...</p>`

  const { desde, hasta } = _iaRangoActual()
  const tenant_id = window._iaTenant

  try {
    const { data: productos } = await window._db
      .from('productos')
      .select('id_producto, producto, unidad_medida, grupo, stock_maximo, stock_alerta_porcentaje')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)

    const prodMap = {}
    ;(productos || []).forEach(p => { prodMap[p.id_producto] = p })

    const [
      recItemsRes,
      incidenciasRes,
      conteoDelPeriodoRes
    ] = await Promise.all([
      window._db
        .from('recepcion_items')
        .select('id_producto, cantidad_recibida, recepciones!inner(fecha, tenant_id)')
        .eq('recepciones.tenant_id', tenant_id)
        .gte('recepciones.fecha', desde)
        .lte('recepciones.fecha', hasta),

      window._db
        .from('incidencias')
        .select('id_producto, cantidad')
        .eq('tenant_id', tenant_id)
        .gte('fecha', desde)
        .lte('fecha', hasta),

      window._db
        .from('inventarios')
        .select('id, fecha')
        .eq('tenant_id', tenant_id)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })
        .limit(1)
    ])

    if (recItemsRes.error)         throw new Error(`recepciones: ${recItemsRes.error.message}`)
    if (incidenciasRes.error)      throw new Error(`incidencias: ${incidenciasRes.error.message}`)
    if (conteoDelPeriodoRes.error) throw new Error(`inventarios (período): ${conteoDelPeriodoRes.error.message}`)

    const consumoMap = {}
    const { data: consumoData, error: consumoErr } = await window._db
      .from('consumo_teorico')
      .select('id_producto, cantidad_consumida')
      .eq('tenant_id', tenant_id)
      .gte('fecha_venta', desde)
      .lte('fecha_venta', hasta)
    if (consumoErr) console.warn('consumo_teorico:', consumoErr.message)
    ;(consumoData || []).forEach(c => {
      if (c.id_producto) consumoMap[c.id_producto] = (consumoMap[c.id_producto] || 0) + Number(c.cantidad_consumida)
    })

    const recepMap = {}
    ;(recItemsRes.data || []).forEach(r => {
      if (r.id_producto) recepMap[r.id_producto] = (recepMap[r.id_producto] || 0) + Number(r.cantidad_recibida)
    })

    const incidMap = {}
    ;(incidenciasRes.data || []).forEach(i => {
      if (i.id_producto) incidMap[i.id_producto] = (incidMap[i.id_producto] || 0) + Number(i.cantidad || 0)
    })

    const inicialMap = {}
    const invInicialReal = (window._iaConteos || []).find(c => c.fecha === desde) || null
    if (invInicialReal) {
      const { data: itemsIni } = await window._db
        .from('inventario_items')
        .select('id_producto, cantidad_contada')
        .eq('id_inventario', invInicialReal.id)
      ;(itemsIni || []).forEach(r => { inicialMap[r.id_producto] = Number(r.cantidad_contada) })
    }

    const finalMap = {}
    let invFinal = conteoDelPeriodoRes.data?.[0] || null
    if (invFinal && invInicialReal && invFinal.id === invInicialReal.id && desde !== hasta) invFinal = null
    if (invFinal) {
      const { data: itemsFin } = await window._db
        .from('inventario_items')
        .select('id_producto, cantidad_contada')
        .eq('id_inventario', invFinal.id)
      ;(itemsFin || []).forEach(r => { finalMap[r.id_producto] = Number(r.cantidad_contada) })
    }

    const idsConMovimiento = new Set([
      ...Object.keys(inicialMap),
      ...Object.keys(finalMap),
      ...Object.keys(recepMap),
      ...Object.keys(consumoMap),
      ...Object.keys(incidMap),
    ])

    const filas = []
    idsConMovimiento.forEach(id => {
      const p       = prodMap[id] || {}
      const inicial = inicialMap[id] ?? null
      const recep   = recepMap[id]  || 0
      const consumo = consumoMap[id] || 0
      const incid   = incidMap[id]  || 0
      const final_v = finalMap[id]  ?? null

      const teorico = (inicial !== null ? inicial : 0) + recep - consumo - incid
      const diff    = final_v !== null ? final_v - teorico : null
      const pct     = diff !== null && teorico !== 0 ? diff / teorico * 100 : null

      let colorDiff = ''
      if (pct !== null) {
        const absPct = Math.abs(pct)
        colorDiff = absPct <= 5 ? '#3A8C3E' : absPct <= 10 ? '#c8892a' : '#B85C2A'
      }

      const existActual = final_v !== null ? final_v : teorico

      const sm  = p.stock_maximo
      const sap = p.stock_alerta_porcentaje
      const stock_critico = (sm != null && sap != null) ? sm * (sap / 100) : null
      let alerta = 0
      if (stock_critico !== null) {
        if (existActual <= stock_critico)            alerta = 2
        else if (existActual <= stock_critico * 1.5) alerta = 1
      }

      filas.push({
        nombre: p.producto || id,
        unidad: p.unidad_medida || '',
        grupo:  p.grupo || 'Sin clasificar',
        inicial, recep, consumo, incid, teorico, final_v, diff, pct, colorDiff,
        alerta, existActual
      })
    })

    if (!filas.length) {
      const cabeceroEl = document.getElementById('ia-cabecero')
      if (cabeceroEl) cabeceroEl.innerHTML = ''
      wrap.innerHTML = `<p style="color:var(--color-text-muted);padding:24px 0">Sin movimientos en el período seleccionado.</p>`
      return
    }

    window._iaFilas      = filas
    window._iaDesde      = desde
    window._iaHasta      = hasta
    window._iaInvInicial = invInicialReal
    window._iaInvFinal   = invFinal

    _iaRenderCabecero()

    wrap.innerHTML = `
      <style>
        .ia-grupo.open .ia-grupo-body { display:block !important }
        .ia-grupo-header:hover { opacity:.85 }
        .ia-tabla-compacta { font-size:12px }
        .ia-tabla-compacta th.ia-th {
          cursor:pointer; user-select:none;
          white-space:normal; line-height:1.2; font-size:10.5px;
          vertical-align:bottom; padding:6px 8px;
        }
        .ia-tabla-compacta td { padding:6px 8px; }
        .ia-th:hover { color:var(--color-primary); }
      </style>

      <div class="card-surface" style="padding:16px 20px" id="ia-grupos-wrap"></div>

      <p id="ia-pie" style="font-size:11px;color:var(--color-text-muted);margin-top:8px"></p>
    `

    _iaRenderGrupos()

  } catch (err) {
    wrap.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function _iaRenderCabecero() {
  const cabeceroEl = document.getElementById('ia-cabecero')
  if (!cabeceroEl) return

  const filas = window._iaFilas || []
  if (!filas.length) { cabeceroEl.innerHTML = ''; return }

  const total    = filas.length
  const criticos = filas.filter(f => f.alerta === 2).length
  const bajos    = filas.filter(f => f.alerta === 1).length
  const sanos    = total - criticos - bajos
  const enAlerta = criticos + bajos
  const pct      = n => total ? Math.round(n / total * 100) : 0

  const porGrupoCriticos = {}
  filas.forEach(f => { if (f.alerta === 2) porGrupoCriticos[f.grupo] = (porGrupoCriticos[f.grupo] || 0) + 1 })
  const grupoUrgente = Object.entries(porGrupoCriticos).sort((a, b) => b[1] - a[1])[0] || null

  cabeceroEl.innerHTML = `
    <div class="card-surface" style="padding:20px;margin-bottom:18px">
      <div style="display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start">
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-muted)">Insumos en alerta</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:42px;line-height:1;color:${enAlerta ? '#B85C2A' : 'var(--color-primary)'}">
            ${enAlerta}<span style="font-size:18px;color:var(--color-text-muted)"> / ${total}</span>
          </div>
        </div>
        <table style="border-collapse:collapse;background:var(--color-secondary);border-radius:8px;overflow:hidden">
          <tbody>
            <tr>
              <td style="padding:8px 16px 2px;font-size:10px;font-weight:600;text-transform:uppercase;color:var(--color-text-muted);white-space:nowrap">🔴 Críticos</td>
              <td style="padding:8px 16px 2px;font-size:10px;font-weight:600;text-transform:uppercase;color:var(--color-text-muted);white-space:nowrap">🟡 Bajos</td>
            </tr>
            <tr>
              <td style="padding:0 16px 8px;font-family:'Bebas Neue',sans-serif;font-size:24px;color:#B85C2A">${criticos}</td>
              <td style="padding:0 16px 8px;font-family:'Bebas Neue',sans-serif;font-size:24px;color:#c8892a">${bajos}</td>
            </tr>
          </tbody>
        </table>
        ${grupoUrgente ? `
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-muted)">Necesita atención primero</div>
          <div style="font-size:14px;margin-top:6px;line-height:1.3">
            <strong>${grupoUrgente[0]}</strong><br>
            <span style="color:var(--color-text-muted);font-size:12px">${grupoUrgente[1]} insumo${grupoUrgente[1] !== 1 ? 's' : ''} en crítico</span>
          </div>
        </div>` : ''}
      </div>

      <div style="margin-top:18px">
        <div style="display:flex;height:10px;border-radius:6px;overflow:hidden">
          ${sanos    ? `<div style="flex:${sanos} 0 0 auto;background:#4A7A3A"></div>` : ''}
          ${bajos    ? `<div style="flex:${bajos} 0 0 auto;background:#c8892a"></div>` : ''}
          ${criticos ? `<div style="flex:${criticos} 0 0 auto;background:#B85C2A"></div>` : ''}
        </div>
        <div style="display:flex;gap:16px;margin-top:6px;font-size:11px;color:var(--color-text-muted);flex-wrap:wrap">
          <span>🟢 Sano ${pct(sanos)}%</span>
          <span>🟡 Bajo ${pct(bajos)}%</span>
          <span>🔴 Crítico ${pct(criticos)}%</span>
        </div>
      </div>
    </div>
  `
}

function _iaOrdenarFilas(lista) {
  const col = window._iaSortCol || 'alerta'
  const dir = window._iaSortDir ?? -1
  return [...lista].sort((a, b) => {
    switch (col) {
      case 'alerta': {
        const ad = dir * (a.alerta - b.alerta)
        if (ad !== 0) return ad
        return a.existActual - b.existActual
      }
      case 'nombre':  return dir * a.nombre.localeCompare(b.nombre)
      case 'unidad':  return dir * a.unidad.localeCompare(b.unidad)
      case 'inicial': return dir * ((a.inicial ?? -Infinity) - (b.inicial ?? -Infinity))
      case 'recep':   return dir * (a.recep   - b.recep)
      case 'consumo': return dir * (a.consumo - b.consumo)
      case 'incid':   return dir * (a.incid   - b.incid)
      case 'teorico': return dir * (a.teorico - b.teorico)
      case 'final_v': return dir * ((a.final_v ?? -Infinity) - (b.final_v ?? -Infinity))
      case 'diff':    return dir * ((a.diff   ?? -Infinity) - (b.diff   ?? -Infinity))
      case 'pct':     return dir * ((a.pct    ?? -Infinity) - (b.pct    ?? -Infinity))
      default:        return 0
    }
  })
}

function _iaBadgeGrupo(items) {
  const criticos = items.filter(f => f.alerta === 2).length
  const bajos    = items.filter(f => f.alerta === 1).length
  if (!criticos && !bajos) {
    return `<span style="padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(154,123,106,0.15);color:var(--color-text-muted)">${items.length} insumos</span>`
  }
  const partes = []
  if (criticos) partes.push(`<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(184,92,42,0.15);color:#B85C2A">🔴 ${criticos} crít.</span>`)
  if (bajos)    partes.push(`<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(200,137,42,0.15);color:#c8892a">🟡 ${bajos} bajo${bajos !== 1 ? 's' : ''}</span>`)
  return partes.join(' ')
}

const IA_COLS = [
  { key: 'nombre',  label: 'Insumo',            align: 'left',  width: '140px' },
  { key: 'unidad',  label: 'Unidad',             align: 'left',  width: '55px'  },
  { key: 'inicial', label: 'Último conteo',      align: 'right', width: '68px'  },
  { key: 'recep',   label: 'Recepciones',        align: 'right', width: '68px'  },
  { key: 'consumo', label: 'Consumo teórico',    align: 'right', width: '68px'  },
  { key: 'incid',   label: 'Incidencias',        align: 'right', width: '68px'  },
  { key: 'teorico', label: 'Teórico esperado',   align: 'right', width: '68px'  },
  { key: 'final_v', label: 'Conteo del período', align: 'right', width: '68px'  },
  { key: 'diff',    label: 'Diferencia',         align: 'right', width: '68px'  },
  { key: 'pct',     label: '%',                  align: 'right', width: '52px'  }
]

function _iaRenderGrupos() {
  const grupWrap = document.getElementById('ia-grupos-wrap')
  const pie      = document.getElementById('ia-pie')
  if (!grupWrap) return

  const busq = (window._iaBusq || '').toLowerCase().trim()
  const filtradas = (window._iaFilas || []).filter(f => !busq || f.nombre.toLowerCase().includes(busq))

  if (!filtradas.length) {
    grupWrap.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px">Sin insumos para mostrar${busq ? ' con "' + busq + '"' : ''}.</p>`
    if (pie) pie.textContent = ''
    return
  }

  const porGrupo = {}
  filtradas.forEach(f => {
    if (!porGrupo[f.grupo]) porGrupo[f.grupo] = []
    porGrupo[f.grupo].push(f)
  })
  const nombresGrupos = Object.keys(porGrupo).sort((a, b) => {
    const ma = IA_GRUPO_META[a] || IA_META_DEFAULT
    const mb = IA_GRUPO_META[b] || IA_META_DEFAULT
    return ma.orden - mb.orden
  })

  const fmtNum = v => v === null ? '—' : formatInt(v)
  const fmtPct = v => v === null ? '—' : formatNum(v, 1) + '%'

  const col = window._iaSortCol || 'alerta'
  const dir = window._iaSortDir ?? -1

  const renderGrupo = (g) => {
    const meta  = IA_GRUPO_META[g] || IA_META_DEFAULT
    const items = _iaOrdenarFilas(porGrupo[g])

    return `
      <div class="ia-grupo" data-grupo="${g.replace(/"/g,'&quot;')}"
        style="border:1px solid var(--color-border);border-left:4px solid ${meta.color};border-radius:8px;margin-bottom:8px;overflow:hidden">
        <div class="ia-grupo-header"
          style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;background:var(--color-surface);user-select:none"
          onclick="this.parentElement.classList.toggle('open')">
          <span style="font-weight:600">${meta.emoji} ${g}</span>
          ${_iaBadgeGrupo(porGrupo[g])}
        </div>
        <div class="ia-grupo-body" style="display:none">
          <div style="overflow-x:auto">
            <table class="tabla ia-tabla-compacta" style="margin:0;border-radius:0;border-top:1px solid var(--color-border);table-layout:fixed;width:100%">
              <thead>
                <tr>
                  ${IA_COLS.map(c => `
                    <th class="ia-th" onclick="_iaOrdenar('${c.key}')" style="text-align:${c.align};width:${c.width}${c.key === col ? ';color:var(--color-primary)' : ''}">
                      ${c.label}${c.key === col ? (dir === 1 ? ' ▲' : ' ▼') : ''}
                    </th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${items.map(f => {
                  const tinte = f.alerta === 2 ? 'background:rgba(184,92,42,0.07)'
                    : f.alerta === 1 ? 'background:rgba(200,137,42,0.07)'
                    : ''
                  return `
                  <tr style="${tinte}" title="${f.alerta === 2 ? 'Stock crítico' : f.alerta === 1 ? 'Stock bajo' : ''}">
                    <td>${f.nombre}</td>
                    <td style="color:var(--color-text-muted)">${f.unidad}</td>
                    <td style="text-align:right">${fmtNum(f.inicial)}</td>
                    <td style="text-align:right">${fmtNum(f.recep)}</td>
                    <td style="text-align:right">${fmtNum(f.consumo)}</td>
                    <td style="text-align:right">${fmtNum(f.incid)}</td>
                    <td style="text-align:right">${fmtNum(f.teorico)}</td>
                    <td style="text-align:right;font-weight:600">${fmtNum(f.final_v)}</td>
                    <td style="text-align:right;font-weight:600;color:${f.colorDiff||'var(--color-text)'}">${fmtNum(f.diff)}</td>
                    <td style="text-align:right;font-weight:600;color:${f.colorDiff||'var(--color-text)'}">${fmtPct(f.pct)}</td>
                  </tr>`
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`
  }

  grupWrap.innerHTML = nombresGrupos.map(renderGrupo).join('')

  if (pie) {
    pie.textContent = `Período: ${window._iaDesde} → ${window._iaHasta}`
      + (window._iaInvInicial ? ` · Último conteo: ${window._iaInvInicial.fecha}` : '')
      + (window._iaInvFinal   ? ` · Conteo del período: ${window._iaInvFinal.fecha}` : '')
      + ` · ${filtradas.length} insumo${filtradas.length !== 1 ? 's' : ''} mostrado${filtradas.length !== 1 ? 's' : ''}`
  }
}

function _iaOrdenar(col) {
  if (window._iaSortCol === col) {
    window._iaSortDir = (window._iaSortDir ?? -1) * -1
  } else {
    window._iaSortCol = col
    window._iaSortDir = (col === 'nombre' || col === 'unidad') ? 1 : -1
  }
  _iaRenderGrupos()
}

function _iaBuscarAnalitico(q) {
  window._iaBusq = q
  _iaRenderGrupos()
}
