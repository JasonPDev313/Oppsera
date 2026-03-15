import {
  db,
  aiSupportTestCases,
  aiSupportTestRuns,
  aiSupportTestResults,
} from '@oppsera/db';
import { eq, desc, inArray } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { FAST_MODEL_ID } from '../constants';

// ── Types ────────────────────────────────────────────────────────────

interface TestRunSummary {
  passed: number;
  failed: number;
  regressed: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Score the actual answer against the expected pattern.
 * Treats pattern as regex if it starts with `/`, otherwise case-insensitive substring match.
 */
function scoreAnswer(actualAnswer: string, expectedPattern: string): { passed: boolean; score: number } {
  const actual = actualAnswer.toLowerCase();

  if (expectedPattern.startsWith('/') && expectedPattern.length <= 500) {
    // Regex pattern: strip leading/trailing slashes and optional flags
    // Cap length to 500 chars and reject nested quantifiers to prevent ReDoS
    const match = expectedPattern.match(/^\/(.+)\/([gimsuy]*)$/);
    if (match && match[1] && !/(\+|\*|\{)\??\)(\+|\*|\{)/.test(match[1])) {
      const existingFlags = match[2] || '';
      const flags = existingFlags.includes('i') ? existingFlags : existingFlags + 'i';
      try {
        const re = new RegExp(match[1], flags);
        const passed = re.test(actualAnswer);
        return { passed, score: passed ? 1 : 0 };
      } catch {
        // Invalid regex — fall through to substring match
      }
    }
  }

  // Case-insensitive substring match
  const passed = actual.includes(expectedPattern.toLowerCase());
  return { passed, score: passed ? 1 : 0 };
}

/**
 * Call Claude Haiku directly (non-streaming) for test evaluation.
 * Avoids importing the full orchestrator to keep the service simple.
 */
async function callClaudeHaiku(question: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: FAST_MODEL_ID,
      max_tokens: 1024,
      system:
        'You are OppsEra Assistant. Answer the following question about the OppsEra ERP platform. Be concise and accurate.',
      messages: [{ role: 'user', content: question.slice(0, 4000) }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
  };

  const textBlock = data.content?.find((b) => b.type === 'text');
  return textBlock?.text ?? '';
}

// ── Public Functions ─────────────────────────────────────────────────

/**
 * Create a new test run record and return its ID.
 */
export async function createTestRun(name: string): Promise<string> {
  const id = generateUlid();
  await db.insert(aiSupportTestRuns).values({
    id,
    name,
    status: 'pending',
    totalCases: 0,
    passed: 0,
    failed: 0,
    regressed: 0,
  });
  return id;
}

/**
 * Execute all (or specified) test cases under a given run ID.
 * Serialized — not parallelized — to respect Vercel DB pool constraints (max: 2).
 */
export async function runTestSuite(
  runId: string,
  testCaseIds?: string[],
): Promise<TestRunSummary> {
  // 1. Update run status to 'running'
  await db
    .update(aiSupportTestRuns)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(aiSupportTestRuns.id, runId));

  let passed = 0;
  let failed = 0;
  let regressed = 0;

  try {
    // 2. Load test cases (cap to 200 to prevent unbounded work)
    const validIds = testCaseIds?.filter((id) => typeof id === 'string' && id.length <= 30).slice(0, 200);
    const cases = validIds && validIds.length > 0
      ? await db
          .select()
          .from(aiSupportTestCases)
          .where(inArray(aiSupportTestCases.id, validIds))
      : await db
          .select()
          .from(aiSupportTestCases)
          .where(eq(aiSupportTestCases.enabled, 'true'));

    // 3. Update totalCases
    await db
      .update(aiSupportTestRuns)
      .set({ totalCases: cases.length })
      .where(eq(aiSupportTestRuns.id, runId));

    // 4. Execute each test case serially
    for (const testCase of cases) {
      const startMs = Date.now();
      let actualAnswer = '';
      let testPassed = false;
      let score = 0;
      let isRegression = false;

      try {
        // a. Call Claude Haiku
        actualAnswer = await callClaudeHaiku(testCase.question);

        // b. Score the answer
        const result = scoreAnswer(actualAnswer, testCase.expectedAnswerPattern);
        testPassed = result.passed;
        score = result.score;

        // c. Check for regression: most recent result for this test case across any prior run
        const previousResults = await db
          .select({ passed: aiSupportTestResults.passed })
          .from(aiSupportTestResults)
          .where(eq(aiSupportTestResults.testCaseId, testCase.id))
          .orderBy(desc(aiSupportTestResults.createdAt))
          .limit(1);

        const previousResult = previousResults[0];
        if (previousResult && previousResult.passed === 'true' && !testPassed) {
          isRegression = true;
        }
      } catch (err) {
        // Test execution error — treat as failed, record the error (truncated)
        const errMsg = err instanceof Error ? err.message : String(err);
        actualAnswer = `ERROR: ${errMsg.slice(0, 500)}`;
        testPassed = false;
        score = 0;
      }

      const durationMs = Date.now() - startMs;

      // d. Insert result
      await db.insert(aiSupportTestResults).values({
        id: generateUlid(),
        runId,
        testCaseId: testCase.id,
        actualAnswer,
        confidence: null,
        sourceTier: null,
        passed: testPassed ? 'true' : 'false',
        regression: isRegression ? 'true' : 'false',
        score: String(score),
        durationMs,
      });

      // e. Increment counters
      if (testPassed) {
        passed++;
      } else {
        failed++;
        if (isRegression) regressed++;
      }
    }

    // 5. Update the run record with final results
    await db
      .update(aiSupportTestRuns)
      .set({
        status: 'completed',
        passed,
        failed,
        regressed,
        completedAt: new Date(),
      })
      .where(eq(aiSupportTestRuns.id, runId));
  } catch (err) {
    // Mark run as failed so it doesn't stay stuck in 'running' forever
    console.error('[ai-support/test-runner] runTestSuite failed:', err);
    await db
      .update(aiSupportTestRuns)
      .set({ status: 'failed', completedAt: new Date(), passed, failed, regressed })
      .where(eq(aiSupportTestRuns.id, runId))
      .catch((e: unknown) => console.error('[ai-support/test-runner] Failed to mark run as failed:', e));
    throw err;
  }

  return { passed, failed, regressed };
}
