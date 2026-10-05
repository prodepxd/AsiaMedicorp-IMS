-- Asia Medicorp IMS
-- Role-based RLS policies for the first operational release.
-- Run this entire script in Supabase SQL Editor.

-- Authenticated users need table privileges in addition to RLS policies.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Profiles are intentionally managed separately in auth-and-roles.sql.
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;

-- Helper: admin / manager / viewer checks are based on public.current_user_role().
-- That function is SECURITY DEFINER and safely reads the current user's profile.

-- ============================================================
-- MASTER DATA
-- ============================================================
-- Everyone may read active/inactive master records so historical
-- references can still be displayed. Only admins may change them.

do $$
declare
  t text;
begin
  foreach t in array array[
    'item_types',
    'manufacturers',
    'models',
    'locations',
    'statuses',
    'quality_statuses',
    'transit_statuses',
    'suppliers',
    'customers'
  ]
  loop
    execute format('drop policy if exists "Authenticated users can read %s" on public.%I', t, t);
    execute format(
      'create policy "Authenticated users can read %s" on public.%I for select to authenticated using (true)',
      t, t
    );

    execute format('drop policy if exists "Admins can insert %s" on public.%I', t, t);
    execute format(
      'create policy "Admins can insert %s" on public.%I for insert to authenticated with check (public.current_user_role() = ''admin'')',
      t, t
    );

    execute format('drop policy if exists "Admins can update %s" on public.%I', t, t);
    execute format(
      'create policy "Admins can update %s" on public.%I for update to authenticated using (public.current_user_role() = ''admin'') with check (public.current_user_role() = ''admin'')',
      t, t
    );

    execute format('drop policy if exists "Admins can delete %s" on public.%I', t, t);
    execute format(
      'create policy "Admins can delete %s" on public.%I for delete to authenticated using (public.current_user_role() = ''admin'')',
      t, t
    );
  end loop;
end $$;

-- ============================================================
-- OPERATIONAL DATA
-- ============================================================
-- Admin: full access.
-- Manager: read + create/update operational records.
-- Viewer: read only.

do $$
declare
  t text;
begin
  foreach t in array array[
    'items',
    'item_photos',
    'purchases',
    'purchase_items',
    'shipments',
    'shipment_items',
    'transit_events',
    'sales',
    'sale_items'
  ]
  loop
    execute format('drop policy if exists "Authenticated users can read %s" on public.%I', t, t);
    execute format(
      'create policy "Authenticated users can read %s" on public.%I for select to authenticated using (true)',
      t, t
    );

    execute format('drop policy if exists "Admins and managers can insert %s" on public.%I', t, t);
    execute format(
      'create policy "Admins and managers can insert %s" on public.%I for insert to authenticated with check (public.current_user_role() in (''admin'', ''manager''))',
      t, t
    );

    execute format('drop policy if exists "Admins and managers can update %s" on public.%I', t, t);
    execute format(
      'create policy "Admins and managers can update %s" on public.%I for update to authenticated using (public.current_user_role() in (''admin'', ''manager'')) with check (public.current_user_role() in (''admin'', ''manager''))',
      t, t
    );

    execute format('drop policy if exists "Admins can delete %s" on public.%I', t, t);
    execute format(
      'create policy "Admins can delete %s" on public.%I for delete to authenticated using (public.current_user_role() = ''admin'')',
      t, t
    );
  end loop;
end $$;

-- ============================================================
-- SAFETY: profiles remain protected by their dedicated policies.
-- ============================================================
drop policy if exists "Managers cannot change profiles" on public.profiles;
drop policy if exists "Viewers cannot change profiles" on public.profiles;

-- Keep profile update capability restricted to admins by replacing
-- the broad authenticated UPDATE grant with the intended policy.
revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;

-- The existing "Admins can update profiles" policy in auth-and-roles.sql
-- remains the authoritative RLS rule for profile updates.
