const { createClient } = supabase

window._db = createClient(
  '%%SUPABASE_URL%%',
  '%%SUPABASE_PUBLISHABLE_KEY%%'
)
