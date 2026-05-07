const { createClient } = window.supabase

const supabaseUrl = 'https://gzawztrjekesklzepatf.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6YXd6dHJqZWtlc2tsemVwYXRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDMwMTQsImV4cCI6MjA5MzQxOTAxNH0.88INicH2fkZ-jsIoNpx9kP6510yel-ADLyExGlDCBX4'

export const supabaseClient = createClient(supabaseUrl, supabaseKey)
export { supabaseClient as supabase }
