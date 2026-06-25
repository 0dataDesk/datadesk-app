// ── Vista: Levantar Inventario ────────────────────────────────────────────────
async function vistaInventarioLevantamiento() {
  const content = document.getElementById('content')

  const hoy = new Date().toISOString().split('T')[0]

  content.innerHTML = `
    <div class="vista-header">
      <h2>Levantar Inventario</h2>
    </div>

    <div id="lev-filtros" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:20px">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
        Fecha
        <input type="date" id="lev-fecha" value="${hoy}"
          style="padding:8px 12px;border:1.5px solid var(--color-border);border-radius:8px;background:var(--color-surface);color:var(--color-text);font-size:15px">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
        Clasificación
        <select id="lev-abc"
          style="padding:8px 12px;border:1.5px solid var(--color-border);border-radius:8px;background:var(--color-surface);color:var(--color-text);font-size:15px">
          <option value="todos">Todos</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
        Área
        <input type="text" id="lev-area" placeholder="Opcional"
          style="padding:8px 12px;border:1.5px solid var(--color-border);border-radius:8px;background:var(--color-surface);color:var(--color-text);font-size:15px;width:140px">
      </label>
      <button id="lev-btn-cargar" class="btn-accion btn-aprobar" style="padding:9px 20px;font-size:14px">
        Cargar insumos →
      </button>
    </div>

    <div id="lev-cuerpo" style="display:none">
      <!-- barra de búsqueda -->
      <div style="margin-bottom:12px">
        <input type="search" id="lev-search" placeholder="Buscar insumo…" autocomplete="off"
          style="width:100%;max-width:400px;padding:10px 14px;border:1.5px solid var(--color-border);border-radius:8px;background:var(--color-surface);color:var(--color-text);font-size:15px">
      </div>

      <!-- pills de grupos -->
      <div id="lev-grupos-nav" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px"></div>

      <!-- progreso -->
      <div id="lev-progreso" style="font-size:13px;color:var(--color-text-muted);margin-bottom:12px"></div>

      <!-- lista -->
      <div id="lev-lista"></div>

      <!-- botones guardar -->
      <div style="display:flex;gap:10px;margin-top:24px;flex-wrap:wrap">
        <button id="lev-btn-borrador"
          style="padding:14px 24px;background:var(--color-surface);color:var(--color-primary);border:2px solid var(--color-primary);border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">
          💾 Guardar borrador
        </button>
        <button id="lev-btn-cerrar"
          style="padding:14px 28px;background:var(--color-primary);color:#FAF7F2;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">
          ✓ Cerrar inventario
        </button>
      </div>
    </div>

    <div id="lev-confirm" style="display:none;max-width:420px;text-align:center;padding:40px 24px;background:var(--color-surface);border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
      <div style="font-size:52px;margin-bottom:16px">✅</div>
      <h3 id="lev-confirm-titulo" style="font-size:20px;margin-bottom:8px">Inventario cerrado</h3>
      <p id="lev-confirm-msg" style="color:var(--color-text-muted);font-size:15px"></p>
      <button id="lev-btn-nuevo"
        style="margin-top:20px;padding:12px 28px;background:var(--color-primary);color:#FAF7F2;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">
        Nuevo levantamiento
      </button>
    </div>

    <p id="lev-err" style="color:var(--color-highlight);margin-top:8px"></p>
  `

  // Estado interno de la vista
  let levInsumos      = []
  let levInventarioId = null
  let levGrupoActivo  = 'todos'
  let levValores      = {}
  let levGrupos       = []

  const errEl = () => document.getElementById('lev-err')

  // ── Cargar insumos ──────────────────────────────────────────────────────────
  document.getElementById('lev-btn-cargar').addEventListener('click', async () => {
    errEl().textContent = ''
    const fecha = document.getElementById('lev-fecha').value
    if (!fecha) { errEl().textContent = 'Selecciona una fecha'; return }

    try {
      const tenant_id = await getTenantId()
      const abc       = document.getElementById('lev-abc').value

      let q = window._db.from('productos')
        .select('id_producto, producto, unidad_medida, clasificacion_abc, grupo')
        .eq('tenant_id', tenant_id)
        .eq('activo', true)
        .order('clasificacion_abc')
        .order('producto')

      if (abc !== 'todos') q = q.eq('clasificacion_abc', abc)

      const { data: productos, error } = await q
      if (error) throw error

      levInsumos      = productos || []
      levInventarioId = null
      levGrupoActivo  = 'todos'
      levValores      = {}
      levGrupos       = [...new Set(levInsumos.map(p => p.grupo || 'Sin grupo'))]

      document.getElementById('lev-filtros').style.display = 'none'
      document.getElementById('lev-cuerpo').style.display  = ''

      renderGruposNav()
      renderLista(insumosVisibles())
      actualizarProgreso()
    } catch (e) {
      errEl().textContent = 'Error: ' + e.message
    }
  })

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function esCaptured(id) {
    const input = document.getElementById('lev-qty-' + id)
    const v = input ? input.value : levValores[id]
    return v !== '' && v != null && !isNaN(parseFloat(v))
  }

  function insumosVisibles() {
    const texto = document.getElementById('lev-search')?.value.toLowerCase().trim() || ''
    return levInsumos.filter(p => {
      const enGrupo = levGrupoActivo === 'todos' || (p.grupo || 'Sin grupo') === levGrupoActivo
      const enTexto = !texto || p.producto.toLowerCase().includes(texto)
      return enGrupo && enTexto
    })
  }

  function guardarValoresDom() {
    levInsumos.forEach(p => {
      const inp = document.getElementById('lev-qty-' + p.id_producto)
      if (inp) levValores[p.id_producto] = inp.value
    })
  }

  function actualizarProgreso() {
    const cap   = levInsumos.filter(p => esCaptured(p.id_producto)).length
    const total = levInsumos.length
    const el = document.getElementById('lev-progreso')
    if (el) el.textContent = `${cap} de ${total} insumos capturados`
  }

  // ── Render grupos nav ────────────────────────────────────────────────────────
  function renderGruposNav() {
    const nav = document.getElementById('lev-grupos-nav')
    if (!nav) return

    const mkPill = (label, val, count, cap) => {
      const activo = levGrupoActivo === val ? `background:var(--color-primary);color:#FAF7F2;border-color:var(--color-primary)` : `background:var(--color-surface);color:var(--color-text)`
      return `<button onclick="window._levFiltrarGrupo(${JSON.stringify(val)})"
        style="padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;border:1.5px solid var(--color-border);white-space:nowrap;${activo}">
        ${label} <span style="opacity:0.65;font-weight:400">${cap}/${count}</span>
      </button>`
    }

    const todosCap = levInsumos.filter(p => esCaptured(p.id_producto)).length
    let html = mkPill('Todos', 'todos', levInsumos.length, todosCap)
    levGrupos.forEach(g => {
      const items = levInsumos.filter(p => (p.grupo || 'Sin grupo') === g)
      const cap   = items.filter(p => esCaptured(p.id_producto)).length
      html += mkPill(g, g, items.length, cap)
    })
    nav.innerHTML = html
  }

  // ── Render lista ─────────────────────────────────────────────────────────────
  function renderLista(insumos) {
    const lista = document.getElementById('lev-lista')
    if (!lista) return
    if (!insumos.length) {
      lista.innerHTML = '<p style="color:var(--color-text-muted);padding:24px 0">Sin insumos.</p>'
      return
    }

    const porGrupo = {}
    insumos.forEach(p => {
      const g = p.grupo || 'Sin grupo'
      if (!porGrupo[g]) porGrupo[g] = []
      porGrupo[g].push(p)
    })

    lista.innerHTML = Object.entries(porGrupo).map(([grupo, items]) => {
      const cap = items.filter(p => esCaptured(p.id_producto)).length
      const gKey = grupo.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')
      return `
        <div style="margin-bottom:4px">
          <div style="padding:7px 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--color-text-muted);display:flex;justify-content:space-between">
            <span>${grupo}</span>
            <span id="lev-gc-${gKey}" style="color:var(--color-primary)">${cap}/${items.length}</span>
          </div>
          ${items.map(p => {
            const captured = esCaptured(p.id_producto)
            const borderColor = captured ? '#3A8C3E' : 'var(--color-border)'
            const bgCard = captured ? 'var(--color-surface-raised,var(--color-surface))' : 'var(--color-surface)'
            return `
              <div id="lev-card-${p.id_producto}"
                style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--color-border);background:${bgCard}">
                <div style="flex:1;min-width:0">
                  <div style="font-size:15px;font-weight:600">${p.producto}</div>
                  <div style="font-size:12px;color:var(--color-text-muted)">${p.unidad_medida || '—'}${p.clasificacion_abc ? ' · ' + p.clasificacion_abc : ''}</div>
                </div>
                <input type="number" id="lev-qty-${p.id_producto}"
                  placeholder="—" min="0" step="any" inputmode="decimal"
                  value="${levValores[p.id_producto] ?? ''}"
                  style="width:88px;flex-shrink:0;padding:10px 6px;border:2px solid ${borderColor};border-radius:8px;font-size:22px;font-weight:700;text-align:center;color:var(--color-primary);background:var(--color-surface);-webkit-appearance:none"
                  oninput="window._levOnQty(${JSON.stringify(p.id_producto)}, ${JSON.stringify(grupo)}, this)">
              </div>`
          }).join('')}
        </div>`
    }).join('')
  }

  // ── Callbacks globales (necesarios para oninput en strings HTML) ─────────────
  window._levOnQty = function(id, grupo, input) {
    levValores[id] = input.value
    const card = document.getElementById('lev-card-' + id)
    const captured = input.value !== '' && !isNaN(parseFloat(input.value))
    if (card) card.style.background = captured ? 'var(--color-surface-raised,var(--color-surface))' : 'var(--color-surface)'
    input.style.borderColor = captured ? '#3A8C3E' : 'var(--color-border)'
    // Actualizar contador del grupo
    const gKey = grupo.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')
    const items = levInsumos.filter(p => (p.grupo || 'Sin grupo') === grupo)
    const cap   = items.filter(p => esCaptured(p.id_producto)).length
    const gcEl  = document.getElementById('lev-gc-' + gKey)
    if (gcEl) gcEl.textContent = `${cap}/${items.length}`
    renderGruposNav()
    actualizarProgreso()
  }

  window._levFiltrarGrupo = function(grupo) {
    guardarValoresDom()
    levGrupoActivo = grupo
    const s = document.getElementById('lev-search')
    if (s) s.value = ''
    renderGruposNav()
    renderLista(insumosVisibles())
  }

  document.getElementById('lev-search').addEventListener('input', () => {
    guardarValoresDom()
    renderLista(insumosVisibles())
  })

  // ── Guardar ──────────────────────────────────────────────────────────────────
  async function guardar(cerrar) {
    const btnB = document.getElementById('lev-btn-borrador')
    const btnC = document.getElementById('lev-btn-cerrar')
    btnB.disabled = true; btnC.disabled = true
    btnB.textContent = 'Guardando…'; btnC.textContent = 'Guardando…'

    const fecha = document.getElementById('lev-fecha')?.value || new Date().toISOString().split('T')[0]
    const abc   = document.getElementById('lev-abc')?.value   || 'todos'
    const area  = document.getElementById('lev-area')?.value  || null

    try {
      const tenant_id = await getTenantId()

      if (!levInventarioId) {
        const { data: inv, error: errI } = await window._db.from('inventarios').insert({
          tenant_id,
          fecha,
          clasificacion: abc,
          area:          area || null,
          estado:        'borrador',
          creado_por:    window._email || null
        }).select('id').single()
        if (errI) throw errI
        levInventarioId = inv.id
      }

      guardarValoresDom()
      const rows = levInsumos.map(p => {
        const val = levValores[p.id_producto]
        if (val === '' || val == null) return null
        const cant = parseFloat(val)
        if (isNaN(cant)) return null
        return {
          id_inventario:          levInventarioId,
          tenant_id,
          id_producto:            p.id_producto,
          clasificacion_abc_snap: p.clasificacion_abc || null,
          cantidad_contada:       cant
        }
      }).filter(Boolean)

      // Borrar items anteriores y reinsertar
      await window._db.from('inventario_items').delete().eq('id_inventario', levInventarioId)
      if (rows.length > 0) {
        const { error: errR } = await window._db.from('inventario_items').insert(rows)
        if (errR) throw errR
      }

      if (cerrar) {
        const { error: errU } = await window._db.from('inventarios')
          .update({ estado: 'completo', updated_at: new Date().toISOString() })
          .eq('id', levInventarioId)
        if (errU) throw errU

        document.getElementById('lev-confirm-msg').textContent = `${rows.length} insumos registrados`
        document.getElementById('lev-cuerpo').style.display  = 'none'
        document.getElementById('lev-confirm').style.display = ''
      } else {
        btnB.textContent = '✓ Borrador guardado'
        btnC.textContent = '✓ Cerrar inventario'
        setTimeout(() => {
          btnB.textContent = '💾 Guardar borrador'
          btnC.textContent = '✓ Cerrar inventario'
          btnB.disabled = false; btnC.disabled = false
        }, 1500)
      }
    } catch (e) {
      errEl().textContent = 'Error: ' + e.message
      btnB.disabled = false; btnC.disabled = false
      btnB.textContent = '💾 Guardar borrador'
      btnC.textContent = '✓ Cerrar inventario'
    }
  }

  document.getElementById('lev-btn-borrador').addEventListener('click', () => guardar(false))
  document.getElementById('lev-btn-cerrar').addEventListener('click',   () => guardar(true))

  // ── Nuevo levantamiento ───────────────────────────────────────────────────────
  document.getElementById('lev-btn-nuevo').addEventListener('click', () => {
    levInsumos = []; levInventarioId = null; levGrupos = []; levGrupoActivo = 'todos'; levValores = {}
    document.getElementById('lev-confirm').style.display = 'none'
    document.getElementById('lev-cuerpo').style.display  = 'none'
    document.getElementById('lev-filtros').style.display = ''
    document.getElementById('lev-fecha').value = new Date().toISOString().split('T')[0]
    errEl().textContent = ''
  })
}
