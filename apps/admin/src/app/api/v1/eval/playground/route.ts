import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { generateUlid } from '@oppsera/shared';

// ── POST: run a query through the semantic pipeline (sandbox) ───────────

export const POST = withAdminAuth(
  async (req: NextRequest, session) => {
    const body = await req.json();
    const {
      question,
      tenantId,
    } = body as {
      question: string;
      tenantId?: string;
      systemPrompt?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
    };

    if (!question) {
      return NextResponse.json(
        { error: { message: 'question is required' } },
        { status: 400 },
      );
    }

    const startMs = Date.now();

    try {
      // Import pipeline dynamically to avoid build issues if not yet available
      const { runPipeline } = await import('@oppsera/module-semantic');

      const result = await runPipeline({
        message: question,
        context: {
          tenantId: tenantId ?? 'playground',
          userId: session.adminId,
          userRole: 'admin',
          sessionId: generateUlid(),
          currentDate: new Date().toISOString().slice(0, 10),
        },
        skipNarrative: false,
      });

      const totalMs = Date.now() - startMs;

      return NextResponse.json({
        data: {
          success: true,
          result: {
            mode: result.mode,
            narrative: result.narrative,
            sections: result.sections,
            data: result.data,
            plan: result.plan,
            isClarification: result.isClarification,
            clarificationText: result.clarificationText,
            compiledSql: result.compiledSql,
            compilationErrors: result.compilationErrors,
            tablesAccessed: result.tablesAccessed,
            cacheStatus: result.cacheStatus,
            suggestedFollowUps: result.suggestedFollowUps,
            chartConfig: result.chartConfig,
          },
          timing: {
            totalMs,
            llmLatencyMs: result.llmLatencyMs,
            executionTimeMs: result.executionTimeMs,
          },
          tokens: {
            input: result.tokensInput,
            output: result.tokensOutput,
          },
          meta: {
            provider: result.provider,
            model: result.model,
            llmConfidence: result.llmConfidence,
            evalTurnId: result.evalTurnId,
          },
        },
      });
    } catch (err) {
      const totalMs = Date.now() - startMs;
      const message = err instanceof Error ? err.message : 'Unknown pipeline error';
      const stack = err instanceof Error ? err.stack : undefined;

      // Sandbox endpoint — always returns 200 with error info in body
      return NextResponse.json({
        data: {
          success: false,
          error: {
            message,
            stack: process.env.NODE_ENV !== 'production' ? stack : undefined,
          },
          timing: {
            totalMs,
          },
        },
      });
    }
  },
  'admin',
);
