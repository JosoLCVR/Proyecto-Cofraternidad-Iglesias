// Copia este archivo como supabase-config.js y completa los valores de tu proyecto.
// Usa únicamente la clave pública anon en el navegador.
const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'TU_CLAVE_PUBLICA_ANON';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);