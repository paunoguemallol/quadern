import { createClient } from "@supabase/supabase-js";

// La URL i la clau "publishable" són públiques per disseny (la seguretat la donen les polítiques RLS).
const url = import.meta.env.VITE_SUPABASE_URL || "https://calfodvkxdpeicfvdxch.supabase.co";
const key = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_KVvoQocYi4fg1fKzdbzyng_cr-_hlpf";

export const supabase = createClient(url, key);
