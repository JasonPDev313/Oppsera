import { eq, and } from 'drizzle-orm';
import {
  db,
  aiSupportRouteManifests,
  aiSupportActionManifests,
  aiSupportAnswerCards,
} from '@oppsera/db';

export async function loadRouteManifest(route: string) {
  const results = await db
    .select()
    .from(aiSupportRouteManifests)
    .where(eq(aiSupportRouteManifests.route, route))
    .limit(1);
  return results[0] ?? null;
}

export async function loadActionManifests(route: string) {
  return db
    .select()
    .from(aiSupportActionManifests)
    .where(eq(aiSupportActionManifests.route, route));
}

export async function loadActiveAnswerCards(moduleKey?: string, route?: string) {
  const conditions = [eq(aiSupportAnswerCards.status, 'active')];
  if (moduleKey) conditions.push(eq(aiSupportAnswerCards.moduleKey, moduleKey));
  if (route) conditions.push(eq(aiSupportAnswerCards.route, route));

  return db
    .select()
    .from(aiSupportAnswerCards)
    .where(and(...conditions));
}

export async function loadRouteManifestByModule(moduleKey: string) {
  return db
    .select()
    .from(aiSupportRouteManifests)
    .where(eq(aiSupportRouteManifests.moduleKey, moduleKey));
}
