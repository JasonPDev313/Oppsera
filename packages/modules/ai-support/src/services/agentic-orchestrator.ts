import type { AiAssistantContext, StreamChunk } from '../types';
import { MODEL_TIERS } from '../constants';
import { getAction, actionsToClaudeTools } from './action-registry';
import type { ActionDefinition } from './action-registry';
import { retrieveEvidence } from './retrieval';
import { sanitizeResponse } from './content-guard';
import { db, aiSupportAgenticActions } from '@oppsera/db';

// ── Types ─────────────────────────────────────────────────────────────

export interface AgenticOrchestratorInput {
  messageText: string;
  context: AiAssistantContext;
  threadHistory: Array<{ role: string; content: string }>;
  mode: 'customer' | 'staff';
  availableActions: ActionDefinition[];
  userPermissions: string[];
  /** Optional thread ID for audit logging */
  threadId?: string;
  /** Optional message ID for audit logging */
  messageId?: string;
}

// ── Constants ─────────────────────────────────────────────────────────

/** Total budget across both Claude calls (first + tool_result follow-up) */
const AGENTIC_TOTAL_TIMEOUT_MS = 55_000;
/** Per-call idle timeout */
const AGENTIC_IDLE_TIMEOUT_MS = 20_000;

// ── Helpers ───────────────────────────────────────────────────────────

function sanitizeContextField(value: unknown, maxLen = 200): string {
  if (value == null) return '';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\n\r\x00-\x1f]/g, ' ').slice(0, maxLen);
}

function buildAgenticSystemPrompt(
  context: AiAssistantContext,
  hasTools: boolean,
): string {
  const toolSection = hasTools
    ? `
## Agentic Capabilities
You have access to tools that let you look up live data from the system (orders, inventory, customers, payments). Use them when the user is asking about specific records that you cannot answer from documentation alone. Only call a tool when you have enough information to do so — do not guess at parameter values.`
    : '';

  return `You are OppsEra Assistant, an AI support agent for OppsEra, a multi-tenant SaaS ERP platform for SMBs (retail, restaurant, golf, hybrid).

## Your Role
You help staff members understand how to use the software, diagnose issues, look up live business data, and provide step-by-step guidance.

## User Context
- Current page: ${sanitizeContextField(context.route)}
- Screen title: ${sanitizeContextField(context.screenTitle)}
- Module: ${sanitizeContextField(context.moduleKey)}
- User roles: ${sanitizeContextField(context.roleKeys.join(', '))}
${context.enabledModules ? `- Enabled modules: ${sanitizeContextField(context.enabledModules.join(', '))}` : ''}
${context.visibleActions ? `- Visible actions on screen: ${sanitizeContextField(context.visibleActions.join(', '))}` : ''}
${toolSection}
## Response Rules
1. Use professional but friendly language. You can reference technical terms and internal processes.
2. If you use a tool and get results, summarize the relevant data clearly and concisely.
3. For how-to questions, provide numbered step-by-step instructions when possible.
4. Keep answers concise but complete. Aim for clarity over brevity.
5. Respond in plain markdown. Do NOT wrap your response in JSON or code blocks.
6. If you cannot answer confidently, end with: "I'd recommend reaching out to your system administrator for further help."
7. When referencing navigation paths, use bold arrows: **Menu** → **Submenu** → **Action**.

## Suggested Follow-Up Questions
At the end of your response, if appropriate, suggest 1-3 short follow-up questions the user might ask next. Format them as a bulleted list under a "---" separator.`;
}

function prepareAgenticMessages(
  threadHistory: Array<{ role: string; content: string }>,
  messageText: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  let trimmedHistory = threadHistory.slice(-10);
  const HISTORY_CHAR_LIMIT = 20_000;
  let totalChars = trimmedHistory.reduce((sum, m) => sum + m.content.length, 0);
  while (totalChars > HISTORY_CHAR_LIMIT && trimmedHistory.length > 0) {
    totalChars -= trimmedHistory[0]!.content.length;
    trimmedHistory = trimmedHistory.slice(1);
  }
  return [
    ...trimmedHistory.map((m) => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: messageText },
  ];
}

// ── Claude API (non-streaming, for tool calls) ────────────────────────

interface ClaudeToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ClaudeTextBlock {
  type: 'text';
  text: string;
}

type ClaudeContentBlock = ClaudeToolUseBlock | ClaudeTextBlock;

interface ClaudeMessagesResponse {
  id: string;
  type: string;
  role: string;
  content: ClaudeContentBlock[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

/** Non-streaming call — used for the first call when tools are present.
 *  We cannot stream and detect tool_use mid-stream reliably, so we do a
 *  non-streaming first call to detect if a tool is needed, then stream the follow-up. */
async function callClaudeWithTools(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string | unknown[] }>,
  tools: ReturnType<typeof actionsToClaudeTools>,
  modelId: string,
  maxTokens: number,
  signal: AbortSignal,
): Promise<ClaudeMessagesResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools,
      messages,
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  return response.json() as Promise<ClaudeMessagesResponse>;
}

/** Streaming call — used for the final text response after tool execution. */
async function callClaudeStreaming(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string | unknown[] }>,
  onChunk: (text: string) => void,
  modelId: string,
  maxTokens: number,
  signal: AbortSignal,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  if (!response.body) throw new Error('Anthropic API returned no body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  let idleTimer = setTimeout(() => {
    reader.cancel().catch(() => undefined);
  }, AGENTIC_IDLE_TIMEOUT_MS);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      reader.cancel().catch(() => undefined);
    }, AGENTIC_IDLE_TIMEOUT_MS);

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const event = JSON.parse(data) as { type?: string; delta?: { text?: string } };
        if (event.type === 'content_block_delta' && event.delta?.text) {
          fullText += event.delta.text;
          onChunk(event.delta.text);
        }
      } catch {
        // Skip unparseable SSE lines
      }
    }
  }

  clearTimeout(idleTimer);
  return fullText;
}

// ── Audit Log ─────────────────────────────────────────────────────────

async function logAgenticAction(params: {
  tenantId: string;
  threadId: string;
  messageId?: string;
  actionName: string;
  actionParams: Record<string, unknown>;
  result: { success: boolean; data?: unknown; error?: string };
  durationMs: number;
}): Promise<void> {
  try {
    await db.insert(aiSupportAgenticActions).values({
      tenantId: params.tenantId,
      threadId: params.threadId,
      messageId: params.messageId ?? null,
      actionName: params.actionName,
      actionParams: params.actionParams,
      actionResult: params.result.data ?? null,
      status: params.result.success ? 'success' : 'error',
      errorMessage: params.result.error ?? null,
      durationMs: params.durationMs,
    });
  } catch (err) {
    // Non-critical — never let audit failures break the response
    console.warn('[ai-support/agentic-orchestrator] Audit log failed:', err);
  }
}

// ── Follow-up Extractor ───────────────────────────────────────────────

function extractFollowups(text: string): string[] {
  const stripped = text.replace(/```[\s\S]*?```/g, '');
  const lastSeparator = stripped.lastIndexOf('\n---');
  if (lastSeparator === -1) return [];
  const afterSeparator = stripped.slice(lastSeparator + 4);
  const lines = afterSeparator.split('\n').map((l) => l.trim());
  const followups: string[] = [];
  for (const line of lines) {
    const match = line.match(/^[-*]\s+(.+)/);
    if (match?.[1] && match[1].length > 10) followups.push(match[1]);
  }
  return followups.slice(0, 3);
}

// ── Main Agentic Orchestrator ─────────────────────────────────────────

/**
 * Agentic orchestrator: extends the base orchestrator with tool_use support.
 *
 * Flow:
 *   1. Retrieve evidence + build system prompt
 *   2. Non-streaming first call with tools array
 *   3. If stop_reason === 'tool_use': execute the action, stream SSE action events,
 *      then make a second streaming call with tool_result appended
 *   4. If no tool_use: re-stream the text response from the first call
 *
 * Only ONE tool call per turn is supported. Parallel tool use is not handled.
 * Total timeout across both calls: 55s.
 */
export function runAgenticOrchestrator(
  input: AgenticOrchestratorInput,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cancelled = false;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller;

      const sendEvent = (chunk: StreamChunk) => {
        const ctrl = controllerRef;
        if (cancelled || !ctrl) return;
        const line = `data: ${JSON.stringify(chunk)}\n\n`;
        try {
          ctrl.enqueue(encoder.encode(line));
        } catch {
          cancelled = true;
          controllerRef = null;
        }
      };

      // Global abort controller — 55s total budget
      const abortController = new AbortController();
      const totalTimeout = setTimeout(
        () => abortController.abort(),
        AGENTIC_TOTAL_TIMEOUT_MS,
      );

      try {
        // ── Step 1: Retrieve evidence ──────────────────────────────────
        const allEvidence = await retrieveEvidence({
          route: input.context.route,
          moduleKey: input.context.moduleKey,
          question: input.messageText,
          mode: input.mode,
          context: input.context,
        });

        // ── Step 2: Build prompt + messages ───────────────────────────
        const hasTools = input.availableActions.length > 0;
        const systemPrompt = buildAgenticSystemPrompt(input.context, hasTools);

        // Append evidence block to system prompt
        const evidenceBlock =
          allEvidence.length > 0
            ? '\n\n## Evidence from Knowledge Base\n' +
              allEvidence
                .map(
                  (e, i) =>
                    `<evidence index="${i + 1}" tier="${e.tier}" source="${e.source}"${e.matchScore != null ? ` match="${e.matchScore.toFixed(2)}"` : ''}>\n${e.content}\n</evidence>`,
                )
                .join('\n\n')
            : '\n\n## Evidence from Knowledge Base\n<no-evidence>No pre-approved answers or documentation found for this question.</no-evidence>';

        const fullSystemPrompt = systemPrompt + evidenceBlock;
        const messages = prepareAgenticMessages(
          input.threadHistory,
          input.messageText,
        );

        const modelConfig = MODEL_TIERS.standard; // Agentic always uses Sonnet minimum
        const claudeTools = actionsToClaudeTools(input.availableActions);

        // ── Step 3: First call (non-streaming) with tools ──────────────
        const firstResponse = await callClaudeWithTools(
          fullSystemPrompt,
          messages,
          claudeTools,
          modelConfig.id,
          modelConfig.maxTokens,
          abortController.signal,
        );

        // ── Step 4: Handle tool_use or plain text ──────────────────────
        let finalText: string;

        if (firstResponse.stop_reason === 'tool_use') {
          // Find the first tool_use block
          const toolUseBlock = firstResponse.content.find(
            (b): b is ClaudeToolUseBlock => b.type === 'tool_use',
          );

          if (!toolUseBlock) {
            // Unexpected — fall back to any text in the response
            const textBlock = firstResponse.content.find(
              (b): b is ClaudeTextBlock => b.type === 'text',
            );
            finalText = textBlock?.text ?? '';
            if (finalText) sendEvent({ type: 'chunk', text: finalText });
          } else {
            // ── Execute the action ─────────────────────────────────────
            const actionName = toolUseBlock.name;
            const actionParams = toolUseBlock.input;

            sendEvent({ type: 'action', name: actionName, status: 'executing' });

            // Validate action is in the user's available set (prevent hallucinated tool names)
            const isAllowed = input.availableActions.some((a) => a.name === actionName);
            const actionDef = isAllowed ? getAction(actionName) : undefined;
            const startMs = Date.now();
            let actionResult: { success: boolean; data?: unknown; error?: string };

            if (!actionDef) {
              actionResult = {
                success: false,
                error: `Action '${actionName}' is not available`,
              };
            } else {
              try {
                actionResult = await actionDef.executor(actionParams, {
                  tenantId: input.context.tenantId,
                  locationId: input.context.locationId,
                });
              } catch (err) {
                actionResult = {
                  success: false,
                  error: err instanceof Error ? err.message : 'Execution failed',
                };
              }
            }

            const durationMs = Date.now() - startMs;

            // Audit log — must await to avoid zombie DB connections on Vercel
            if (input.threadId) {
              await logAgenticAction({
                tenantId: input.context.tenantId,
                threadId: input.threadId,
                messageId: input.messageId,
                actionName,
                actionParams,
                result: actionResult,
                durationMs,
              });
            }

            sendEvent({
              type: 'action',
              name: actionName,
              status: actionResult.success ? 'complete' : 'error',
              result: actionResult.success
                ? JSON.stringify(actionResult.data)
                : actionResult.error,
            });

            // ── Step 5: Second call (streaming) with tool_result ───────
            const toolResultContent = [
              // Include any text blocks the model sent before the tool call
              ...firstResponse.content
                .filter((b): b is ClaudeTextBlock => b.type === 'text')
                .map((b) => ({ type: 'text' as const, text: b.text })),
              {
                type: 'tool_use' as const,
                id: toolUseBlock.id,
                name: actionName,
                input: actionParams,
              },
            ];

            const toolResultMessage = {
              role: 'tool' as unknown as 'user', // Anthropic expects 'user' role with tool_result
              content: [
                {
                  type: 'tool_result' as const,
                  tool_use_id: toolUseBlock.id,
                  content: JSON.stringify(
                    actionResult.success ? actionResult.data : { error: actionResult.error },
                  ),
                },
              ],
            };

            const followUpMessages: Array<{
              role: 'user' | 'assistant';
              content: string | unknown[];
            }> = [
              ...messages,
              { role: 'assistant' as const, content: toolResultContent },
              { role: 'user' as const, content: toolResultMessage.content },
            ];

            finalText = await callClaudeStreaming(
              fullSystemPrompt,
              followUpMessages,
              (text) => sendEvent({ type: 'chunk', text }),
              modelConfig.id,
              modelConfig.maxTokens,
              abortController.signal,
            );
          }
        } else {
          // No tool_use — stream the text blocks from the first response directly
          const textBlocks = firstResponse.content.filter(
            (b): b is ClaudeTextBlock => b.type === 'text',
          );
          finalText = textBlocks.map((b) => b.text).join('');
          if (finalText) sendEvent({ type: 'chunk', text: finalText });
        }

        // ── Step 6: Sanitize + done event ──────────────────────────────
        const sanitized = sanitizeResponse(finalText, input.mode);
        if (sanitized !== finalText) {
          sendEvent({ type: 'chunk', text: '\n\n---\n*[Response modified for safety]*' });
        }

        const suggestedFollowups = extractFollowups(sanitized);

        sendEvent({
          type: 'done',
          confidence: 'medium',
          sourceTier: allEvidence.length > 0 ? allEvidence[0]!.tier : 't7',
          sources: allEvidence.map((e) => e.source),
          suggestedFollowups: suggestedFollowups.length > 0 ? suggestedFollowups : undefined,
          modelUsed: modelConfig.id,
        });
      } catch (err) {
        if (cancelled) return;
        console.error('[ai-support/agentic-orchestrator] Error:', err);
        const hint = err instanceof Error ? err.message.slice(0, 120) : '';
        sendEvent({
          type: 'error',
          message: `Something went wrong. Please try again.${hint ? ` (${hint})` : ''}`,
        });
      } finally {
        clearTimeout(totalTimeout);
        try {
          controllerRef?.close();
        } catch {
          // Already closed
        }
        controllerRef = null;
      }
    },
    cancel() {
      cancelled = true;
      controllerRef = null;
    },
  });

  return stream;
}
