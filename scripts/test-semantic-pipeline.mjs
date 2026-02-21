/**
 * Standalone test of the semantic pipeline flow.
 * Isolates each step to find where the hang occurs.
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../apps/web/.env.local') });
config({ path: resolve(__dirname, '../.env.local') });

const dbUrl = process.env.DATABASE_URL;
const apiKey = process.env.ANTHROPIC_API_KEY;

console.log('=== Semantic Pipeline Diagnostic ===');
console.log('DB URL:', dbUrl ? dbUrl.substring(0, 40) + '...' : 'NOT SET');
console.log('ANTHROPIC_API_KEY:', apiKey ? apiKey.substring(0, 15) + '...' : 'NOT SET');
console.log('');

if (!dbUrl || !apiKey) {
  console.error('Missing required env vars');
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 2, prepare: false, idle_timeout: 10 });

// Step 1: Test DB connection + registry load
console.log('--- Step 1: Registry load from DB ---');
const step1Start = Date.now();
try {
  const [metrics, dims, rels, lenses] = await Promise.all([
    sql`SELECT * FROM semantic_metrics WHERE is_active = true`,
    sql`SELECT * FROM semantic_dimensions WHERE is_active = true`,
    sql`SELECT * FROM semantic_metric_dimensions`,
    sql`SELECT * FROM semantic_lenses WHERE is_active = true`,
  ]);
  console.log(`  OK in ${Date.now() - step1Start}ms: ${metrics.length} metrics, ${dims.length} dims, ${rels.length} rels, ${lenses.length} lenses`);

  // Build catalog snippet (like intent-resolver does)
  const catalogSnippet = `## Available Metrics\n${metrics.map(m => `  - ${m.slug}: ${m.display_name}`).join('\n')}\n\n## Available Dimensions\n${dims.map(d => `  - ${d.slug}: ${d.display_name}`).join('\n')}`;

  // Step 2: Test Anthropic API call (intent resolution)
  console.log('\n--- Step 2: Anthropic API call (intent resolution) ---');
  const step2Start = Date.now();

  const systemPrompt = `You are the intent-resolution engine for OppsEra, a business analytics platform.
Your job: translate a user's natural-language question into a structured query plan.
Respond with a single JSON object.

${catalogSnippet}

If the question cannot be answered with available metrics/dimensions, set clarificationNeeded = true and plan = null.
Respond with JSON: {"plan": null, "confidence": number, "clarificationNeeded": boolean, "clarificationMessage": string | null}`;

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    temperature: 0,
    system: systemPrompt,
    messages: [
      { role: 'user', content: 'are you running and can I ask you questions' },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    console.log(`  HTTP ${response.status} in ${Date.now() - step2Start}ms`);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`  ERROR: ${errText}`);
    } else {
      const data = await response.json();
      console.log(`  Model: ${data.model}`);
      console.log(`  Tokens: ${data.usage.input_tokens} in, ${data.usage.output_tokens} out`);
      console.log(`  Response: ${data.content[0]?.text?.substring(0, 300)}`);
    }
  } catch (err) {
    clearTimeout(timeout);
    console.error(`  FAILED in ${Date.now() - step2Start}ms:`, err.message);
  }

} catch (e) {
  console.error(`  FAILED in ${Date.now() - step1Start}ms:`, e.message);
} finally {
  await sql.end();
}

console.log('\n=== Done ===');
