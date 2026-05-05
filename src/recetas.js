import { supabase } from './lib/supabase.js'

// ── RECETAS ──

export async function listarRecetas(tenant_id) {
  const { data, error } = await supabase
    .from('catalogo_recetas')
    .select('*')
    .eq('activo', true)
    .eq('tenant_id', tenant_id)
  if (error) throw error
  return data
}

export async function buscarReceta(id_receta) {
  const { data, error } = await supabase
    .from('catalogo_recetas')
    .select('*')
    .eq('id_receta', id_receta)
    .single()
  if (error) throw error
  return data
}

export async function crearReceta(receta) {
  const { data, error } = await supabase
    .from('catalogo_recetas')
    .insert([receta])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function desactivarReceta(id_receta) {
  const { data, error } = await supabase
    .from('catalogo_recetas')
    .update({ activo: false })
    .eq('id_receta', id_receta)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── INGREDIENTES ──

export async function listarIngredientes(id_receta) {
  const { data, error } = await supabase
    .from('receta_ingredientes')
    .select('*')
    .eq('id_receta', id_receta)
    .eq('activo', true)
  if (error) throw error
  return data
}

export async function crearIngrediente(ingrediente) {
  const { data, error } = await supabase
    .from('receta_ingredientes')
    .insert([ingrediente])
    .select()
    .single()
  if (error) throw error
  return data
}

// ── PROCEDIMIENTOS ──

export async function listarProcedimientos(id_receta) {
  const { data, error } = await supabase
    .from('receta_procedimientos')
    .select('*')
    .eq('id_receta', id_receta)
    .order('paso_num', { ascending: true })
  if (error) throw error
  return data
}

export async function crearProcedimiento(paso) {
  const { data, error } = await supabase
    .from('receta_procedimientos')
    .insert([paso])
    .select()
    .single()
  if (error) throw error
  return data
}
