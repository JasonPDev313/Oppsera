'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import BookingContent from '../booking-content';

interface EmbedConfig {
  customCss?: string;
  theme?: string; // hex color
}

export default function EmbedContent() {
  const params = useParams<{ tenantSlug: string }>();
  const tenantSlug = params.tenantSlug;
  const [embedConfig, setEmbedConfig] = useState<EmbedConfig | null>(null);

  // Fetch widget config for custom CSS + theme
  useEffect(() => {
    if (!tenantSlug) return;
    fetch(`/api/v1/spa/public/${tenantSlug}/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data) {
          setEmbedConfig({
            customCss: json.data.customCss ?? undefined,
            theme: json.data.themeColor ?? undefined,
          });
        }
      })
      .catch(() => {
        // Non-fatal — booking still works without custom styling
      });
  }, [tenantSlug]);

  return (
    <div className="min-h-screen" style={{ maxWidth: 480, margin: '0 auto' }}>
      {/* Inject theme color as CSS custom property (validated hex only) */}
      {embedConfig?.theme && /^#[0-9a-fA-F]{3,8}$/.test(embedConfig.theme) && (
        <style
          dangerouslySetInnerHTML={{
            __html: `:root { --embed-theme-color: ${embedConfig.theme}; }`,
          }}
        />
      )}

      {/* Inject custom CSS from widget config (sanitized — strip script injection vectors) */}
      {embedConfig?.customCss && (
        <style dangerouslySetInnerHTML={{
          __html: embedConfig.customCss
            .replace(/<\/?[^>]+(>|$)/g, '')        // strip HTML tags
            .replace(/javascript\s*:/gi, '')        // strip javascript: protocol
            .replace(/expression\s*\(/gi, '')       // strip CSS expression()
            .replace(/@import\b/gi, '')             // strip @import
            .replace(/url\s*\(\s*['"]?\s*data\s*:/gi, 'url(blocked:') // block data: URIs
        }} />
      )}

      <BookingContent isEmbed />
    </div>
  );
}
