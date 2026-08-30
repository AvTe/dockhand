import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service role key — bypasses row
 * level security, so this file must never be imported into client
 * ("use client") components. Use only inside API routes / server code.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Check your .env.local against .env.example."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
