import { readFileSync, writeFileSync } from 'fs'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  console.error('ERROR: SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY no definidas')
  process.exit(1)
}

const path = 'public/src/supabase.js'
let content = readFileSync(path, 'utf8')
content = content
  .replace('%%SUPABASE_URL%%', url)
  .replace('%%SUPABASE_PUBLISHABLE_KEY%%', key)
writeFileSync(path, content)
console.log('supabase.js inyectado correctamente')
