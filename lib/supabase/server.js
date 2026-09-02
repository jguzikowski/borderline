import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Reads the signed-in user from cookies. Respects row level security.
export function serverClient() {
  const store = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set. " +
      "In Vercel, check Settings > Environment Variables and that Production is ticked."
    );
  }
  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try { list.forEach(({ name, value, options }) => store.set(name, value, options)); }
          catch { /* called from a server component; middleware refreshes instead */ }
        },
      },
    }
  );
}

// Bypasses row level security. Only ever used inside API routes, never
// imported into a client component.
export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}
