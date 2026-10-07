-- Asia Medicorp IMS
-- Remove unused Suppliers and Customers master-data tables.
-- Incremental migration. DO NOT run inventory-redesign.sql.

begin;

drop table if exists public.suppliers cascade;
drop table if exists public.customers cascade;

commit;
