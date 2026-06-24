-- Migration 054: per-template WhatsApp automation toggles
--
-- The Recent Sends panel was flooding with failure notifications
-- on misconfigured tokens because every status-change event fires
-- every template. Owners also want to opt out of specific
-- templates (e.g. "send confirmations only — skip the on-the-way
-- and arrived templates that don't fit our workflow").
--
-- Seven new boolean columns on `salons`:
--   * whatsapp_enabled — master kill-switch. When false, no
--     template fires regardless of the per-template flags. The
--     dispatch path short-circuits before hitting Meta, so the
--     Recent Sends log stays quiet and the activity bell doesn't
--     get spammed with token errors.
--   * whatsapp_send_<template> — one per dispatched template.
--     Owners can disable individual ones independently.
--
-- All default to TRUE so existing salons keep the current
-- "send everything" behavior — only those who actively toggle off
-- change behavior.

alter table salons
  add column if not exists whatsapp_enabled boolean not null default true,
  add column if not exists whatsapp_send_appointment_confirmation boolean not null default true,
  add column if not exists whatsapp_send_appointment_updated boolean not null default true,
  add column if not exists whatsapp_send_appointment_cancelled boolean not null default true,
  add column if not exists whatsapp_send_staff_on_the_way boolean not null default true,
  add column if not exists whatsapp_send_staff_arrived boolean not null default true,
  add column if not exists whatsapp_send_payment_paid boolean not null default true;

NOTIFY pgrst, 'reload schema';
