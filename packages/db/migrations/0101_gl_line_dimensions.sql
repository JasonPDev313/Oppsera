-- Session 40: GL journal line dimensions
-- Adds profit center, sub-department, terminal, and channel columns to gl_journal_lines
-- for P&L filtering by profit center, sub-department, terminal, and source channel.

ALTER TABLE gl_journal_lines ADD COLUMN profit_center_id TEXT;
ALTER TABLE gl_journal_lines ADD COLUMN sub_department_id TEXT;
ALTER TABLE gl_journal_lines ADD COLUMN terminal_id TEXT;
ALTER TABLE gl_journal_lines ADD COLUMN channel TEXT;

CREATE INDEX idx_gl_lines_profit_center ON gl_journal_lines(profit_center_id) WHERE profit_center_id IS NOT NULL;
CREATE INDEX idx_gl_lines_sub_dept ON gl_journal_lines(sub_department_id) WHERE sub_department_id IS NOT NULL;
CREATE INDEX idx_gl_lines_channel ON gl_journal_lines(channel) WHERE channel IS NOT NULL;
