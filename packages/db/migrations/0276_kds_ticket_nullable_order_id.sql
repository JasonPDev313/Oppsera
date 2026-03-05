-- Migration 0276: Make order_id nullable on fnb_kitchen_tickets
--
-- KDS tickets are created at course-send time, BEFORE the order exists.
-- The order (primaryOrderId) is only created at prepare-check (payment) time.
-- This was causing handleCourseSent to silently skip ticket creation because
-- orderId was NOT NULL but no order existed yet.

ALTER TABLE fnb_kitchen_tickets ALTER COLUMN order_id DROP NOT NULL;
