import { supabase } from './lib/supabase.js'

export async function listarProductos(tenant_id) {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('activo', true)
    .eq('tenant_id', tenant_id)
  if (error) throw error
  return data
}

export async function buscarProducto(id_producto) {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('id_producto', id_producto)
    .single()
  if (error) throw error
  return data
}

export async function crearProducto(producto) {
  const { data, error } = await supabase
    .from('productos')
    .insert([producto])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function actualizarProducto(id_producto, cambios) {
  const { data, error } = await supabase
    .from('productos')
    .update(cambios)
    .eq('id_producto', id_producto)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function desactivarProducto(id_producto) {
  const { data, error } = await supabase
    .from('productos')
    .update({ activo: false })
    .eq('id_producto', id_producto)
    .select()
    .single()
  if (error) throw error
  return data
}
