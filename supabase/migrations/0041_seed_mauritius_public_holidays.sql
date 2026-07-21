-- KushHR: seed Mauritius public holidays for 2026 and 2027.
--
-- Source: officeholidays.com (Government of Mauritius gazette site refused
-- direct fetch during preparation). User reviewed and confirmed the list
-- before this migration was committed.
--
-- Lunar-calendar caveats: Eid-Ul-Fitr dates depend on moon-sighting and are
-- marked is_tentative = true so the admin UI surfaces a "confirm with gazette"
-- badge. Other movable holidays (Diwali, Ganesh Chaturthi, Ougadi, Cavadee,
-- Maha Shivaratree) are pre-published in the annual gazette and are seeded
-- as confirmed.
--
-- 2026-02-01 carries two distinct holidays on the same date (Abolition of
-- Slavery + Thaipoosam Cavadee). Migration 0040 unique key includes name so
-- both rows coexist; working_days() treats the date as non-working regardless.
--
-- Idempotency: `on conflict do nothing` so re-running the migration on an
-- environment that already has these rows is safe.

insert into public.public_holidays (date, name, country_code, is_active, is_tentative) values
  -- 2026
  ('2026-01-01', 'New Year''s Day',                  'MU', true, false),
  ('2026-01-02', 'New Year''s Holiday',              'MU', true, false),
  ('2026-02-01', 'Abolition of Slavery',             'MU', true, false),
  ('2026-02-01', 'Thaipoosam Cavadee',               'MU', true, false),
  ('2026-02-15', 'Maha Shivaratree',                 'MU', true, false),
  ('2026-02-17', 'Chinese Spring Festival',          'MU', true, false),
  ('2026-03-12', 'Independence and Republic Day',    'MU', true, false),
  ('2026-03-19', 'Ougadi',                           'MU', true, false),
  ('2026-03-21', 'Eid-Ul-Fitr',                      'MU', true, true),
  ('2026-05-01', 'Labour Day',                       'MU', true, false),
  ('2026-08-15', 'Assumption Day',                   'MU', true, false),
  ('2026-09-16', 'Ganesh Chaturthi',                 'MU', true, false),
  ('2026-11-02', 'Arrival of Indentured Labourers',  'MU', true, false),
  ('2026-11-08', 'Diwali',                           'MU', true, false),
  ('2026-12-25', 'Christmas Day',                    'MU', true, false),
  -- 2027
  ('2027-01-01', 'New Year''s Day',                  'MU', true, false),
  ('2027-01-02', 'New Year''s Holiday',              'MU', true, false),
  ('2027-01-22', 'Thaipoosam Cavadee',               'MU', true, false),
  ('2027-02-01', 'Abolition of Slavery',             'MU', true, false),
  ('2027-02-06', 'Chinese Spring Festival',          'MU', true, false),
  ('2027-03-06', 'Maha Shivaratree',                 'MU', true, false),
  ('2027-03-09', 'Eid-Ul-Fitr',                      'MU', true, true),
  ('2027-03-12', 'Independence and Republic Day',    'MU', true, false),
  ('2027-04-07', 'Ougadi',                           'MU', true, false),
  ('2027-05-01', 'Labour Day',                       'MU', true, false),
  ('2027-08-15', 'Assumption Day',                   'MU', true, false),
  ('2027-09-04', 'Ganesh Chaturthi',                 'MU', true, false),
  ('2027-10-29', 'Diwali',                           'MU', true, false),
  ('2027-11-02', 'Arrival of Indentured Labourers',  'MU', true, false),
  ('2027-12-25', 'Christmas Day',                    'MU', true, false)
on conflict do nothing;
