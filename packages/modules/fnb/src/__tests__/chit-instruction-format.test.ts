import { describe, it, expect } from 'vitest';
import { formatModifierForKitchen } from '../helpers/format-modifier-for-kitchen';

describe('formatModifierForKitchen', () => {
  it('returns name as-is when no instruction is provided', () => {
    const result = formatModifierForKitchen({ name: 'Cheddar Cheese' });
    expect(result).toBe('Cheddar Cheese');
  });

  it('returns kitchenLabel as-is when no instruction is provided and kitchenLabel exists', () => {
    const result = formatModifierForKitchen({ name: 'Cheddar Cheese', kitchenLabel: 'CHED' });
    expect(result).toBe('CHED');
  });

  it('returns "NO <LABEL>" for instruction none', () => {
    const result = formatModifierForKitchen({ name: 'Onion', instruction: 'none' });
    expect(result).toBe('NO ONION');
  });

  it('returns "NO <KITCHEN_LABEL>" for instruction none with kitchenLabel', () => {
    const result = formatModifierForKitchen({
      name: 'Gluten Free Bun',
      kitchenLabel: 'GLUTEN',
      instruction: 'none',
    });
    expect(result).toBe('NO GLUTEN');
  });

  it('returns "EXTRA <LABEL> (+$X.XX)" for instruction extra with extraPriceDeltaCents', () => {
    const result = formatModifierForKitchen({
      name: 'Tomato',
      instruction: 'extra',
      extraPriceDeltaCents: 100,
    });
    expect(result).toBe('EXTRA TOMATO (+$1.00)');
  });

  it('falls back to priceAdjustmentCents when extraPriceDeltaCents is absent', () => {
    const result = formatModifierForKitchen({
      name: 'Bacon',
      instruction: 'extra',
      priceAdjustmentCents: 250,
    });
    expect(result).toBe('EXTRA BACON (+$2.50)');
  });

  it('omits price string when extra price is zero', () => {
    const result = formatModifierForKitchen({
      name: 'Lettuce',
      instruction: 'extra',
      extraPriceDeltaCents: 0,
    });
    expect(result).toBe('EXTRA LETTUCE');
  });

  it('returns "<LABEL> ON SIDE" for instruction on_side', () => {
    const result = formatModifierForKitchen({ name: 'Ranch', instruction: 'on_side' });
    expect(result).toBe('RANCH ON SIDE');
  });

  it('returns "<KITCHEN_LABEL> ON SIDE" for instruction on_side with kitchenLabel', () => {
    const result = formatModifierForKitchen({
      name: 'Ranch Dressing',
      kitchenLabel: 'DRESSING',
      instruction: 'on_side',
    });
    expect(result).toBe('DRESSING ON SIDE');
  });

  it('treats null instruction the same as no instruction', () => {
    const result = formatModifierForKitchen({ name: 'Pickles', instruction: null });
    expect(result).toBe('Pickles');
  });

  it('treats undefined instruction the same as no instruction', () => {
    const result = formatModifierForKitchen({ name: 'Mustard', instruction: undefined });
    expect(result).toBe('Mustard');
  });
});
