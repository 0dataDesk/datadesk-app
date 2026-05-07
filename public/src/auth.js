async function login(email, password) {
  const { data, error } = await window._db.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

async function logout() {
  const { error } = await window._db.auth.signOut()
  if (error) throw error
}

async function getSession() {
  const { data, error } = await window._db.auth.getSession()
  if (error) throw error
  return data.session
}
