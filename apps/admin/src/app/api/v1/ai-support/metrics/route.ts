import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';

const PERIOD_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export const GET = withAdminPermission(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const period = sp.get('period') ?? '7d';
  const days = PERIOD_DAYS[period] ?? 7;

  const [metricsRows, topScreenRows, topQuestionsRows] = await Promise.all([
    withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          COUNT(DISTINCT th.id)::int AS total_threads,
          COUNT(DISTINCT CASE WHEN th.created_at >= NOW() - INTERVAL '1 day' * ${days} THEN th.id END)::int AS threads_in_period,
          COUNT(DISTINCT m.id) FILTER (WHERE m.created_at >= NOW() - INTERVAL '1 day' * ${days} AND m.role = 'user')::int AS questions_asked,
          COUNT(DISTINCT m.id) FILTER (WHERE m.created_at >= NOW() - INTERVAL '1 day' * ${days} AND m.role = 'assistant' AND m.answer_confidence = 'low')::int AS low_confidence_count,
          COUNT(DISTINCT m.id) FILTER (WHERE m.created_at >= NOW() - INTERVAL '1 day' * ${days} AND m.role = 'assistant')::int AS assistant_messages,
          COUNT(DISTINCT f.id) FILTER (WHERE f.created_at >= NOW() - INTERVAL '1 day' * ${days} AND f.rating = 'down')::int AS thumbs_down_count,
          COUNT(DISTINCT f.id) FILTER (WHERE f.created_at >= NOW() - INTERVAL '1 day' * ${days})::int AS total_feedback,
          (
            SELECT th2.module_key
            FROM ai_assistant_threads th2
            WHERE th2.created_at >= NOW() - INTERVAL '1 day' * ${days}
              AND th2.module_key IS NOT NULL
            GROUP BY th2.module_key
            ORDER BY COUNT(*) DESC
            LIMIT 1
          ) AS top_module
        FROM ai_assistant_threads th
        LEFT JOIN ai_assistant_messages m ON m.thread_id = th.id
        LEFT JOIN ai_assistant_feedback f ON f.message_id = m.id
      `);
    }),
    withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          COALESCE(th.current_route, 'unknown') AS route,
          th.module_key,
          COUNT(DISTINCT th.id)::int AS thread_count
        FROM ai_assistant_threads th
        WHERE th.created_at >= NOW() - INTERVAL '1 day' * ${days}
        GROUP BY th.current_route, th.module_key
        ORDER BY thread_count DESC
        LIMIT 10
      `);
    }),
    withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          LEFT(m.message_text, 120) AS question_snippet,
          COUNT(*)::int AS occurrences,
          th.module_key
        FROM ai_assistant_messages m
        JOIN ai_assistant_threads th ON th.id = m.thread_id
        WHERE m.role = 'user'
          AND m.created_at >= NOW() - INTERVAL '1 day' * ${days}
          AND LENGTH(m.message_text) > 10
        GROUP BY LEFT(m.message_text, 120), th.module_key
        HAVING COUNT(*) > 1
        ORDER BY occurrences DESC
        LIMIT 10
      `);
    }),
  ]);

  const metricsList = Array.from(metricsRows as Iterable<Record<string, unknown>>);
  const metrics = metricsList[0] ?? {};

  const questionsAsked = Number(metrics.questions_asked ?? 0);
  const assistantMessages = Number(metrics.assistant_messages ?? 0);
  const lowConfidenceCount = Number(metrics.low_confidence_count ?? 0);
  const thumbsDownCount = Number(metrics.thumbs_down_count ?? 0);
  const totalFeedback = Number(metrics.total_feedback ?? 0);

  const lowConfidenceRate = assistantMessages > 0
    ? Math.round((lowConfidenceCount / assistantMessages) * 100)
    : 0;
  const thumbsDownRate = totalFeedback > 0
    ? Math.round((thumbsDownCount / totalFeedback) * 100)
    : 0;

  const topScreens = Array.from(topScreenRows as Iterable<Record<string, unknown>>).map((r) => ({
    route: r.route as string,
    moduleKey: r.module_key as string | null,
    threadCount: Number(r.thread_count),
  }));

  const topQuestions = Array.from(topQuestionsRows as Iterable<Record<string, unknown>>).map((r) => ({
    questionSnippet: r.question_snippet as string,
    moduleKey: r.module_key as string | null,
    occurrences: Number(r.occurrences),
  }));

  return NextResponse.json({
    data: {
      period,
      questionsAsked,
      lowConfidenceRate,
      thumbsDownRate,
      topModule: metrics.top_module as string | null,
      lowConfidenceCount,
      thumbsDownCount,
      totalFeedback,
      assistantMessages,
      topScreens,
      topQuestions,
    },
  });
}, { permission: 'ai_support.admin' });
