-- Migration: 0023_communications
-- Communications domain: mailers, email templates, mass messages, posts

-- ── communication_mailers ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS communication_mailers (
  id               TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  mailer_class     TEXT NOT NULL,
  mailer_action    TEXT NOT NULL,
  entity_type      TEXT,
  entity_id        TEXT,
  recipient_email  TEXT,
  recipient_name   TEXT,
  from_to_cc_bcc   JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_communication_mailers_tenant_entity ON communication_mailers (tenant_id, entity_type, entity_id);

ALTER TABLE communication_mailers ENABLE ROW LEVEL SECURITY;

CREATE POLICY communication_mailers_select ON communication_mailers FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY communication_mailers_insert ON communication_mailers FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY communication_mailers_update ON communication_mailers FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY communication_mailers_delete ON communication_mailers FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── email_templates ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id             TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  name           TEXT NOT NULL,
  subject        TEXT,
  body           TEXT NOT NULL,
  html_path      TEXT,
  css_path       TEXT,
  logo_path      TEXT,
  course_id      TEXT,
  original_body  TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     TEXT
);

CREATE UNIQUE INDEX uq_email_templates_tenant_name ON email_templates (tenant_id, name);
CREATE INDEX idx_email_templates_tenant_course ON email_templates (tenant_id, course_id) WHERE course_id IS NOT NULL;

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_templates_select ON email_templates FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY email_templates_insert ON email_templates FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY email_templates_update ON email_templates FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY email_templates_delete ON email_templates FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── email_template_fields ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_template_fields (
  id                 TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id          TEXT NOT NULL REFERENCES tenants(id),
  template_id        TEXT NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  field_name         TEXT NOT NULL,
  field_description  TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_email_template_fields_tenant_template_field ON email_template_fields (tenant_id, template_id, field_name);

ALTER TABLE email_template_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_template_fields_select ON email_template_fields FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY email_template_fields_insert ON email_template_fields FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY email_template_fields_update ON email_template_fields FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY email_template_fields_delete ON email_template_fields FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── mass_messages ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mass_messages (
  id                TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft',
  recipient_type    TEXT,
  recipient_filter  JSONB,
  sent_count        INTEGER NOT NULL DEFAULT 0,
  failed_count      INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT
);

CREATE INDEX idx_mass_messages_tenant_status ON mass_messages (tenant_id, status);
CREATE INDEX idx_mass_messages_tenant_created ON mass_messages (tenant_id, created_at);

ALTER TABLE mass_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY mass_messages_select ON mass_messages FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY mass_messages_insert ON mass_messages FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY mass_messages_update ON mass_messages FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY mass_messages_delete ON mass_messages FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── posts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id            TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  post_type     TEXT NOT NULL DEFAULT 'announcement',
  author_name   TEXT,
  title         TEXT NOT NULL,
  excerpt       TEXT,
  content       TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  is_pinned     BOOLEAN NOT NULL DEFAULT false,
  published_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_posts_tenant_status_published ON posts (tenant_id, status, published_at);
CREATE INDEX idx_posts_tenant_post_type ON posts (tenant_id, post_type);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY posts_select ON posts FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY posts_insert ON posts FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY posts_update ON posts FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY posts_delete ON posts FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ── post_customer_groups ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_customer_groups (
  id                 TEXT PRIMARY KEY DEFAULT gen_ulid(),
  tenant_id          TEXT NOT NULL REFERENCES tenants(id),
  post_id            TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  customer_group_id  TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_post_customer_groups_tenant_post_group ON post_customer_groups (tenant_id, post_id, customer_group_id);

ALTER TABLE post_customer_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY post_customer_groups_select ON post_customer_groups FOR SELECT TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY post_customer_groups_insert ON post_customer_groups FOR INSERT TO oppsera_app
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY post_customer_groups_update ON post_customer_groups FOR UPDATE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY post_customer_groups_delete ON post_customer_groups FOR DELETE TO oppsera_app
  USING (tenant_id = current_setting('app.current_tenant_id', true));
