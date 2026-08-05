import { createClient } from "@supabase/supabase-js";

/** Cliente server-side com service_role — nunca importe em componente client. */
export function serverSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
