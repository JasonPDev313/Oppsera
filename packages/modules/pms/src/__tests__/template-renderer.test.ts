import { describe, it, expect } from 'vitest';
import { renderTemplate, buildReservationTemplateData } from '../helpers/template-renderer';

describe('renderTemplate', () => {
  it('replaces simple placeholders', () => {
    expect(renderTemplate('Hello {{name}}!', { name: 'John' })).toBe('Hello John!');
  });

  it('replaces nested placeholders', () => {
    const data = { guest: { firstName: 'Jane' } };
    expect(renderTemplate('Hi {{guest.firstName}}', data)).toBe('Hi Jane');
  });

  it('replaces deeply nested placeholders', () => {
    const data = { a: { b: { c: 'deep' } } };
    expect(renderTemplate('Value: {{a.b.c}}', data)).toBe('Value: deep');
  });

  it('replaces missing values with empty string', () => {
    expect(renderTemplate('Hi {{name}}!', {})).toBe('Hi !');
  });

  it('replaces null values with empty string', () => {
    expect(renderTemplate('Hi {{name}}!', { name: null })).toBe('Hi !');
  });

  it('handles multiple placeholders', () => {
    const data = { first: 'A', second: 'B' };
    expect(renderTemplate('{{first}} and {{second}}', data)).toBe('A and B');
  });

  it('handles whitespace in keys', () => {
    const data = { name: 'Test' };
    expect(renderTemplate('{{ name }}', data)).toBe('Test');
  });

  it('converts numbers to string', () => {
    expect(renderTemplate('Count: {{n}}', { n: 42 })).toBe('Count: 42');
  });

  it('returns template unchanged when no placeholders', () => {
    expect(renderTemplate('No placeholders here', {})).toBe('No placeholders here');
  });

  it('handles empty template', () => {
    expect(renderTemplate('', { name: 'test' })).toBe('');
  });
});

describe('buildReservationTemplateData', () => {
  const reservation = {
    confirmationNumber: 'CNF-123',
    checkInDate: '2026-03-15',
    checkOutDate: '2026-03-18',
    roomTypeName: 'Deluxe King',
    roomNumber: '301',
    totalCents: 45000,
  };

  const guest = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '+1234567890',
  };

  const property = {
    name: 'Grand Hotel',
    checkInTime: '15:00',
    checkOutTime: '11:00',
  };

  it('builds complete template data', () => {
    const data = buildReservationTemplateData(reservation, guest, property);

    expect(data.guest).toEqual({
      firstName: 'John',
      lastName: 'Doe',
      fullName: 'John Doe',
      email: 'john@example.com',
      phone: '+1234567890',
    });

    expect(data.reservation).toEqual({
      confirmationNumber: 'CNF-123',
      checkInDate: '2026-03-15',
      checkOutDate: '2026-03-18',
      roomType: 'Deluxe King',
      roomNumber: '301',
      total: '$450.00',
    });

    expect(data.property).toEqual({
      name: 'Grand Hotel',
      checkInTime: '15:00',
      checkOutTime: '11:00',
    });
  });

  it('handles missing optional fields', () => {
    const minRes = { checkInDate: '2026-03-15', checkOutDate: '2026-03-18' };
    const minGuest = {};
    const minProp = { name: 'Hotel' };

    const data = buildReservationTemplateData(minRes, minGuest, minProp);

    expect((data.guest as Record<string, unknown>).firstName).toBe('');
    expect((data.guest as Record<string, unknown>).fullName).toBe('');
    expect((data.reservation as Record<string, unknown>).confirmationNumber).toBe('');
    expect((data.reservation as Record<string, unknown>).total).toBe('');
    expect((data.property as Record<string, unknown>).checkInTime).toBe('15:00'); // default
    expect((data.property as Record<string, unknown>).checkOutTime).toBe('11:00'); // default
  });

  it('formats total from cents to dollars', () => {
    const data = buildReservationTemplateData(
      { ...reservation, totalCents: 12345 },
      guest,
      property,
    );
    expect((data.reservation as Record<string, unknown>).total).toBe('$123.45');
  });

  it('full name only includes first when last is missing', () => {
    const data = buildReservationTemplateData(
      reservation,
      { firstName: 'Jane' },
      property,
    );
    expect((data.guest as Record<string, unknown>).fullName).toBe('Jane');
  });

  it('integrates with renderTemplate', () => {
    const data = buildReservationTemplateData(reservation, guest, property);
    const template = 'Dear {{guest.fullName}}, your reservation {{reservation.confirmationNumber}} at {{property.name}} is confirmed for {{reservation.checkInDate}}.';
    const rendered = renderTemplate(template, data);
    expect(rendered).toBe('Dear John Doe, your reservation CNF-123 at Grand Hotel is confirmed for 2026-03-15.');
  });
});
