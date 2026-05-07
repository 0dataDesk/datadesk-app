async function getRol() {
  const { data: { user } } = await window._db.auth.getUser()
  if (!user) return null
  return user.user_metadata?.rol || null
}

async function esAdmin() {
  return await getRol() === 'admin'
}

async function esEditor() {
  return await getRol() === 'editor'
}

async function esOperador() {
  return await getRol() === 'operador'
}
