-- CSRF protection for the ClickUp and Monday OAuth flows.
--
-- Before this, both callbacks read shop_id straight off the query string, so
-- anyone who could get a merchant to load a crafted callback URL could bind
-- their own ClickUp workspace to that merchant's shop -- meaning the shop's
-- order data would start flowing into an attacker's board.
--
-- The authorize route now mints a random nonce tied to (shop, provider) and
-- sends it as the OAuth `state`. The callback consumes it. Consumption is a
-- single conditional UPDATE ... RETURNING so it is atomic: two concurrent
-- callbacks replaying the same nonce cannot both succeed.

create table oauth_states (
  nonce text primary key,
  shop_id uuid not null references shops(id) on delete cascade,
  provider text not null check (provider in ('clickup', 'monday')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

-- Sweeping expired rows and looking up a shop's in-flight states.
create index on oauth_states (expires_at);
create index on oauth_states (shop_id);
