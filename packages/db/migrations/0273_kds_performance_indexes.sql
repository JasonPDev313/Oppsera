-- KDS performance indexes: sibling ticket lookup + poll query optimization
-- Addresses latency in KDS routing and expo/station polling queries.

-- Sibling ticket lookup for "also at" feature in getKdsView.
-- The self-join on fnb_kitchen_tickets by order_id had no covering index.
CREATE INDEX IF NOT EXISTS idx_fnb_kitchen_tickets_order
  ON fnb_kitchen_tickets(tenant_id, order_id);

-- Composite index for KDS poll query: ticket_id + station_id + item_status.
-- getKdsView filters by ticket_id IN (...) AND station_id = ? AND item_status NOT IN (...).
CREATE INDEX IF NOT EXISTS idx_fnb_ticket_items_ticket_station_status
  ON fnb_kitchen_ticket_items(ticket_id, station_id, item_status);
