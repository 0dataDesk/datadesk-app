import { readFileSync, writeFileSync } from 'fs'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  console.error('ERROR: SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY no definidas')
  process.exit(1)
}

const path = 'public/src/supabase.js'
let content = readFileSync(path, 'utf8')

if (!content.includes('SUPABASE_URL_PLACEHOLDER')) {
  console.log('supabase.js ya fue inyectado, saltando.')
  process.exit(0)
}

content = content
  .replace('SUPABASE_URL_PLACEHOLDER', url)
  .replace('SUPABASE_KEY_PLACEHOLDER', key)

writeFileSync(path, content)
console.log('supabase.js inyectado correctamente:', url.slice(0, 30) + '...')