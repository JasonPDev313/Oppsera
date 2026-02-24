import { z } from 'zod';

export const navItemPreferenceSchema = z.object({
  href: z.string().min(1),
  hidden: z.boolean(),
});

export const updateNavPreferencesSchema = z.object({
  itemOrder: z.array(navItemPreferenceSchema).max(30),
});

export type NavItemPreference = z.infer<typeof navItemPreferenceSchema>;
export type UpdateNavPreferencesInput = z.infer<typeof updateNavPreferencesSchema>;
