async function listarRecetas(tenant_id) {
  const { data, error } = await window._db
    .from('catalogo_recetas')
    .select('*')
    .eq('activo', true)
    .eq('tenant_id', tenant_id)
  if (error) throw error
  return data
}

async function buscarReceta(id_receta) {
  const { data, error } = await window._db
    .from('catalogo_recetas')
    .select('*')
    .eq('id_receta', id_receta)
    .single()
  if (error) throw error
  return data
}

async function crearReceta(receta) {
  const { data, error } = await window._db
    .from('catalogo_recetas')
    .insert([receta])
    .select()
    .single()
  if (error) throw error
  return data
}

async function desactivarReceta(id_receta) {
  const { data, error } = await window._db
    .from('catalogo_recetas')
    .update({ activo: false })
    .eq('id_receta', id_receta)
    .select()
    .single()
  if (error) throw error
  return data
}

async function listarIngredientes(id_receta) {
  const { data, error } = await window._db
    .from('receta_ingredientes')
    .select('*')
    .eq('id_receta', id_receta)
  if (error) throw error
  return data
}

async function crearIngrediente(ingrediente) {
  const { data, error } = await window._db
    .from('receta_ingredientes')
    .insert([ingrediente])
    .select()
    .single()
  if (error) throw error
  return data
}

async function listarProcedimientos(id_receta) {
  const { data, error } = await window._db
    .from('receta_procedimientos')
    .select('*')
    .eq('id_receta', id_receta)
    .order('paso_num', { ascending: true })
  if (error) throw error
  return data
}

async function crearProcedimiento(paso) {
  const { data, error } = await window._db
    .from('receta_procedimientos')
    .insert([paso])
    .select()
    .single()
  if (error) throw error
  return data
}
