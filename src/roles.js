import { supabase } from './lib/supabase.js'

export async function getRol() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return user.user_metadata?.rol || null
}

export async function esAdmin() {
  return await getRol() === 'admin'
}

export async function esEditor() {
  return await getRol() === 'editor'
}

export async function esOperador() {
  return await getRol() === 'operador'
}
