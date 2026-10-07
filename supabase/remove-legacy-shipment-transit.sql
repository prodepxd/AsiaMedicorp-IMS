-- Asia Medicorp IMS
-- Remove the legacy, unused shipment/transit scaffolding.
-- This is an incremental migration. DO NOT run inventory-redesign.sql.
--
-- These tables were verified to contain no data before removal.
-- The new Shipment/Transit implementation will be designed separately.

begin;

drop table if exists public.transit_events;
drop table if exists public.shipment_items;
drop table if exists public.item_photos;
drop table if exists public.purchase_items;
drop table if exists public.sale_items;
drop table if exists public.shipments;

commit;
