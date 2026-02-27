// ── SEM-10: MCP Resource Definitions ──────────────────────────────
// Exposes semantic registry data as read-only MCP resources.
// Resources use URI-based addressing (semantic://metrics, etc.)
// and return JSON content for external clients.

import type { McpResourceDefinition, McpResourceHandler } from './types';
import { listMetrics, listDimensions, listLenses } from '../registry/registry';
import { listCustomLenses } from '../lenses/queries';

// ── Resource definitions ────────────────────────────────────────

export const SEMANTIC_RESOURCES: McpResourceDefinition[] = [
  {
    uri: 'semantic://metrics',
    name: 'Semantic Metrics',
    description:
      'All available business metrics in the semantic registry — ' +
      'slugs, display names, descriptions, formats, domains, and comparability.',
    mimeType: 'application/json',
  },
  {
    uri: 'semantic://dimensions',
    name: 'Semantic Dimensions',
    description:
      'All available dimensions (grouping/filtering axes) — ' +
      'slugs, display names, data types, and domains.',
    mimeType: 'application/json',
  },
  {
    uri: 'semantic://lenses',
    name: 'Semantic Lenses',
    description:
      'System-defined analysis lenses (scoped views for business domains). ' +
      'Each lens restricts the set of available metrics and dimensions.',
    mimeType: 'application/json',
  },
];

// ── Resource handlers ───────────────────────────────────────────

const resourceHandlers: Record<string, McpResourceHandler> = {
  'semantic://metrics': async (uri) => {
    const metrics = await listMetrics();
    const data = metrics.map((m) => ({
      slug: m.slug,
      displayName: m.displayName,
      description: m.description,
      dataType: m.dataType,
      domain: m.domain,
      higherIsBetter: m.higherIsBetter,
    }));
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
    };
  },

  'semantic://dimensions': async (uri) => {
    const dimensions = await listDimensions();
    const data = dimensions.map((d) => ({
      slug: d.slug,
      displayName: d.displayName,
      sqlDataType: d.sqlDataType,
      isTimeDimension: d.isTimeDimension,
      domain: d.domain,
    }));
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
    };
  },

  'semantic://lenses': async (uri, context) => {
    const systemLenses = await listLenses();
    const systemData = systemLenses.map((l) => ({
      slug: l.slug,
      displayName: l.displayName,
      description: l.description,
      domain: l.domain,
      isSystem: true,
    }));

    // Include tenant-custom lenses if context has tenantId
    if (context.tenantId) {
      const customLenses = await listCustomLenses({ tenantId: context.tenantId });
      const customData = customLenses.map((l) => ({
        slug: l.slug,
        displayName: l.displayName,
        description: l.description,
        domain: l.domain,
        isSystem: false,
      }));
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify([...systemData, ...customData], null, 2),
        }],
      };
    }

    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(systemData, null, 2) }],
    };
  },
};

/** Get the MCP resource handler for a given URI. */
export function getResourceHandler(uri: string): McpResourceHandler | undefined {
  return resourceHandlers[uri];
}

/** Get all registered MCP resource definitions. */
export function getResourceDefinitions(): McpResourceDefinition[] {
  return SEMANTIC_RESOURCES;
}
