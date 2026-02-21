-- Migration: 0088_rename_tee_bookings_to_tee_times
-- Description: Rename all tee_booking* tables and columns to tee_time* equivalents

-- ── Drop existing indexes (will be recreated with new names) ─────

DROP INDEX IF EXISTS idx_tee_bookings_tenant_course_date;
DROP INDEX IF EXISTS idx_tee_bookings_tenant_order;
DROP INDEX IF EXISTS idx_tee_booking_slots_tenant_booking;
DROP INDEX IF EXISTS idx_tee_booking_players_tenant_booking;
DROP INDEX IF EXISTS idx_tee_booking_players_tenant_customer;
DROP INDEX IF EXISTS idx_tee_booking_order_lines_tenant_booking;
DROP INDEX IF EXISTS idx_tee_booking_payments_tenant_booking;
DROP INDEX IF EXISTS idx_tee_booking_repetitions_tenant_course;
DROP INDEX IF EXISTS idx_tee_booking_repetition_members_tenant_rep;
DROP INDEX IF EXISTS idx_tee_booking_repetition_rules_tenant_rep;
DROP INDEX IF EXISTS idx_tee_booking_rep_rule_interps_tenant_rep;
DROP INDEX IF EXISTS idx_tee_booking_repetition_slots_tenant_rep;

-- ── Drop existing RLS policies ──────────────────────────────────

DROP POLICY IF EXISTS tee_bookings_select ON tee_bookings;
DROP POLICY IF EXISTS tee_bookings_insert ON tee_bookings;
DROP POLICY IF EXISTS tee_bookings_update ON tee_bookings;
DROP POLICY IF EXISTS tee_bookings_delete ON tee_bookings;

DROP POLICY IF EXISTS tee_booking_slots_select ON tee_booking_slots;
DROP POLICY IF EXISTS tee_booking_slots_insert ON tee_booking_slots;
DROP POLICY IF EXISTS tee_booking_slots_update ON tee_booking_slots;
DROP POLICY IF EXISTS tee_booking_slots_delete ON tee_booking_slots;

DROP POLICY IF EXISTS tee_booking_players_select ON tee_booking_players;
DROP POLICY IF EXISTS tee_booking_players_insert ON tee_booking_players;
DROP POLICY IF EXISTS tee_booking_players_update ON tee_booking_players;
DROP POLICY IF EXISTS tee_booking_players_delete ON tee_booking_players;

DROP POLICY IF EXISTS tee_booking_order_lines_select ON tee_booking_order_lines;
DROP POLICY IF EXISTS tee_booking_order_lines_insert ON tee_booking_order_lines;
DROP POLICY IF EXISTS tee_booking_order_lines_update ON tee_booking_order_lines;
DROP POLICY IF EXISTS tee_booking_order_lines_delete ON tee_booking_order_lines;

DROP POLICY IF EXISTS tee_booking_payments_select ON tee_booking_payments;
DROP POLICY IF EXISTS tee_booking_payments_insert ON tee_booking_payments;
DROP POLICY IF EXISTS tee_booking_payments_update ON tee_booking_payments;
DROP POLICY IF EXISTS tee_booking_payments_delete ON tee_booking_payments;

DROP POLICY IF EXISTS tee_booking_repetitions_select ON tee_booking_repetitions;
DROP POLICY IF EXISTS tee_booking_repetitions_insert ON tee_booking_repetitions;
DROP POLICY IF EXISTS tee_booking_repetitions_update ON tee_booking_repetitions;
DROP POLICY IF EXISTS tee_booking_repetitions_delete ON tee_booking_repetitions;

DROP POLICY IF EXISTS tee_booking_repetition_members_select ON tee_booking_repetition_members;
DROP POLICY IF EXISTS tee_booking_repetition_members_insert ON tee_booking_repetition_members;
DROP POLICY IF EXISTS tee_booking_repetition_members_update ON tee_booking_repetition_members;
DROP POLICY IF EXISTS tee_booking_repetition_members_delete ON tee_booking_repetition_members;

DROP POLICY IF EXISTS tee_booking_repetition_rules_select ON tee_booking_repetition_rules;
DROP POLICY IF EXISTS tee_booking_repetition_rules_insert ON tee_booking_repetition_rules;
DROP POLICY IF EXISTS tee_booking_repetition_rules_update ON tee_booking_repetition_rules;
DROP POLICY IF EXISTS tee_booking_repetition_rules_delete ON tee_booking_repetition_rules;

DROP POLICY IF EXISTS tee_booking_repetition_rule_interpretations_select ON tee_booking_repetition_rule_interpretations;
DROP POLICY IF EXISTS tee_booking_repetition_rule_interpretations_insert ON tee_booking_repetition_rule_interpretations;
DROP POLICY IF EXISTS tee_booking_repetition_rule_interpretations_update ON tee_booking_repetition_rule_interpretations;
DROP POLICY IF EXISTS tee_booking_repetition_rule_interpretations_delete ON tee_booking_repetition_rule_interpretations;

DROP POLICY IF EXISTS tee_booking_repetition_slots_select ON tee_booking_repetition_slots;
DROP POLICY IF EXISTS tee_booking_repetition_slots_insert ON tee_booking_repetition_slots;
DROP POLICY IF EXISTS tee_booking_repetition_slots_update ON tee_booking_repetition_slots;
DROP POLICY IF EXISTS tee_booking_repetition_slots_delete ON tee_booking_repetition_slots;

-- ── Drop FK constraints that reference old table names ──────────

ALTER TABLE tee_booking_slots DROP CONSTRAINT IF EXISTS tee_booking_slots_tee_booking_id_tee_bookings_id_fk;
ALTER TABLE tee_booking_players DROP CONSTRAINT IF EXISTS tee_booking_players_tee_booking_id_tee_bookings_id_fk;
ALTER TABLE tee_booking_order_lines DROP CONSTRAINT IF EXISTS tee_booking_order_lines_tee_booking_id_tee_bookings_id_fk;
ALTER TABLE tee_booking_payments DROP CONSTRAINT IF EXISTS tee_booking_payments_tee_booking_id_tee_bookings_id_fk;
ALTER TABLE tee_booking_repetition_members DROP CONSTRAINT IF EXISTS tee_booking_repetition_members_repetition_id_tee_booking_repetitions_id_fk;
ALTER TABLE tee_booking_repetition_rules DROP CONSTRAINT IF EXISTS tee_booking_repetition_rules_repetition_id_tee_booking_repetitions_id_fk;
ALTER TABLE tee_booking_repetition_rule_interpretations DROP CONSTRAINT IF EXISTS tee_booking_repetition_rule_interpretations_repetition_id_tee_booking_repetitions_id_fk;
ALTER TABLE tee_booking_repetition_slots DROP CONSTRAINT IF EXISTS tee_booking_repetition_slots_repetition_id_tee_booking_repetitions_id_fk;

-- Also drop the FK hardening constraints from migration 0045
ALTER TABLE tee_bookings DROP CONSTRAINT IF EXISTS fk_tee_bookings_course;
ALTER TABLE tee_booking_repetitions DROP CONSTRAINT IF EXISTS fk_tee_booking_repetitions_course;
ALTER TABLE tee_booking_repetition_rule_interpretations DROP CONSTRAINT IF EXISTS fk_tee_booking_rep_rule_interp_rule;

-- ── Rename columns BEFORE renaming tables ───────────────────────
-- (Column renames reference the current table name)

ALTER TABLE tee_booking_slots RENAME COLUMN tee_booking_id TO tee_time_id;
ALTER TABLE tee_booking_players RENAME COLUMN tee_booking_id TO tee_time_id;
ALTER TABLE tee_booking_order_lines RENAME COLUMN tee_booking_id TO tee_time_id;
ALTER TABLE tee_booking_order_lines RENAME COLUMN tee_booking_player_id TO tee_time_player_id;
ALTER TABLE tee_booking_payments RENAME COLUMN tee_booking_id TO tee_time_id;
ALTER TABLE tee_booking_payments RENAME COLUMN tee_booking_player_id TO tee_time_player_id;

-- Rename tee_booking_id columns in other tables
ALTER TABLE tee_time_order_items RENAME COLUMN tee_booking_id TO tee_time_id;
ALTER TABLE tee_blocked_slots RENAME COLUMN tee_booking_id TO tee_time_id;
ALTER TABLE punch_card_usages RENAME COLUMN tee_booking_order_line_id TO tee_time_order_line_id;
ALTER TABLE customer_location_settings RENAME COLUMN disable_online_tee_bookings TO disable_online_tee_times;

-- ── Rename tables ───────────────────────────────────────────────

ALTER TABLE tee_bookings RENAME TO tee_times;
ALTER TABLE tee_booking_slots RENAME TO tee_time_slots;
ALTER TABLE tee_booking_players RENAME TO tee_time_players;
ALTER TABLE tee_booking_order_lines RENAME TO tee_time_order_lines;
ALTER TABLE tee_booking_payments RENAME TO tee_time_payments;
ALTER TABLE tee_booking_repetitions RENAME TO tee_time_repetitions;
ALTER TABLE tee_booking_repetition_members RENAME TO tee_time_repetition_members;
ALTER TABLE tee_booking_repetition_rules RENAME TO tee_time_repetition_rules;
ALTER TABLE tee_booking_repetition_rule_interpretations RENAME TO tee_time_repetition_rule_interpretations;
ALTER TABLE tee_booking_repetition_slots RENAME TO tee_time_repetition_slots;

-- ── Recreate FK constraints with new names ──────────────────────

ALTER TABLE tee_time_slots
  ADD CONSTRAINT tee_time_slots_tee_time_id_tee_times_id_fk
  FOREIGN KEY (tee_time_id) REFERENCES tee_times(id) ON DELETE CASCADE;

ALTER TABLE tee_time_players
  ADD CONSTRAINT tee_time_players_tee_time_id_tee_times_id_fk
  FOREIGN KEY (tee_time_id) REFERENCES tee_times(id) ON DELETE CASCADE;

ALTER TABLE tee_time_order_lines
  ADD CONSTRAINT tee_time_order_lines_tee_time_id_tee_times_id_fk
  FOREIGN KEY (tee_time_id) REFERENCES tee_times(id) ON DELETE CASCADE;

ALTER TABLE tee_time_payments
  ADD CONSTRAINT tee_time_payments_tee_time_id_tee_times_id_fk
  FOREIGN KEY (tee_time_id) REFERENCES tee_times(id) ON DELETE CASCADE;

ALTER TABLE tee_time_repetition_members
  ADD CONSTRAINT tee_time_repetition_members_repetition_id_tee_time_repetitions_id_fk
  FOREIGN KEY (repetition_id) REFERENCES tee_time_repetitions(id) ON DELETE CASCADE;

ALTER TABLE tee_time_repetition_rules
  ADD CONSTRAINT tee_time_repetition_rules_repetition_id_tee_time_repetitions_id_fk
  FOREIGN KEY (repetition_id) REFERENCES tee_time_repetitions(id) ON DELETE CASCADE;

ALTER TABLE tee_time_repetition_rule_interpretations
  ADD CONSTRAINT tee_time_repetition_rule_interps_repetition_id_tee_time_reps_id_fk
  FOREIGN KEY (repetition_id) REFERENCES tee_time_repetitions(id) ON DELETE CASCADE;

ALTER TABLE tee_time_repetition_slots
  ADD CONSTRAINT tee_time_repetition_slots_repetition_id_tee_time_repetitions_id_fk
  FOREIGN KEY (repetition_id) REFERENCES tee_time_repetitions(id) ON DELETE CASCADE;

-- Re-add FK hardening constraints with new names
ALTER TABLE tee_times
  ADD CONSTRAINT fk_tee_times_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE tee_time_repetitions
  ADD CONSTRAINT fk_tee_time_repetitions_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE tee_time_repetition_rule_interpretations
  ADD CONSTRAINT fk_tee_time_rep_rule_interp_rule
  FOREIGN KEY (rule_id) REFERENCES tee_time_repetition_rules(id) ON DELETE CASCADE NOT VALID;

-- ── Recreate indexes with new names ─────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tee_times_tenant_course_date ON tee_times (tenant_id, course_id, tee_date);
CREATE INDEX IF NOT EXISTS idx_tee_times_tenant_order ON tee_times (tenant_id, order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tee_time_slots_tenant_time ON tee_time_slots (tenant_id, tee_time_id);
CREATE INDEX IF NOT EXISTS idx_tee_time_players_tenant_time ON tee_time_players (tenant_id, tee_time_id);
CREATE INDEX IF NOT EXISTS idx_tee_time_players_tenant_customer ON tee_time_players (tenant_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tee_time_order_lines_tenant_time ON tee_time_order_lines (tenant_id, tee_time_id);
CREATE INDEX IF NOT EXISTS idx_tee_time_payments_tenant_time ON tee_time_payments (tenant_id, tee_time_id);
CREATE INDEX IF NOT EXISTS idx_tee_time_repetitions_tenant_course ON tee_time_repetitions (tenant_id, course_id);
CREATE INDEX IF NOT EXISTS idx_tee_time_repetition_members_tenant_rep ON tee_time_repetition_members (tenant_id, repetition_id);
CREATE INDEX IF NOT EXISTS idx_tee_time_repetition_rules_tenant_rep ON tee_time_repetition_rules (tenant_id, repetition_id);
CREATE INDEX IF NOT EXISTS idx_tee_time_rep_rule_interps_tenant_rep ON tee_time_repetition_rule_interpretations (tenant_id, repetition_id);
CREATE INDEX IF NOT EXISTS idx_tee_time_repetition_slots_tenant_rep ON tee_time_repetition_slots (tenant_id, repetition_id);

-- ── Recreate RLS policies with new names ────────────────────────

-- tee_times (formerly tee_bookings)
CREATE POLICY tee_times_select ON tee_times FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_times_insert ON tee_times FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_times_update ON tee_times FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_times_delete ON tee_times FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- tee_time_slots
CREATE POLICY tee_time_slots_select ON tee_time_slots FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_slots_insert ON tee_time_slots FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_slots_update ON tee_time_slots FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_slots_delete ON tee_time_slots FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- tee_time_players
CREATE POLICY tee_time_players_select ON tee_time_players FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_players_insert ON tee_time_players FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_players_update ON tee_time_players FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_players_delete ON tee_time_players FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- tee_time_order_lines
CREATE POLICY tee_time_order_lines_select ON tee_time_order_lines FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_order_lines_insert ON tee_time_order_lines FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_order_lines_update ON tee_time_order_lines FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_order_lines_delete ON tee_time_order_lines FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- tee_time_payments
CREATE POLICY tee_time_payments_select ON tee_time_payments FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_payments_insert ON tee_time_payments FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_payments_update ON tee_time_payments FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_payments_delete ON tee_time_payments FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- tee_time_repetitions
CREATE POLICY tee_time_repetitions_select ON tee_time_repetitions FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_repetitions_insert ON tee_time_repetitions FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_repetitions_update ON tee_time_repetitions FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_repetitions_delete ON tee_time_repetitions FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- tee_time_repetition_members
CREATE POLICY tee_time_repetition_members_select ON tee_time_repetition_members FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_repetition_members_insert ON tee_time_repetition_members FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_repetition_members_update ON tee_time_repetition_members FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_repetition_members_delete ON tee_time_repetition_members FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- tee_time_repetition_rules
CREATE POLICY tee_time_repetition_rules_select ON tee_time_repetition_rules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_repetition_rules_insert ON tee_time_repetition_rules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_repetition_rules_update ON tee_time_repetition_rules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_repetition_rules_delete ON tee_time_repetition_rules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- tee_time_repetition_rule_interpretations
CREATE POLICY tee_time_repetition_rule_interpretations_select ON tee_time_repetition_rule_interpretations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_repetition_rule_interpretations_insert ON tee_time_repetition_rule_interpretations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_repetition_rule_interpretations_update ON tee_time_repetition_rule_interpretations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_repetition_rule_interpretations_delete ON tee_time_repetition_rule_interpretations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- tee_time_repetition_slots
CREATE POLICY tee_time_repetition_slots_select ON tee_time_repetition_slots FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_repetition_slots_insert ON tee_time_repetition_slots FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_repetition_slots_update ON tee_time_repetition_slots FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tee_time_repetition_slots_delete ON tee_time_repetition_slots FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── Validate FK constraints ─────────────────────────────────────

ALTER TABLE tee_times VALIDATE CONSTRAINT fk_tee_times_course;
ALTER TABLE tee_time_repetitions VALIDATE CONSTRAINT fk_tee_time_repetitions_course;
ALTER TABLE tee_time_repetition_rule_interpretations VALIDATE CONSTRAINT fk_tee_time_rep_rule_interp_rule;
