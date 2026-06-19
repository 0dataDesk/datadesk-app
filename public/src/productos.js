async function _metaActualizacion() {
  const meta = { updated_at: new Date().toISOString(), updated_by: null }
  try {
    const { data: { user } } = await window._db.auth.getUser()
    meta.updated_by = user?.email || null
  } catch (e) { console.error('getUser:', e) }
  return meta
}

async function listarProductos(tenant_id) {
  const { data, error } = await window._db
    .from('productos')
    .select('*')
    .eq('activo', true)
    .eq('tenant_id', tenant_id)
  if (error) throw error
  return data
}

async function buscarProducto(id_producto) {
  const { data, error } = await window._db
    .from('productos')
    .select('*')
    .eq('id_producto', id_producto)
    .single()
  if (error) throw error
  return data
}

async function crearProducto(producto) {
  const meta = await _metaActualizacion()
  const { data, error } = await window._db
    .from('productos')
    .insert([{ ...producto, ...meta }])
    .select()
    .single()
  if (error) throw error
  return data
}

async function actualizarProducto(id_producto, cambios) {
  const meta = await _metaActualizacion()
  const { data, error } = await window._db
    .from('productos')
    .update({ ...cambios, ...meta })
    .eq('id_producto', id_producto)
    .select()
    .single()
  if (error) throw error
  return data
}

async function desactivarProducto(id_producto) {
  const meta = await _metaActualizacion()
  const { data, error } = await window._db
    .from('productos')
    .update({ activo: false, ...meta })
    .eq('id_producto', id_producto)
    .select()
    .single()
  if (error) throw error
  return data
}
