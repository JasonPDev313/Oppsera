-- Migration: 0045_fk_hardening
-- Adds missing FK constraints across tee times, events-golf, customer-gaps,
-- reservations, and discounts domains. Uses NOT VALID + VALIDATE pattern
-- for zero-downtime safety.
--
-- Prerequisites: Run orphan detection queries (Phase 2) first.
-- All must return 0 orphans before this migration can succeed.

-- ══════════════════════════════════════════════════════════════════
-- PHASE A: ADD CONSTRAINT ... NOT VALID (instant, no table scan)
-- ══════════════════════════════════════════════════════════════════

-- ── Tee Times: courseId → courses ────────────────────────────────

ALTER TABLE tee_seasons
  ADD CONSTRAINT fk_tee_seasons_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE tee_sheets
  ADD CONSTRAINT fk_tee_sheets_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE tee_types
  ADD CONSTRAINT fk_tee_types_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE tee_categories
  ADD CONSTRAINT fk_tee_categories_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE tee_daily_periods
  ADD CONSTRAINT fk_tee_daily_periods_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE tee_pricing_plans
  ADD CONSTRAINT fk_tee_pricing_plans_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE tee_pricing_plans
  ADD CONSTRAINT fk_tee_pricing_plans_daily_period
  FOREIGN KEY (tee_daily_period_id) REFERENCES tee_daily_periods(id) NOT VALID;

ALTER TABLE tee_time_overrides
  ADD CONSTRAINT fk_tee_time_overrides_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE tee_time_policies
  ADD CONSTRAINT fk_tee_time_policies_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE tee_sheet_notes
  ADD CONSTRAINT fk_tee_sheet_notes_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE tee_promoted_slots
  ADD CONSTRAINT fk_tee_promoted_slots_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE tee_rotation_schedules
  ADD CONSTRAINT fk_tee_rotation_schedules_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE tee_blocked_slots
  ADD CONSTRAINT fk_tee_blocked_slots_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE tee_blocked_slot_repetitions
  ADD CONSTRAINT fk_tee_blocked_slot_reps_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE shotgun_starts
  ADD CONSTRAINT fk_shotgun_starts_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

-- ── Tee Bookings: courseId → courses ─────────────────────────────

ALTER TABLE tee_bookings
  ADD CONSTRAINT fk_tee_bookings_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE tee_booking_repetitions
  ADD CONSTRAINT fk_tee_booking_repetitions_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE tee_group_bookings
  ADD CONSTRAINT fk_tee_group_bookings_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

-- ── Tee Bookings: intra-domain refs ──────────────────────────────

ALTER TABLE shotgun_start_slots
  ADD CONSTRAINT fk_shotgun_start_slots_start
  FOREIGN KEY (shotgun_start_id) REFERENCES shotgun_starts(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE tee_booking_repetition_rule_interpretations
  ADD CONSTRAINT fk_tee_booking_rep_rule_interp_rule
  FOREIGN KEY (rule_id) REFERENCES tee_booking_repetition_rules(id) ON DELETE CASCADE NOT VALID;

-- ── Discounts: courseId → courses ────────────────────────────────

ALTER TABLE rack_rates
  ADD CONSTRAINT fk_rack_rates_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE rack_rate_schedules
  ADD CONSTRAINT fk_rack_rate_schedules_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

-- ── Events Golf: eventId → events ────────────────────────────────

ALTER TABLE event_golfers
  ADD CONSTRAINT fk_event_golfers_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE event_registration_order_lines
  ADD CONSTRAINT fk_event_reg_order_lines_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE event_order_lines
  ADD CONSTRAINT fk_event_order_lines_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE event_payments
  ADD CONSTRAINT fk_event_payments_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE event_schedules
  ADD CONSTRAINT fk_event_schedules_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE event_schedule_resources
  ADD CONSTRAINT fk_event_schedule_resources_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE event_schedule_resources
  ADD CONSTRAINT fk_event_schedule_resources_schedule
  FOREIGN KEY (event_schedule_id) REFERENCES event_schedules(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE event_timeline_venue_schedules
  ADD CONSTRAINT fk_event_timeline_venue_schedules_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE event_timeline_venue_schedules
  ADD CONSTRAINT fk_event_timeline_venue_schedules_timeline
  FOREIGN KEY (event_timeline_id) REFERENCES event_timelines(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE event_terminal_locations
  ADD CONSTRAINT fk_event_terminal_locations_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE golf_league_profiles
  ADD CONSTRAINT fk_golf_league_profiles_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE golf_league_fee_types
  ADD CONSTRAINT fk_golf_league_fee_types_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE golf_league_checkins
  ADD CONSTRAINT fk_golf_league_checkins_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE golf_league_golfer_details
  ADD CONSTRAINT fk_golf_league_golfer_details_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE golf_outing_golfer_details
  ADD CONSTRAINT fk_golf_outing_golfer_details_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE golf_outing_profiles
  ADD CONSTRAINT fk_golf_outing_profiles_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE NOT VALID;

-- ── Customer Gaps: customerId → customers ────────────────────────

ALTER TABLE customer_addresses
  ADD CONSTRAINT fk_customer_addresses_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;

ALTER TABLE customer_facility_assignments
  ADD CONSTRAINT fk_customer_facility_assignments_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;

ALTER TABLE customer_location_settings
  ADD CONSTRAINT fk_customer_location_settings_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;

ALTER TABLE customer_location_settings
  ADD CONSTRAINT fk_customer_location_settings_location
  FOREIGN KEY (location_id) REFERENCES locations(id) NOT VALID;

ALTER TABLE customer_discount_overrides
  ADD CONSTRAINT fk_customer_discount_overrides_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;

ALTER TABLE customer_signed_waivers
  ADD CONSTRAINT fk_customer_signed_waivers_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;

ALTER TABLE customer_pace_of_play
  ADD CONSTRAINT fk_customer_pace_of_play_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;

-- ── Reservations: courseId → courses ─────────────────────────────

ALTER TABLE reservation_policies
  ADD CONSTRAINT fk_reservation_policies_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

ALTER TABLE reservation_rate_override_rules
  ADD CONSTRAINT fk_reservation_rate_override_rules_course
  FOREIGN KEY (course_id) REFERENCES courses(id) NOT VALID;

-- ── Minimum Spend: fix dangling FK (depends on 0044) ────────────

ALTER TABLE minimum_spend_charges
  ADD CONSTRAINT fk_minimum_spend_charges_customer_rule
  FOREIGN KEY (customer_minimum_spend_rule_id) REFERENCES customer_minimum_spend_rules(id) NOT VALID;

ALTER TABLE minimum_spend_ledger
  ADD CONSTRAINT fk_minimum_spend_ledger_customer_rule
  FOREIGN KEY (customer_minimum_spend_rule_id) REFERENCES customer_minimum_spend_rules(id) NOT VALID;


-- ══════════════════════════════════════════════════════════════════
-- PHASE B: VALIDATE CONSTRAINT (scans table, but doesn't hold lock)
-- ══════════════════════════════════════════════════════════════════

-- Tee Times: courseId
ALTER TABLE tee_seasons VALIDATE CONSTRAINT fk_tee_seasons_course;
ALTER TABLE tee_sheets VALIDATE CONSTRAINT fk_tee_sheets_course;
ALTER TABLE tee_types VALIDATE CONSTRAINT fk_tee_types_course;
ALTER TABLE tee_categories VALIDATE CONSTRAINT fk_tee_categories_course;
ALTER TABLE tee_daily_periods VALIDATE CONSTRAINT fk_tee_daily_periods_course;
ALTER TABLE tee_pricing_plans VALIDATE CONSTRAINT fk_tee_pricing_plans_course;
ALTER TABLE tee_pricing_plans VALIDATE CONSTRAINT fk_tee_pricing_plans_daily_period;
ALTER TABLE tee_time_overrides VALIDATE CONSTRAINT fk_tee_time_overrides_course;
ALTER TABLE tee_time_policies VALIDATE CONSTRAINT fk_tee_time_policies_course;
ALTER TABLE tee_sheet_notes VALIDATE CONSTRAINT fk_tee_sheet_notes_course;
ALTER TABLE tee_promoted_slots VALIDATE CONSTRAINT fk_tee_promoted_slots_course;
ALTER TABLE tee_rotation_schedules VALIDATE CONSTRAINT fk_tee_rotation_schedules_course;
ALTER TABLE tee_blocked_slots VALIDATE CONSTRAINT fk_tee_blocked_slots_course;
ALTER TABLE tee_blocked_slot_repetitions VALIDATE CONSTRAINT fk_tee_blocked_slot_reps_course;
ALTER TABLE shotgun_starts VALIDATE CONSTRAINT fk_shotgun_starts_course;

-- Tee Bookings: courseId
ALTER TABLE tee_bookings VALIDATE CONSTRAINT fk_tee_bookings_course;
ALTER TABLE tee_booking_repetitions VALIDATE CONSTRAINT fk_tee_booking_repetitions_course;
ALTER TABLE tee_group_bookings VALIDATE CONSTRAINT fk_tee_group_bookings_course;

-- Tee Bookings: intra-domain
ALTER TABLE shotgun_start_slots VALIDATE CONSTRAINT fk_shotgun_start_slots_start;
ALTER TABLE tee_booking_repetition_rule_interpretations VALIDATE CONSTRAINT fk_tee_booking_rep_rule_interp_rule;

-- Discounts: courseId
ALTER TABLE rack_rates VALIDATE CONSTRAINT fk_rack_rates_course;
ALTER TABLE rack_rate_schedules VALIDATE CONSTRAINT fk_rack_rate_schedules_course;

-- Events Golf: eventId
ALTER TABLE event_golfers VALIDATE CONSTRAINT fk_event_golfers_event;
ALTER TABLE event_registration_order_lines VALIDATE CONSTRAINT fk_event_reg_order_lines_event;
ALTER TABLE event_order_lines VALIDATE CONSTRAINT fk_event_order_lines_event;
ALTER TABLE event_payments VALIDATE CONSTRAINT fk_event_payments_event;
ALTER TABLE event_schedules VALIDATE CONSTRAINT fk_event_schedules_event;
ALTER TABLE event_schedule_resources VALIDATE CONSTRAINT fk_event_schedule_resources_event;
ALTER TABLE event_schedule_resources VALIDATE CONSTRAINT fk_event_schedule_resources_schedule;
ALTER TABLE event_timeline_venue_schedules VALIDATE CONSTRAINT fk_event_timeline_venue_schedules_event;
ALTER TABLE event_timeline_venue_schedules VALIDATE CONSTRAINT fk_event_timeline_venue_schedules_timeline;
ALTER TABLE event_terminal_locations VALIDATE CONSTRAINT fk_event_terminal_locations_event;
ALTER TABLE golf_league_profiles VALIDATE CONSTRAINT fk_golf_league_profiles_event;
ALTER TABLE golf_league_fee_types VALIDATE CONSTRAINT fk_golf_league_fee_types_event;
ALTER TABLE golf_league_checkins VALIDATE CONSTRAINT fk_golf_league_checkins_event;
ALTER TABLE golf_league_golfer_details VALIDATE CONSTRAINT fk_golf_league_golfer_details_event;
ALTER TABLE golf_outing_golfer_details VALIDATE CONSTRAINT fk_golf_outing_golfer_details_event;
ALTER TABLE golf_outing_profiles VALIDATE CONSTRAINT fk_golf_outing_profiles_event;

-- Customer Gaps
ALTER TABLE customer_addresses VALIDATE CONSTRAINT fk_customer_addresses_customer;
ALTER TABLE customer_facility_assignments VALIDATE CONSTRAINT fk_customer_facility_assignments_customer;
ALTER TABLE customer_location_settings VALIDATE CONSTRAINT fk_customer_location_settings_customer;
ALTER TABLE customer_location_settings VALIDATE CONSTRAINT fk_customer_location_settings_location;
ALTER TABLE customer_discount_overrides VALIDATE CONSTRAINT fk_customer_discount_overrides_customer;
ALTER TABLE customer_signed_waivers VALIDATE CONSTRAINT fk_customer_signed_waivers_customer;
ALTER TABLE customer_pace_of_play VALIDATE CONSTRAINT fk_customer_pace_of_play_customer;

-- Reservations
ALTER TABLE reservation_policies VALIDATE CONSTRAINT fk_reservation_policies_course;
ALTER TABLE reservation_rate_override_rules VALIDATE CONSTRAINT fk_reservation_rate_override_rules_course;

-- Minimum Spend (dangling FK fix)
ALTER TABLE minimum_spend_charges VALIDATE CONSTRAINT fk_minimum_spend_charges_customer_rule;
ALTER TABLE minimum_spend_ledger VALIDATE CONSTRAINT fk_minimum_spend_ledger_customer_rule;
