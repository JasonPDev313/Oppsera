-- Migration: 0094_optimize_rls_current_setting
-- Purpose: Optimize ALL RLS policies by wrapping current_setting() in a subquery
--
-- Problem: Bare current_setting() in RLS policies is re-evaluated for EVERY ROW scanned.
--          On tables with thousands of rows, this causes significant overhead.
--
-- Fix:     (select current_setting(...)) evaluates ONCE per query. PostgreSQL treats the
--          subquery as an InitPlan — a constant for the entire statement.
--
-- This migration dynamically finds ALL affected policies in the public schema via
-- pg_policies and recreates them with the optimized expression. It is idempotent —
-- re-running will find zero policies to fix.
--
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

DO $fn$
DECLARE
  pol RECORD;
  new_qual TEXT;
  new_with_check TEXT;
  roles_clause TEXT;
  create_sql TEXT;
  affected_count INTEGER := 0;
  -- PostgreSQL's decompiler may or may not add ::text cast to string literals.
  -- Handle both variants for safety.
  search_with_cast TEXT := $$current_setting('app.current_tenant_id'::text, true)$$;
  replace_with_cast TEXT := $$(select current_setting('app.current_tenant_id'::text, true))$$;
  search_no_cast TEXT := $$current_setting('app.current_tenant_id', true)$$;
  replace_no_cast TEXT := $$(select current_setting('app.current_tenant_id', true))$$;
BEGIN
  FOR pol IN
    SELECT policyname, tablename, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual IS NOT NULL AND qual LIKE '%current_setting(%')
        OR (with_check IS NOT NULL AND with_check LIKE '%current_setting(%')
      )
      -- Skip policies already using the (select ...) optimization
      AND NOT (
        COALESCE(qual, '') LIKE '%(select current_setting(%'
        OR COALESCE(with_check, '') LIKE '%(select current_setting(%'
      )
    ORDER BY tablename, policyname
  LOOP
    -- Drop the existing policy
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);

    -- Apply text replacement to wrap current_setting() in a subquery.
    -- Try the ::text cast variant first (most common from PG decompiler),
    -- fall back to the no-cast variant.
    new_qual := pol.qual;
    new_with_check := pol.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, search_with_cast, replace_with_cast);
      IF new_qual = pol.qual THEN
        new_qual := replace(new_qual, search_no_cast, replace_no_cast);
      END IF;
    END IF;

    IF new_with_check IS NOT NULL THEN
      new_with_check := replace(new_with_check, search_with_cast, replace_with_cast);
      IF new_with_check = pol.with_check THEN
        new_with_check := replace(new_with_check, search_no_cast, replace_no_cast);
      END IF;
    END IF;

    -- Preserve original role restriction (TO oppsera_app, etc.)
    -- pg_policies.roles defaults to {public} when no TO clause was specified.
    IF array_length(pol.roles, 1) = 1 AND pol.roles[1] = 'public' THEN
      roles_clause := '';
    ELSE
      roles_clause := ' TO ' || array_to_string(pol.roles, ', ');
    END IF;

    -- Reconstruct CREATE POLICY.
    -- pg_get_expr output (qual/with_check) already includes outer parentheses,
    -- so "USING " || qual produces valid "USING (expr)" syntax.
    create_sql := format('CREATE POLICY %I ON public.%I', pol.policyname, pol.tablename);

    IF pol.cmd <> 'ALL' THEN
      create_sql := create_sql || format(' FOR %s', pol.cmd);
    END IF;

    create_sql := create_sql || roles_clause;

    -- USING clause: applies to SELECT, UPDATE, DELETE, ALL
    IF new_qual IS NOT NULL AND pol.cmd IN ('SELECT', 'UPDATE', 'DELETE', 'ALL') THEN
      create_sql := create_sql || ' USING ' || new_qual;
    END IF;

    -- WITH CHECK clause: applies to INSERT, UPDATE, ALL
    IF new_with_check IS NOT NULL AND pol.cmd IN ('INSERT', 'UPDATE', 'ALL') THEN
      create_sql := create_sql || ' WITH CHECK ' || new_with_check;
    END IF;

    EXECUTE create_sql;
    affected_count := affected_count + 1;
  END LOOP;

  RAISE NOTICE 'RLS optimization complete: % policies updated with (select current_setting(...)) wrapper', affected_count;
END $fn$;
