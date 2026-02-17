export function computeDisplayName(input: {
  type?: string;
  firstName?: string | null;
  lastName?: string | null;
  organizationName?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  if (input.type === 'organization' && input.organizationName) {
    return input.organizationName;
  }

  const parts: string[] = [];
  if (input.firstName) parts.push(input.firstName);
  if (input.lastName) parts.push(input.lastName);
  if (parts.length > 0) return parts.join(' ');

  if (input.email) return input.email;
  if (input.phone) return input.phone;

  return 'Unknown';
}
