-- Enable row level security on every table.
--
-- Supabase exposes the public schema through PostgREST, and the anon role had
-- both read and write on all of these. Anyone holding the anon key -- a value
-- that is NEXT_PUBLIC_ by design and ships to the browser the moment any
-- client-side Supabase code exists -- could read shops.access_token, which is
-- a merchant's Shopify Admin API token, and could write to every table.
--
-- No policies are added deliberately. RLS with no policy denies everything to
-- anon and authenticated, while the service role bypasses RLS entirely -- and
-- getSupabaseAdmin() (service role) is the only database client in the app.
-- So this closes external access and changes nothing for the app itself.
--
-- When the rules UI needs browser reads, add narrowly-scoped policies here
-- rather than turning RLS back off.

alter table public.shops        enable row level security;
alter table public.integrations enable row level security;
alter table public.rules        enable row level security;
alter table public.sync_events  enable row level security;
alter table public.oauth_states enable row level security;
