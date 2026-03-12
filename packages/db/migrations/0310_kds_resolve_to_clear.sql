-- Rename 'resolved' status to 'cleared' and resolved_at column to cleared_at
-- in fnb_kds_send_tracking

-- 1. Rename the column
ALTER TABLE IF EXISTS fnb_kds_send_tracking
  RENAME COLUMN resolved_at TO cleared_at;

-- 2. Update existing status values
UPDATE fnb_kds_send_tracking
  SET status = 'cleared'
  WHERE status = 'resolved';

-- 3. Update event_type in send events
UPDATE fnb_kds_send_events
  SET event_type = 'cleared'
  WHERE event_type = 'resolved';

-- 4. Update new_status references in send events
UPDATE fnb_kds_send_events
  SET new_status = 'cleared'
  WHERE new_status = 'resolved';

-- 5. Update previous_status references in send events
UPDATE fnb_kds_send_events
  SET previous_status = 'cleared'
  WHERE previous_status = 'resolved';
