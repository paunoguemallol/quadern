import { supabase } from "./supabaseClient";

// Convertim el nom d'usuari en un correu "intern" (l'usuari mai no el veu).
function toEmail(username) {
  const slug = username
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!slug) throw new Error("El nom d'usuari ha de tenir lletres o números.");
  return `${slug}@quadern.app`;
}

async function fetchProfileName(userId, fallback) {
  const { data } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
  return data?.username || fallback;
}

export async function registerUser(username, password) {
  const uname = username.trim();
  const { data, error } = await supabase.auth.signUp({ email: toEmail(uname), password });
  if (error) {
    if (/already/i.test(error.message)) throw new Error("Ja existeix un usuari amb aquest nom.");
    if (/password/i.test(error.message)) throw new Error("La contrasenya ha de tenir almenys 6 caràcters.");
    throw new Error(error.message);
  }
  if (!data.session) throw new Error("Cal desactivar 'Confirm email' a Supabase (Authentication → Sign In / Providers → Email).");
  await supabase.from("profiles").insert({ id: data.user.id, username: uname });
  return uname;
}

export async function loginUser(username, password) {
  const uname = username.trim();
  const { data, error } = await supabase.auth.signInWithPassword({ email: toEmail(uname), password });
  if (error) throw new Error("Usuari o contrasenya incorrectes.");
  return fetchProfileName(data.user.id, uname);
}

export async function getSessionUser() {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  return fetchProfileName(user.id, null);
}

export async function logoutUser() {
  await supabase.auth.signOut();
}
