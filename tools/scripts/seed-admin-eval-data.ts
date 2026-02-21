/**
 * Seed the admin panel (localhost:3001) with realistic eval data.
 * Seeds: platform_admins + semantic_eval_sessions + semantic_eval_turns
 *        + semantic_eval_examples + semantic_eval_quality_daily
 *
 * Prerequisites: main seed must have run first (needs a valid tenant_id).
 * Safe to run multiple times — uses ON CONFLICT DO NOTHING where possible,
 * and deletes+re-inserts eval data.
 *
 * Usage: npx tsx tools/scripts/seed-admin-eval-data.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { ulid } from 'ulid';

const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const sql = postgres(connectionString, { max: 1, prepare: false });

function id() { return ulid(); }

// Realistic user messages for a golf & grill business
const USER_MESSAGES = [
  'What were our total sales last week?',
  'Show me the top 10 selling items this month',
  'How does this month compare to last month in revenue?',
  'What is our average order value by day of week?',
  'Which location has the highest sales per square foot?',
  'Show me inventory items below reorder point',
  'What is the trend in green fee revenue over the past 90 days?',
  'How many rounds were played this month vs last month?',
  'What are our busiest hours for the restaurant?',
  'Show me customer visit frequency for the last quarter',
  'What is our food cost percentage?',
  'Which menu items have the highest profit margin?',
  'How much revenue did we lose from voids this week?',
  'What is the average tip percentage by server?',
  'Show me a breakdown of payment methods used today',
  'How are our membership signups trending?',
  'What is our cart-to-green fee attachment rate?',
  'Which days of the week are slowest for tee times?',
  'Give me a sales comparison between our two locations',
  'What items should I reorder this week?',
  'How do our food and beverage sales compare to pro shop?',
  'What is the lifetime value of our gold members?',
  'Show me monthly revenue for the past year',
  'What were our top selling categories today?',
  'How many new customers did we get this month?',
  'What is our current cash position?',
  'Which vendors have outstanding invoices past due?',
  'Show me the daily sales trend with weather impact',
  'What is our table turn time during lunch?',
  'How does our pricing compare to nearby courses?',
];

const NARRATIVES = [
  '## Answer\nYour total sales last week were **$42,350** across both locations, representing a **12% increase** over the previous week.\n\n## Quick Wins\n- Weekend brunch continues to drive the growth — consider extending the menu\n- Pro shop accessories saw a 20% bump after the new display\n\n## What to Track\n- Watch the food cost ratio — it crept up to 33% from 31%\n\n*THE OPPS ERA LENS. daily_sales, item_sales. Last 7 days.*',
  '## Answer\nHere are your top 10 items by revenue this month:\n\n| Rank | Item | Revenue | Units |\n|------|------|---------|-------|\n| 1 | 18-Hole Green Fee | $18,750 | 250 |\n| 2 | Clubhouse Burger | $5,985 | 399 |\n| 3 | Logo Polo Shirt | $4,499 | 90 |\n| 4 | Draft Beer | $3,196 | 399 |\n| 5 | Cart Rental | $2,800 | 200 |\n\n## Recommendation\nGreen fees remain your bread and butter at **45% of total revenue**. Consider bundling a lunch credit with afternoon tee times to boost F&B attachment. Confidence: 85%.\n\n*THE OPPS ERA LENS. item_sales. This month.*',
  '## Answer\nMonth-over-month comparison:\n- **This month**: $128,450 (+8.3%)\n- **Last month**: $118,600\n- **Key driver**: 15% increase in weekend rounds\n\n## Options\n1. **Extend twilight rates** — Effort: Low, Impact: Medium\n2. **Launch weekday loyalty program** — Effort: Medium, Impact: High\n3. **Add live music Friday nights** — Effort: Medium, Impact: Medium\n\n## ROI Snapshot\nIf weekday rounds increase by just 10%, that adds ~$4,200/month in green fee revenue alone.\n\n*THE OPPS ERA LENS. daily_sales. 60-day comparison.*',
  '## Answer\nYour inventory is in good shape overall. **3 items** are currently below reorder point:\n\n| Item | On Hand | Reorder Point | Suggested Order |\n|------|---------|---------------|----------------|\n| Logo Golf Balls (dozen) | 12 | 25 | 50 |\n| Sunscreen SPF 50 | 4 | 10 | 24 |\n| Burger Buns | 15 | 30 | 60 |\n\n## Quick Wins\n- Place the golf ball order today — weekend tournament expected\n- Burger bun reorder is routine, but verify with kitchen first\n\n*THE OPPS ERA LENS. inventory. Current.*',
  '## Answer\nCustomer visit frequency for Q4:\n- **1 visit**: 45% of customers\n- **2-3 visits**: 30%\n- **4+ visits (regulars)**: 25%\n\nYour regulars (4+ visits) account for **62% of total revenue** despite being only 25% of the customer base.\n\n## Recommendation\nDouble down on retention. A targeted "Come back" email to 1-visit customers with a 10% discount could convert 5-8% to repeat visitors. Confidence: 72%.\n\n*THE OPPS ERA LENS. customer_activity. Last quarter.*',
];

const COMPILED_SQLS = [
  `SELECT DATE(created_at) as business_date, SUM(net_sales) as total_sales FROM rm_daily_sales WHERE tenant_id = $1 AND business_date BETWEEN $2 AND $3 GROUP BY business_date ORDER BY business_date`,
  `SELECT catalog_item_id, catalog_item_name, SUM(quantity_sold) as units, SUM(net_revenue) as revenue FROM rm_item_sales WHERE tenant_id = $1 AND business_date BETWEEN $2 AND $3 GROUP BY catalog_item_id, catalog_item_name ORDER BY revenue DESC LIMIT 10`,
  `SELECT DATE_TRUNC('month', business_date) as month, SUM(net_sales) as total FROM rm_daily_sales WHERE tenant_id = $1 AND business_date >= $2 GROUP BY month ORDER BY month`,
  `SELECT EXTRACT(DOW FROM business_date) as dow, AVG(net_sales / NULLIF(order_count, 0)) as avg_order_value FROM rm_daily_sales WHERE tenant_id = $1 AND business_date BETWEEN $2 AND $3 GROUP BY dow ORDER BY dow`,
  `SELECT location_id, SUM(quantity_on_hand) as total_on_hand, COUNT(*) FILTER (WHERE quantity_on_hand <= reorder_point) as below_reorder FROM rm_inventory_on_hand WHERE tenant_id = $1 GROUP BY location_id`,
];

const LLM_PLANS = [
  { metrics: ['total_sales'], dimensions: ['business_date'], filters: [{ dimension: 'business_date', operator: 'between', value: ['2026-02-14', '2026-02-20'] }], orderBy: [{ field: 'business_date', direction: 'asc' }], limit: 50 },
  { metrics: ['quantity_sold', 'net_revenue'], dimensions: ['catalog_item_name'], filters: [{ dimension: 'business_date', operator: 'between', value: ['2026-02-01', '2026-02-21'] }], orderBy: [{ field: 'net_revenue', direction: 'desc' }], limit: 10 },
  { metrics: ['total_sales'], dimensions: ['month'], filters: [{ dimension: 'business_date', operator: 'gte', value: '2025-12-01' }], orderBy: [{ field: 'month', direction: 'asc' }], limit: 12 },
  { metrics: ['avg_order_value'], dimensions: ['day_of_week'], filters: [], orderBy: [{ field: 'day_of_week', direction: 'asc' }], limit: 7 },
  { metrics: ['quantity_on_hand'], dimensions: ['location_id'], filters: [{ dimension: 'below_reorder', operator: 'eq', value: true }], orderBy: [], limit: 50 },
];

const RESULT_SAMPLES = [
  [{ business_date: '2026-02-14', total_sales: 5840.50 }, { business_date: '2026-02-15', total_sales: 7210.00 }, { business_date: '2026-02-16', total_sales: 8930.25 }],
  [{ catalog_item_name: '18-Hole Green Fee', units: 250, revenue: 18750 }, { catalog_item_name: 'Clubhouse Burger', units: 399, revenue: 5985 }],
  [{ month: '2026-01', total: 118600 }, { month: '2026-02', total: 128450 }],
  [{ dow: 0, avg_order_value: 28.50 }, { dow: 1, avg_order_value: 22.30 }, { dow: 6, avg_order_value: 35.80 }],
  [{ location_id: 'main', total_on_hand: 450, below_reorder: 3 }, { location_id: 'south', total_on_hand: 210, below_reorder: 1 }],
];

const VERDICTS = ['correct', 'correct', 'correct', 'partially_correct', 'needs_improvement', 'incorrect', 'hallucination', null, null, null] as const;
const QUALITY_FLAG_SETS = [
  null,
  null,
  null,
  ['low_confidence'],
  ['empty_result'],
  ['hallucinated_slug'],
  ['timeout'],
  ['low_confidence', 'empty_result'],
  null,
  null,
];
const LENSES = ['system-general', 'system-sales', 'system-golf', 'system-inventory', null];
const CACHE_STATUSES = ['HIT', 'MISS', 'MISS', 'MISS', 'SKIP'];

async function main() {
  console.log('Seeding admin panel eval data...\n');

  // ── 1. Seed platform admin ─────────────────────────────────────
  const passwordHash = await bcrypt.hash('admin', 10);
  const adminId = id();

  await sql`
    INSERT INTO platform_admins (id, email, name, password_hash, role, is_active)
    VALUES (${adminId}, 'admin@oppsera.com', 'Platform Admin', ${passwordHash}, 'super_admin', true)
    ON CONFLICT (email) DO NOTHING
  `;
  console.log('+ Platform admin: admin@oppsera.com / admin');

  // ── 2. Find existing tenant ────────────────────────────────────
  const tenantRows = await sql`SELECT id, name FROM tenants WHERE status = 'active' LIMIT 1`;
  if (tenantRows.length === 0) {
    console.error('\nERROR: No active tenant found. Run the main seed first:');
    console.error('  cd packages/db && pnpm db:seed');
    await sql.end();
    process.exit(1);
  }
  const tenantId = tenantRows[0].id;
  const tenantName = tenantRows[0].name;
  console.log(`+ Using tenant: ${tenantName} (${tenantId})`);

  // Find a user for this tenant
  const userRows = await sql`SELECT id FROM users WHERE tenant_id = ${tenantId} LIMIT 1`;
  const userId = userRows.length > 0 ? userRows[0].id : null;

  // ── 3. Clean existing eval data for this tenant ────────────────
  await sql`DELETE FROM semantic_eval_quality_daily WHERE tenant_id = ${tenantId}`;
  await sql`DELETE FROM semantic_eval_examples WHERE tenant_id = ${tenantId} OR tenant_id IS NULL`;
  await sql`DELETE FROM semantic_eval_turns WHERE tenant_id = ${tenantId}`;
  await sql`DELETE FROM semantic_eval_sessions WHERE tenant_id = ${tenantId}`;
  console.log('+ Cleaned existing eval data');

  // ── 4. Create eval sessions ────────────────────────────────────
  const now = new Date();
  const sessions: { id: string; startedAt: Date; messageCount: number; status: string }[] = [];

  for (let i = 0; i < 8; i++) {
    const daysAgo = Math.floor(Math.random() * 28);
    const startedAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const messageCount = Math.floor(Math.random() * 5) + 1;
    const statuses = ['completed', 'completed', 'completed', 'active', 'flagged', 'reviewed'];
    const status = statuses[i % statuses.length];

    const sess = {
      id: id(),
      startedAt,
      messageCount,
      status,
    };
    sessions.push(sess);

    const avgRating = (Math.random() * 2 + 3).toFixed(2); // 3.00-5.00
    const lens = LENSES[i % LENSES.length];

    await sql`
      INSERT INTO semantic_eval_sessions
        (id, tenant_id, user_id, session_id, started_at, ended_at, message_count, avg_user_rating, status, lens_id, metadata, created_at, updated_at)
      VALUES (
        ${sess.id}, ${tenantId}, ${userId}, ${sess.id},
        ${startedAt.toISOString()},
        ${status === 'completed' ? new Date(startedAt.getTime() + 10 * 60 * 1000).toISOString() : null},
        ${messageCount},
        ${avgRating},
        ${status},
        ${lens},
        ${JSON.stringify({ businessType: 'golf_hybrid', userRole: 'owner' })}::jsonb,
        ${startedAt.toISOString()},
        ${startedAt.toISOString()}
      )
    `;
  }
  console.log(`+ Created ${sessions.length} eval sessions`);

  // ── 5. Create eval turns (the main data) ───────────────────────
  let turnCount = 0;
  const turnIds: string[] = [];

  for (const session of sessions) {
    for (let t = 0; t < session.messageCount; t++) {
      const turnId = id();
      turnIds.push(turnId);
      const turnNumber = t + 1;
      const msgIdx = (turnCount) % USER_MESSAGES.length;
      const userMessage = USER_MESSAGES[msgIdx];

      // Vary creation dates to get a nice trend
      const daysOffset = Math.floor(Math.random() * 28);
      const createdAt = new Date(now.getTime() - daysOffset * 24 * 60 * 60 * 1000);

      const planIdx = turnCount % LLM_PLANS.length;
      const narrativeIdx = turnCount % NARRATIVES.length;
      const sqlIdx = turnCount % COMPILED_SQLS.length;
      const resultIdx = turnCount % RESULT_SAMPLES.length;

      const llmConfidence = (Math.random() * 0.4 + 0.6).toFixed(2); // 0.60-1.00
      const executionTimeMs = Math.floor(Math.random() * 800) + 50; // 50-850ms
      const rowCount = Math.floor(Math.random() * 50) + 1;
      const wasClarification = Math.random() < 0.12;
      const cacheStatus = CACHE_STATUSES[turnCount % CACHE_STATUSES.length];

      // User feedback (70% of turns have feedback)
      const hasFeedback = Math.random() < 0.7;
      const userRating = hasFeedback ? Math.floor(Math.random() * 5) + 1 : null;
      const userThumbsUp = hasFeedback ? (userRating! >= 3 ? true : userRating! <= 2 ? false : null) : null;
      const feedbackTags = hasFeedback && userRating! <= 3
        ? JSON.stringify(['inaccurate', 'slow'])
        : hasFeedback && userRating! >= 4
          ? JSON.stringify(['helpful', 'accurate'])
          : null;

      // Admin review (40% of turns reviewed)
      const verdictIdx = turnCount % VERDICTS.length;
      const hasAdminReview = VERDICTS[verdictIdx] !== null;
      const adminVerdict = VERDICTS[verdictIdx] ?? null;
      const adminScore = hasAdminReview ? Math.floor(Math.random() * 3) + 3 : null; // 3-5
      const adminNotes = hasAdminReview
        ? ['Good query, accurate results.', 'Mostly correct but missed location filter.', 'Wrong metric used — should be net_revenue not gross.', 'Hallucinated a metric that does not exist.', 'Needs refinement in date range handling.'][turnCount % 5]
        : null;

      // Quality signals
      const flagsIdx = turnCount % QUALITY_FLAG_SETS.length;
      const qualityFlags = QUALITY_FLAG_SETS[flagsIdx];
      const qualityScore = userRating && adminScore
        ? ((adminScore * 0.4 + userRating * 0.3 + 3.5 * 0.3) / 1).toFixed(2)
        : userRating
          ? ((userRating * 0.3 + 3.5 * 0.7) / 1).toFixed(2)
          : null;

      const lensId = LENSES[turnCount % LENSES.length];
      const planHash = `plan_${(turnCount % 15).toString(16).padStart(4, '0')}`;
      const sqlHash = `sql_${(turnCount % 12).toString(16).padStart(4, '0')}`;

      await sql`
        INSERT INTO semantic_eval_turns (
          id, tenant_id, session_id, user_id, user_role, turn_number,
          user_message, context_snapshot,
          llm_provider, llm_model, llm_plan, llm_rationale, llm_confidence,
          llm_tokens_input, llm_tokens_output, llm_latency_ms, plan_hash,
          was_clarification, clarification_message,
          compiled_sql, sql_hash, compilation_errors, safety_flags, tables_accessed,
          execution_time_ms, row_count, result_sample, result_fingerprint, execution_error, cache_status,
          narrative, narrative_lens_id, response_sections, playbooks_fired,
          user_rating, user_thumbs_up, user_feedback_text, user_feedback_tags, user_feedback_at,
          admin_reviewer_id, admin_score, admin_verdict, admin_notes, admin_reviewed_at, admin_action_taken,
          quality_score, quality_flags,
          created_at, updated_at
        ) VALUES (
          ${turnId}, ${tenantId}, ${session.id}, ${userId}, 'owner', ${turnNumber},
          ${userMessage},
          ${JSON.stringify({ locationId: 'main', dateRange: { start: '2026-02-01', end: '2026-02-21' } })}::jsonb,
          'anthropic', 'claude-haiku-4-5-20251001',
          ${JSON.stringify(LLM_PLANS[planIdx])}::jsonb,
          ${JSON.stringify({ reasoning: 'Mapped user request to relevant metrics and dimensions', confidence_factors: ['exact metric match', 'clear date range'] })}::jsonb,
          ${llmConfidence},
          ${Math.floor(Math.random() * 500) + 200},
          ${Math.floor(Math.random() * 300) + 100},
          ${Math.floor(Math.random() * 2000) + 500},
          ${planHash},
          ${wasClarification},
          ${wasClarification ? 'Could you specify which location you mean?' : null},
          ${COMPILED_SQLS[sqlIdx]},
          ${sqlHash},
          ${null},
          ${null},
          ${JSON.stringify(['rm_daily_sales', 'rm_item_sales'])}::jsonb,
          ${executionTimeMs}, ${rowCount},
          ${JSON.stringify(RESULT_SAMPLES[resultIdx])}::jsonb,
          ${JSON.stringify({ rowCount, minDate: '2026-02-01', maxDate: '2026-02-21', nullRate: 0.02, columnCount: 3 })}::jsonb,
          ${null},
          ${cacheStatus},
          ${NARRATIVES[narrativeIdx]},
          ${lensId},
          ${JSON.stringify(['answer', 'quick_wins', 'what_to_track'])}::jsonb,
          ${null},
          ${userRating},
          ${userThumbsUp},
          ${hasFeedback && userRating! <= 3 ? 'Not quite what I was looking for' : hasFeedback && userRating! >= 4 ? 'Very helpful!' : null},
          ${feedbackTags}::jsonb,
          ${hasFeedback ? createdAt.toISOString() : null},
          ${hasAdminReview ? adminId : null},
          ${adminScore},
          ${adminVerdict},
          ${adminNotes},
          ${hasAdminReview ? new Date(createdAt.getTime() + 3600000).toISOString() : null},
          ${hasAdminReview ? 'none' : null},
          ${qualityScore},
          ${qualityFlags ? JSON.stringify(qualityFlags) : null}::jsonb,
          ${createdAt.toISOString()},
          ${createdAt.toISOString()}
        )
      `;
      turnCount++;
    }
  }
  console.log(`+ Created ${turnCount} eval turns across ${sessions.length} sessions`);

  // ── 6. Create golden examples ──────────────────────────────────
  const exampleData = [
    { question: 'What were total sales last week?', category: 'sales', difficulty: 'simple', score: '4.80' },
    { question: 'Show me top selling items by revenue', category: 'sales', difficulty: 'simple', score: '4.90' },
    { question: 'Compare this month vs last month revenue', category: 'comparison', difficulty: 'medium', score: '4.50' },
    { question: 'What is the green fee revenue trend?', category: 'golf', difficulty: 'medium', score: '4.70' },
    { question: 'Which items are below reorder point?', category: 'inventory', difficulty: 'simple', score: '4.85' },
    { question: 'Customer visit frequency breakdown', category: 'customer', difficulty: 'medium', score: '4.60' },
    { question: 'What is the daily sales trend with anomalies?', category: 'anomaly', difficulty: 'complex', score: '4.30' },
    { question: 'Show me year-over-year revenue comparison by category', category: 'trend', difficulty: 'complex', score: '4.20' },
  ];

  for (let i = 0; i < exampleData.length; i++) {
    const ex = exampleData[i];
    const sourceTurnId = turnIds[i % turnIds.length] ?? null;
    const planIdx = i % LLM_PLANS.length;

    await sql`
      INSERT INTO semantic_eval_examples (
        id, tenant_id, source_eval_turn_id, question, plan, rationale,
        category, difficulty, quality_score, is_active, added_by, created_at, updated_at
      ) VALUES (
        ${id()},
        ${null},
        ${sourceTurnId},
        ${ex.question},
        ${JSON.stringify(LLM_PLANS[planIdx])}::jsonb,
        ${JSON.stringify({ reasoning: 'Verified correct mapping for this query pattern' })}::jsonb,
        ${ex.category},
        ${ex.difficulty},
        ${ex.score},
        ${true},
        ${adminId},
        ${now.toISOString()},
        ${now.toISOString()}
      )
    `;
  }
  console.log(`+ Created ${exampleData.length} golden examples`);

  // ── 7. Create daily quality aggregates ─────────────────────────
  for (let d = 0; d < 30; d++) {
    const date = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
    const totalTurns = Math.floor(Math.random() * 15) + 5; // 5-20 turns/day
    const avgUserRating = (Math.random() * 1.5 + 3.5).toFixed(2); // 3.50-5.00
    const avgAdminScore = (Math.random() * 1.0 + 3.5).toFixed(2); // 3.50-4.50
    const avgConfidence = (Math.random() * 0.25 + 0.70).toFixed(2); // 0.70-0.95
    const avgExecMs = Math.floor(Math.random() * 400) + 100; // 100-500ms
    const clarRate = (Math.random() * 15).toFixed(2); // 0-15%
    const errRate = (Math.random() * 8).toFixed(2); // 0-8%
    const hallRate = (Math.random() * 6).toFixed(2); // 0-6%
    const cacheRate = (Math.random() * 40 + 20).toFixed(2); // 20-60%

    const ratingDist = {
      '1': Math.floor(Math.random() * 2),
      '2': Math.floor(Math.random() * 3),
      '3': Math.floor(Math.random() * 5) + 1,
      '4': Math.floor(Math.random() * 6) + 2,
      '5': Math.floor(Math.random() * 6) + 2,
    };

    const failReasons = [
      { reason: 'unknown_metric', count: Math.floor(Math.random() * 3) },
      { reason: 'compilation_error', count: Math.floor(Math.random() * 2) },
      { reason: 'timeout', count: Math.floor(Math.random() * 1) },
    ].filter(r => r.count > 0);

    await sql`
      INSERT INTO semantic_eval_quality_daily (
        id, tenant_id, business_date, total_turns,
        avg_user_rating, avg_admin_score, avg_confidence, avg_execution_time_ms,
        clarification_rate, error_rate, hallucination_rate, cache_hit_rate,
        top_failure_reasons, rating_distribution, created_at
      ) VALUES (
        ${id()}, ${tenantId}, ${dateStr}, ${totalTurns},
        ${avgUserRating}, ${avgAdminScore}, ${avgConfidence}, ${avgExecMs},
        ${clarRate}, ${errRate}, ${hallRate}, ${cacheRate},
        ${JSON.stringify(failReasons)}::jsonb,
        ${JSON.stringify(ratingDist)}::jsonb,
        ${now.toISOString()}
      )
    `;
  }
  console.log('+ Created 30 days of quality daily aggregates');

  // ── Done ───────────────────────────────────────────────────────
  await sql.end();

  console.log('\n=== Admin Panel Seed Complete ===');
  console.log('Login at http://localhost:3001/login');
  console.log('  Email:    admin@oppsera.com');
  console.log('  Password: admin');
  console.log('\nMake sure ADMIN_AUTH_SECRET is set in your .env.local (>=32 chars).');
  console.log('Example: ADMIN_AUTH_SECRET=my-super-secret-admin-key-that-is-long-enough\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
