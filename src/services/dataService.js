import { supabase } from "./supabaseClient";

// Llegeix una clau de dades de l'usuari actual (RLS ja filtra per usuari).
export async function getItem(key, fallback) {
  const { data, error } = await supabase.from("user_data").select("value").eq("key", key).maybeSingle();
  if (error || !data) return fallback;
  return data.value;
}

// Desa (upsert) una clau de dades per a l'usuari actual.
export async function setItem(key, value) {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return;
  await supabase.from("user_data").upsert({
    user_id: user.id, key, value, updated_at: new Date().toISOString(),
  });
}
