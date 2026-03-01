-- Covering index for calendar appointment fetch (tenant + location + status + time range)
-- Partial index excludes canceled appointments since the calendar query always filters them out
CREATE INDEX IF NOT EXISTS idx_spa_appointments_calendar
ON spa_appointments(tenant_id, location_id, start_at, end_at)
WHERE status != 'canceled';

-- Covering index for appointment items batch JOIN with services
-- The calendar query fetches items by appointment_id IN (...) and JOINs spa_services
CREATE INDEX IF NOT EXISTS idx_spa_appointment_items_appt_service
ON spa_appointment_items(tenant_id, appointment_id, service_id)
INCLUDE (sort_order);

-- Covering index for provider display info lookup (name + color for calendar columns)
CREATE INDEX IF NOT EXISTS idx_spa_providers_display
ON spa_providers(tenant_id, id)
INCLUDE (display_name, color);
