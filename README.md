# Quadern

App React + Vite + Tailwind connectada a Supabase (Auth + taula `user_data`).

## Provar-ho en local
1. `npm install`
2. `npm run dev`

## Publicar (Vercel)
1. Puja aquesta carpeta a un repositori de GitHub.
2. A vercel.com → "Add New Project" → tria el repositori → Deploy.
3. Obtindràs una URL pública. Des del mòbil/iPad: "Afegeix a la pantalla d'inici".

## Supabase (ja configurat)
- SQL a `supabase-schema.sql` (taules `profiles` i `user_data` amb RLS).
- Authentication → Providers → Email → "Confirm email" desactivat.
