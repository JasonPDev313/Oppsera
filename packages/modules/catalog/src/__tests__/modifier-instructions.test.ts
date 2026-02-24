import { describe, it, expect } from 'vitest';
import {
  instructionModeEnum,
  defaultBehaviorEnum,
  channelEnum,
  createModifierGroupSchema,
} from '../validation';

// ---------------------------------------------------------------------------
// Local helper: mirrors POS price resolution logic from ModifierDialog.tsx
// and FnbModifierDrawer.tsx. Both components implement the same switch.
// ---------------------------------------------------------------------------

type ModifierInstruction = 'none' | 'extra' | 'on_side' | null;

function resolveModPrice(
  basePriceDelta: number,
  instruction: ModifierInstruction,
  extraPriceDelta: number | null,
): number {
  switch (instruction) {
    case 'none':
      return 0;
    case 'extra':
      return extraPriceDelta ?? basePriceDelta;
    default:
      return basePriceDelta;
  }
}

// ---------------------------------------------------------------------------
// 1. Price resolution with instructions
// ---------------------------------------------------------------------------

describe('resolveModPrice — instruction-based price resolution', () => {
  it('returns 0 when instruction is "none" (customer removes modifier)', () => {
    expect(resolveModPrice(150, 'none', null)).toBe(0);
    expect(resolveModPrice(150, 'none', 200)).toBe(0);
    expect(resolveModPrice(0, 'none', null)).toBe(0);
  });

  it('uses extraPriceDelta when instruction is "extra" and extraPriceDelta exists', () => {
    expect(resolveModPrice(150, 'extra', 250)).toBe(250);
    expect(resolveModPrice(0, 'extra', 100)).toBe(100);
  });

  it('falls back to basePriceDelta when instruction is "extra" but no extraPriceDelta', () => {
    expect(resolveModPrice(150, 'extra', null)).toBe(150);
    expect(resolveModPrice(300, 'extra', null)).toBe(300);
  });

  it('uses basePriceDelta when instruction is "on_side" (no price change)', () => {
    expect(resolveModPrice(150, 'on_side', null)).toBe(150);
    expect(resolveModPrice(150, 'on_side', 250)).toBe(150);
  });

  it('uses basePriceDelta when instruction is null (default behavior)', () => {
    expect(resolveModPrice(150, null, null)).toBe(150);
    expect(resolveModPrice(150, null, 250)).toBe(150);
    expect(resolveModPrice(0, null, null)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Instruction mode validation (Zod enums)
// ---------------------------------------------------------------------------

describe('instructionModeEnum validation', () => {
  it('accepts valid instruction modes: none, all, per_option', () => {
    expect(instructionModeEnum.parse('none')).toBe('none');
    expect(instructionModeEnum.parse('all')).toBe('all');
    expect(instructionModeEnum.parse('per_option')).toBe('per_option');
  });

  it('rejects invalid instruction mode values', () => {
    expect(() => instructionModeEnum.parse('extra')).toThrow();
    expect(() => instructionModeEnum.parse('on_side')).toThrow();
    expect(() => instructionModeEnum.parse('')).toThrow();
    expect(() => instructionModeEnum.parse(123)).toThrow();
  });
});

describe('defaultBehaviorEnum validation', () => {
  it('accepts valid default behaviors: none, auto_select_defaults', () => {
    expect(defaultBehaviorEnum.parse('none')).toBe('none');
    expect(defaultBehaviorEnum.parse('auto_select_defaults')).toBe('auto_select_defaults');
  });

  it('rejects invalid default behavior values', () => {
    expect(() => defaultBehaviorEnum.parse('auto')).toThrow();
    expect(() => defaultBehaviorEnum.parse('select_all')).toThrow();
    expect(() => defaultBehaviorEnum.parse('')).toThrow();
  });
});

describe('channelEnum validation', () => {
  it('accepts valid channels: pos, online, qr, kiosk', () => {
    expect(channelEnum.parse('pos')).toBe('pos');
    expect(channelEnum.parse('online')).toBe('online');
    expect(channelEnum.parse('qr')).toBe('qr');
    expect(channelEnum.parse('kiosk')).toBe('kiosk');
  });

  it('rejects invalid channel values', () => {
    expect(() => channelEnum.parse('mobile')).toThrow();
    expect(() => channelEnum.parse('web')).toThrow();
    expect(() => channelEnum.parse('')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. Per-option instruction flag validation
// ---------------------------------------------------------------------------

describe('per-option instruction flags on modifier options', () => {
  const baseGroup = {
    name: 'Toppings',
    selectionType: 'multiple' as const,
    isRequired: false,
    minSelections: 0,
    instructionMode: 'per_option' as const,
    modifiers: [
      { name: 'Cheese', priceAdjustment: 0.50 },
    ],
  };

  it('allows mixed instruction flags: allowNone=false, allowExtra=true, allowOnSide=true', () => {
    const input = {
      ...baseGroup,
      modifiers: [
        {
          name: 'Lettuce',
          priceAdjustment: 0,
          allowNone: false,
          allowExtra: true,
          allowOnSide: true,
        },
      ],
    };
    const result = createModifierGroupSchema.parse(input);
    const mod = result.modifiers[0]!;
    expect(mod.allowNone).toBe(false);
    expect(mod.allowExtra).toBe(true);
    expect(mod.allowOnSide).toBe(true);
  });

  it('allows all flags false (no instructions available for this option)', () => {
    const input = {
      ...baseGroup,
      modifiers: [
        {
          name: 'Onion',
          priceAdjustment: 0.25,
          allowNone: false,
          allowExtra: false,
          allowOnSide: false,
        },
      ],
    };
    const result = createModifierGroupSchema.parse(input);
    const mod = result.modifiers[0]!;
    expect(mod.allowNone).toBe(false);
    expect(mod.allowExtra).toBe(false);
    expect(mod.allowOnSide).toBe(false);
  });

  it('allows all flags true (all instructions available)', () => {
    const input = {
      ...baseGroup,
      modifiers: [
        {
          name: 'Tomato',
          priceAdjustment: 0,
          allowNone: true,
          allowExtra: true,
          allowOnSide: true,
        },
      ],
    };
    const result = createModifierGroupSchema.parse(input);
    const mod = result.modifiers[0]!;
    expect(mod.allowNone).toBe(true);
    expect(mod.allowExtra).toBe(true);
    expect(mod.allowOnSide).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Auto-select defaults behavior
// ---------------------------------------------------------------------------

describe('auto-select defaults behavior via defaultBehavior field', () => {
  it('auto_select_defaults: modifiers with isDefaultOption=true should be pre-selected', () => {
    const input = {
      name: 'Sauce',
      selectionType: 'multiple' as const,
      isRequired: false,
      minSelections: 0,
      defaultBehavior: 'auto_select_defaults' as const,
      modifiers: [
        { name: 'Ketchup', priceAdjustment: 0, isDefaultOption: true },
        { name: 'Mustard', priceAdjustment: 0, isDefaultOption: false },
        { name: 'Mayo', priceAdjustment: 0.50, isDefaultOption: true },
      ],
    };
    const result = createModifierGroupSchema.parse(input);

    expect(result.defaultBehavior).toBe('auto_select_defaults');

    const defaults = result.modifiers.filter((m) => m.isDefaultOption);
    expect(defaults).toHaveLength(2);
    expect(defaults.map((d) => d.name)).toEqual(['Ketchup', 'Mayo']);
  });

  it('none: no auto-selection even when isDefaultOption=true exists', () => {
    const input = {
      name: 'Dressing',
      selectionType: 'single' as const,
      isRequired: false,
      minSelections: 0,
      defaultBehavior: 'none' as const,
      modifiers: [
        { name: 'Ranch', priceAdjustment: 0, isDefaultOption: true },
        { name: 'Vinaigrette', priceAdjustment: 0, isDefaultOption: false },
      ],
    };
    const result = createModifierGroupSchema.parse(input);

    // Schema accepts the data; the POS frontend must respect defaultBehavior='none'
    // and NOT pre-select despite isDefaultOption being true.
    expect(result.defaultBehavior).toBe('none');
    expect(result.modifiers[0]!.isDefaultOption).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Backward compatibility defaults
// ---------------------------------------------------------------------------

describe('backward compatibility — omitted instruction fields', () => {
  it('modifier group without instructionMode defaults to "none"', () => {
    const input = {
      name: 'Size',
      modifiers: [{ name: 'Small', priceAdjustment: 0 }],
    };
    const result = createModifierGroupSchema.parse(input);
    expect(result.instructionMode).toBe('none');
  });

  it('modifier without instruction flags defaults to all true', () => {
    const input = {
      name: 'Add-Ons',
      modifiers: [{ name: 'Bacon', priceAdjustment: 1.50 }],
    };
    const result = createModifierGroupSchema.parse(input);
    const mod = result.modifiers[0]!;
    expect(mod.allowNone).toBe(true);
    expect(mod.allowExtra).toBe(true);
    expect(mod.allowOnSide).toBe(true);
  });

  it('channelVisibility defaults to all four channels', () => {
    const input = {
      name: 'Temp',
      modifiers: [{ name: 'Rare', priceAdjustment: 0 }],
    };
    const result = createModifierGroupSchema.parse(input);
    expect(result.channelVisibility).toEqual(['pos', 'online', 'qr', 'kiosk']);
  });
});
