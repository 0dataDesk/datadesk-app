const { createClient } = window.supabase

const supabaseUrl = 'https://gzawztrjekesklzepatf.supabase.co'
const supabaseKey = 'sb_publishable_EFa8K18Ho6mENPOv5GsREQ__6FnC1jO'

export const supabaseClient = createClient(supabaseUrl, supabaseKey)
export { supabaseClient as supabase }
