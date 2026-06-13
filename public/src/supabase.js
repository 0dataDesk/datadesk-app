const { createClient } = supabase
window._db = createClient(
  'SUPABASE_URL_PLACEHOLDER',
  'SUPABASE_KEY_PLACEHOLDER'
)
