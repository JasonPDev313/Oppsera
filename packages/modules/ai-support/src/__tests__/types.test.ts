import { describe, it, expect } from 'vitest';
import {
  CreateThreadSchema,
  SendMessageSchema,
  SubmitFeedbackSchema,
  AiAssistantContextSchema,
  AiAssistantResponseSchema,
  StreamChunkSchema,
} from '../types';

// ── Helper: minimal valid context ──────────────────────────────────────────

const validContext = {
  route: '/orders',
  tenantId: 'tenant_01',
  roleKeys: ['manager'],
};

// ── CreateThreadSchema ──────────────────────────────────────────────────────

describe('CreateThreadSchema', () => {
  it('accepts valid input with defaults', () => {
    const result = CreateThreadSchema.safeParse({
      currentRoute: '/orders',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.channel).toBe('in_app');
    }
  });

  it('accepts all channel values', () => {
    const channels = ['in_app', 'admin_review', 'support_internal'] as const;
    for (const channel of channels) {
      const result = CreateThreadSchema.safeParse({ currentRoute: '/orders', channel });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid channel', () => {
    const result = CreateThreadSchema.safeParse({
      currentRoute: '/orders',
      channel: 'invalid_channel',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing currentRoute', () => {
    const result = CreateThreadSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts optional moduleKey', () => {
    const result = CreateThreadSchema.safeParse({
      currentRoute: '/orders',
      moduleKey: 'orders',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.moduleKey).toBe('orders');
    }
  });
});

// ── SendMessageSchema ───────────────────────────────────────────────────────

describe('SendMessageSchema', () => {
  it('accepts valid input', () => {
    const result = SendMessageSchema.safeParse({
      threadId: 'thread_01',
      messageText: 'How do I create an order?',
      contextSnapshot: validContext,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty message', () => {
    const result = SendMessageSchema.safeParse({
      threadId: 'thread_01',
      messageText: '',
      contextSnapshot: validContext,
    });
    expect(result.success).toBe(false);
  });

  it('rejects message exceeding max length', () => {
    const result = SendMessageSchema.safeParse({
      threadId: 'thread_01',
      messageText: 'x'.repeat(4001),
      contextSnapshot: validContext,
    });
    expect(result.success).toBe(false);
  });

  it('accepts message at exactly max length', () => {
    const result = SendMessageSchema.safeParse({
      threadId: 'thread_01',
      messageText: 'x'.repeat(4000),
      contextSnapshot: validContext,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing threadId', () => {
    const result = SendMessageSchema.safeParse({
      messageText: 'hello',
      contextSnapshot: validContext,
    });
    expect(result.success).toBe(false);
  });
});

// ── SubmitFeedbackSchema ────────────────────────────────────────────────────

describe('SubmitFeedbackSchema', () => {
  it('accepts valid up rating', () => {
    const result = SubmitFeedbackSchema.safeParse({
      messageId: 'msg_01',
      rating: 'up',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid down rating', () => {
    const result = SubmitFeedbackSchema.safeParse({
      messageId: 'msg_01',
      rating: 'down',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid rating', () => {
    const result = SubmitFeedbackSchema.safeParse({
      messageId: 'msg_01',
      rating: 'neutral',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional reasonCode', () => {
    const result = SubmitFeedbackSchema.safeParse({
      messageId: 'msg_01',
      rating: 'down',
      reasonCode: 'not_accurate',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid reasonCode', () => {
    const result = SubmitFeedbackSchema.safeParse({
      messageId: 'msg_01',
      rating: 'down',
      reasonCode: 'bad_vibes',
    });
    expect(result.success).toBe(false);
  });

  it('rejects freeformComment exceeding max length', () => {
    const result = SubmitFeedbackSchema.safeParse({
      messageId: 'msg_01',
      rating: 'up',
      freeformComment: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

// ── AiAssistantContextSchema ────────────────────────────────────────────────

describe('AiAssistantContextSchema', () => {
  it('accepts minimal valid context', () => {
    const result = AiAssistantContextSchema.safeParse(validContext);
    expect(result.success).toBe(true);
  });

  it('requires route', () => {
    const result = AiAssistantContextSchema.safeParse({
      tenantId: 'tenant_01',
      roleKeys: ['manager'],
    });
    expect(result.success).toBe(false);
  });

  it('requires tenantId', () => {
    const result = AiAssistantContextSchema.safeParse({
      route: '/orders',
      roleKeys: ['manager'],
    });
    expect(result.success).toBe(false);
  });

  it('requires roleKeys array', () => {
    const result = AiAssistantContextSchema.safeParse({
      route: '/orders',
      tenantId: 'tenant_01',
    });
    expect(result.success).toBe(false);
  });

  it('accepts full context with all optional fields', () => {
    const result = AiAssistantContextSchema.safeParse({
      route: '/orders',
      screenTitle: 'Orders',
      moduleKey: 'orders',
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      roleKeys: ['manager', 'cashier'],
      permissionKeys: ['orders.read', 'orders.create'],
      featureFlags: { newOrderFlow: true },
      enabledModules: ['orders', 'inventory'],
      tenantSettings: { timezone: 'UTC' },
      visibleActions: ['create_order', 'void_order'],
      selectedRecord: { id: 'order_01' },
      uiState: { tab: 'active' },
    });
    expect(result.success).toBe(true);
  });
});

// ── AiAssistantResponseSchema (discriminated union) ─────────────────────────

describe('AiAssistantResponseSchema', () => {
  it('validates high confidence answer', () => {
    const result = AiAssistantResponseSchema.safeParse({
      answer: 'Here is how you do it.',
      confidence: 'high',
      answerMode: 'guide',
      usedSources: ['answer_card:how-to-orders'],
      sourceTierUsed: 't2',
      needsReview: false,
    });
    expect(result.success).toBe(true);
  });

  it('validates medium confidence answer', () => {
    const result = AiAssistantResponseSchema.safeParse({
      answer: 'Based on the route manifest...',
      confidence: 'medium',
      answerMode: 'explain',
      usedSources: ['route_manifest:/orders'],
      sourceTierUsed: 't4',
      needsReview: false,
    });
    expect(result.success).toBe(true);
  });

  it('validates low confidence answer with knownUnknowns', () => {
    const result = AiAssistantResponseSchema.safeParse({
      answer: "I'm not sure but here's what I know.",
      confidence: 'low',
      answerMode: 'escalate',
      knownUnknowns: {
        whatIKnow: 'Orders can be created.',
        whatMayVary: 'Exact steps depend on your config.',
        whatICantConfirm: 'Whether this applies to your account.',
        recommendedNextStep: 'Contact support.',
      },
      needsReview: true,
      usedSources: [],
      sourceTierUsed: 't7',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown confidence level', () => {
    const result = AiAssistantResponseSchema.safeParse({
      answer: 'Some answer',
      confidence: 'very_high',
      answerMode: 'guide',
      usedSources: [],
      sourceTierUsed: 't1',
      needsReview: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects low confidence without knownUnknowns', () => {
    const result = AiAssistantResponseSchema.safeParse({
      answer: 'Some answer',
      confidence: 'low',
      answerMode: 'guide',  // should be 'escalate' for low
      usedSources: [],
      sourceTierUsed: 't7',
      needsReview: true,
      // missing knownUnknowns
    });
    expect(result.success).toBe(false);
  });
});

// ── StreamChunkSchema ───────────────────────────────────────────────────────

describe('StreamChunkSchema', () => {
  it('validates chunk type', () => {
    const result = StreamChunkSchema.safeParse({
      type: 'chunk',
      text: 'Hello world',
    });
    expect(result.success).toBe(true);
  });

  it('validates done type', () => {
    const result = StreamChunkSchema.safeParse({
      type: 'done',
      confidence: 'high',
      sourceTier: 't2',
      sources: ['answer_card:test'],
    });
    expect(result.success).toBe(true);
  });

  it('validates done type with optional followups', () => {
    const result = StreamChunkSchema.safeParse({
      type: 'done',
      confidence: 'medium',
      sourceTier: 't4',
      sources: [],
      suggestedFollowups: ['What else can I do?'],
    });
    expect(result.success).toBe(true);
  });

  it('validates error type', () => {
    const result = StreamChunkSchema.safeParse({
      type: 'error',
      message: 'Something went wrong.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown chunk type', () => {
    const result = StreamChunkSchema.safeParse({
      type: 'unknown_type',
      text: 'hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects chunk type without text', () => {
    const result = StreamChunkSchema.safeParse({
      type: 'chunk',
    });
    expect(result.success).toBe(false);
  });
});
