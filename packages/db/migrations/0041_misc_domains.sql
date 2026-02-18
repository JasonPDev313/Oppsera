-- Migration: 0041_misc_domains
-- Misc domain: charities, feedback, flag types, file storage, tasks, task owners,
-- repetition rules, repetition rule interpretations, report options,
-- lottery schedules, lottery class types, lottery requests,
-- game play rounds, game play player info, game play score cards, game play score shots

-- ══════════════════════════════════════════════════════════════════
-- MISC DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── charities ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS charities (
  id                          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                   TEXT NOT NULL REFERENCES tenants(id),
  name                        TEXT NOT NULL,
  credit_chart_of_account_id  TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_charities_tenant_name
  ON charities (tenant_id, name);

ALTER TABLE charities ENABLE ROW LEVEL SECURITY;

CREATE POLICY charities_select ON charities FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY charities_insert ON charities FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY charities_update ON charities FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY charities_delete ON charities FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── feedback ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  customer_id     TEXT,
  feedback_text   TEXT NOT NULL,
  send_to         TEXT,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_tenant_status
  ON feedback (tenant_id, status);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY feedback_select ON feedback FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY feedback_insert ON feedback FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY feedback_update ON feedback FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY feedback_delete ON feedback FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── flag_types ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flag_types (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_flag_types_tenant_name
  ON flag_types (tenant_id, name);

ALTER TABLE flag_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY flag_types_select ON flag_types FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY flag_types_insert ON flag_types FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY flag_types_update ON flag_types FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY flag_types_delete ON flag_types FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── file_storage ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS file_storage (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  url             TEXT NOT NULL,
  file_name       TEXT,
  content_type    TEXT,
  file_size_bytes INTEGER,
  attachment_type TEXT,
  file_path       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_storage_tenant_entity
  ON file_storage (tenant_id, entity_type, entity_id);

ALTER TABLE file_storage ENABLE ROW LEVEL SECURITY;

CREATE POLICY file_storage_select ON file_storage FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY file_storage_insert ON file_storage FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY file_storage_update ON file_storage FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY file_storage_delete ON file_storage FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── tasks ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  title           TEXT NOT NULL,
  description     TEXT,
  requested_by    TEXT,
  due_date        DATE,
  task_status     TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status
  ON tasks (tenant_id, task_status);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_select ON tasks FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tasks_insert ON tasks FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tasks_update ON tasks FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tasks_delete ON tasks FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── task_owners ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_owners (
  id            TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  employee_id   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_owners_tenant_task_employee
  ON task_owners (tenant_id, task_id, employee_id);

ALTER TABLE task_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_owners_select ON task_owners FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY task_owners_insert ON task_owners FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY task_owners_update ON task_owners FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY task_owners_delete ON task_owners FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── repetition_rules ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS repetition_rules (
  id                        TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  repeatable_type           TEXT NOT NULL,
  repeatable_id             TEXT NOT NULL,
  frequency                 TEXT NOT NULL,
  interval_value            INTEGER NOT NULL DEFAULT 1,
  interval_unit             TEXT NOT NULL DEFAULT 'week',
  start_date                DATE NOT NULL,
  end_date                  DATE,
  end_type                  TEXT NOT NULL DEFAULT 'date',
  max_occurrences           INTEGER,
  days_of_week              JSONB,
  monthly_repetition_type   TEXT,
  summary                   TEXT,
  repetition_id             TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repetition_rules_tenant_repeatable
  ON repetition_rules (tenant_id, repeatable_type, repeatable_id);

ALTER TABLE repetition_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY repetition_rules_select ON repetition_rules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY repetition_rules_insert ON repetition_rules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY repetition_rules_update ON repetition_rules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY repetition_rules_delete ON repetition_rules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── repetition_rule_interpretations ───────────────────────────────
CREATE TABLE IF NOT EXISTS repetition_rule_interpretations (
  id                      TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  repeatable_type         TEXT NOT NULL,
  repeatable_id           TEXT NOT NULL,
  repetition_rule_id      TEXT NOT NULL REFERENCES repetition_rules(id) ON DELETE CASCADE,
  first_occurrence_date   DATE NOT NULL,
  day_difference          INTEGER NOT NULL DEFAULT 0,
  repetition_id           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repetition_rule_interpretations_tenant_rule
  ON repetition_rule_interpretations (tenant_id, repetition_rule_id);

ALTER TABLE repetition_rule_interpretations ENABLE ROW LEVEL SECURITY;

CREATE POLICY repetition_rule_interpretations_select ON repetition_rule_interpretations FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY repetition_rule_interpretations_insert ON repetition_rule_interpretations FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY repetition_rule_interpretations_update ON repetition_rule_interpretations FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY repetition_rule_interpretations_delete ON repetition_rule_interpretations FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── report_options ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_options (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  value       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_options_tenant_name
  ON report_options (tenant_id, name);

ALTER TABLE report_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_options_select ON report_options FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY report_options_insert ON report_options FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY report_options_update ON report_options FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY report_options_delete ON report_options FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- LOTTERY DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── lottery_schedules ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lottery_schedules (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  course_id             TEXT NOT NULL,
  lottery_name          TEXT NOT NULL,
  monday                BOOLEAN NOT NULL DEFAULT false,
  tuesday               BOOLEAN NOT NULL DEFAULT false,
  wednesday             BOOLEAN NOT NULL DEFAULT false,
  thursday              BOOLEAN NOT NULL DEFAULT false,
  friday                BOOLEAN NOT NULL DEFAULT false,
  saturday              BOOLEAN NOT NULL DEFAULT false,
  sunday                BOOLEAN NOT NULL DEFAULT false,
  start_month           INTEGER,
  start_day             INTEGER,
  end_month             INTEGER,
  end_day               INTEGER,
  start_time            TIME,
  end_time              TIME,
  booking_window_start  INTEGER,
  booking_window_end    INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lottery_schedules_tenant_course
  ON lottery_schedules (tenant_id, course_id);

ALTER TABLE lottery_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY lottery_schedules_select ON lottery_schedules FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY lottery_schedules_insert ON lottery_schedules FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY lottery_schedules_update ON lottery_schedules FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY lottery_schedules_delete ON lottery_schedules FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── lottery_class_types ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lottery_class_types (
  id                    TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  course_id             TEXT NOT NULL,
  lottery_schedule_id   TEXT NOT NULL REFERENCES lottery_schedules(id) ON DELETE CASCADE,
  class_type_id         TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lottery_class_types_tenant_schedule
  ON lottery_class_types (tenant_id, lottery_schedule_id);

ALTER TABLE lottery_class_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY lottery_class_types_select ON lottery_class_types FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY lottery_class_types_insert ON lottery_class_types FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY lottery_class_types_update ON lottery_class_types FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY lottery_class_types_delete ON lottery_class_types FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── lottery_requests ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lottery_requests (
  id                  TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  course_id           TEXT NOT NULL,
  start_time          TIME NOT NULL,
  earliest_start_time TIME,
  latest_start_time   TIME,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lottery_requests_tenant_course
  ON lottery_requests (tenant_id, course_id);

ALTER TABLE lottery_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY lottery_requests_select ON lottery_requests FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY lottery_requests_insert ON lottery_requests FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY lottery_requests_update ON lottery_requests FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY lottery_requests_delete ON lottery_requests FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ══════════════════════════════════════════════════════════════════
-- GAME PLAY DOMAIN
-- ══════════════════════════════════════════════════════════════════

-- ── game_play_rounds ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_play_rounds (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  course_id         TEXT NOT NULL,
  customer_id       TEXT NOT NULL,
  round_start_from  TEXT,
  scoring_type      TEXT,
  tee_type          TEXT,
  is_quit           BOOLEAN NOT NULL DEFAULT false,
  weather_data      JSONB,
  status            TEXT NOT NULL DEFAULT 'in_progress',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_play_rounds_tenant_course_customer
  ON game_play_rounds (tenant_id, course_id, customer_id);

ALTER TABLE game_play_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY game_play_rounds_select ON game_play_rounds FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY game_play_rounds_insert ON game_play_rounds FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY game_play_rounds_update ON game_play_rounds FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY game_play_rounds_delete ON game_play_rounds FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── game_play_player_info ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_play_player_info (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  round_id        TEXT NOT NULL REFERENCES game_play_rounds(id) ON DELETE CASCADE,
  player_number   INTEGER NOT NULL,
  player_name     TEXT NOT NULL,
  customer_id     TEXT,
  image_url       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_play_player_info_tenant_round
  ON game_play_player_info (tenant_id, round_id);

ALTER TABLE game_play_player_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY game_play_player_info_select ON game_play_player_info FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY game_play_player_info_insert ON game_play_player_info FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY game_play_player_info_update ON game_play_player_info FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY game_play_player_info_delete ON game_play_player_info FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── game_play_score_cards ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_play_score_cards (
  id            TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  round_id      TEXT NOT NULL REFERENCES game_play_rounds(id) ON DELETE CASCADE,
  hole_number   INTEGER NOT NULL,
  distance      INTEGER,
  par           INTEGER NOT NULL,
  scores        JSONB NOT NULL,
  fairways      JSONB,
  putts         JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_game_play_score_cards_tenant_round_hole
  ON game_play_score_cards (tenant_id, round_id, hole_number);

ALTER TABLE game_play_score_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY game_play_score_cards_select ON game_play_score_cards FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY game_play_score_cards_insert ON game_play_score_cards FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY game_play_score_cards_update ON game_play_score_cards FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY game_play_score_cards_delete ON game_play_score_cards FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── game_play_score_shots ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_play_score_shots (
  id            TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  round_id      TEXT NOT NULL REFERENCES game_play_rounds(id) ON DELETE CASCADE,
  hole_number   INTEGER NOT NULL,
  player_id     TEXT NOT NULL REFERENCES game_play_player_info(id) ON DELETE CASCADE,
  shot_type     TEXT,
  shot_club     TEXT,
  shot_result   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_play_score_shots_tenant_round_hole
  ON game_play_score_shots (tenant_id, round_id, hole_number);

ALTER TABLE game_play_score_shots ENABLE ROW LEVEL SECURITY;

CREATE POLICY game_play_score_shots_select ON game_play_score_shots FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY game_play_score_shots_insert ON game_play_score_shots FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY game_play_score_shots_update ON game_play_score_shots FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY game_play_score_shots_delete ON game_play_score_shots FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
