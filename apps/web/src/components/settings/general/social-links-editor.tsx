'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type { SocialLinks, SocialPlatform } from '@oppsera/shared';

interface PlatformConfig {
  key: SocialPlatform;
  label: string;
  placeholder: string;
  primary: boolean;
}

const PLATFORMS: PlatformConfig[] = [
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourbusiness', primary: true },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourbusiness', primary: true },
  { key: 'x', label: 'X (Twitter)', placeholder: 'https://x.com/yourbusiness', primary: true },
  { key: 'google_business', label: 'Google Business', placeholder: 'https://g.page/yourbusiness', primary: true },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/company/yourbusiness', primary: false },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourbusiness', primary: false },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@yourbusiness', primary: false },
  { key: 'threads', label: 'Threads', placeholder: 'https://threads.net/@yourbusiness', primary: false },
  { key: 'pinterest', label: 'Pinterest', placeholder: 'https://pinterest.com/yourbusiness', primary: false },
  { key: 'snapchat', label: 'Snapchat', placeholder: 'https://snapchat.com/add/yourbusiness', primary: false },
  { key: 'whatsapp', label: 'WhatsApp', placeholder: 'https://wa.me/15551234567', primary: false },
  { key: 'yelp', label: 'Yelp', placeholder: 'https://yelp.com/biz/yourbusiness', primary: false },
  { key: 'tripadvisor', label: 'TripAdvisor', placeholder: 'https://tripadvisor.com/yourbusiness', primary: false },
];

interface SocialLinksEditorProps {
  value: SocialLinks;
  onChange: (links: SocialLinks) => void;
  disabled?: boolean;
}

export function SocialLinksEditor({ value, onChange, disabled = false }: SocialLinksEditorProps) {
  const [showAll, setShowAll] = useState(false);

  const primaryPlatforms = PLATFORMS.filter((p) => p.primary);
  const secondaryPlatforms = PLATFORMS.filter((p) => !p.primary);
  const visiblePlatforms = showAll ? PLATFORMS : primaryPlatforms;

  const linkedCount = Object.values(value).filter((v) => v && v.trim()).length;

  function handleChange(key: SocialPlatform, url: string) {
    onChange({ ...value, [key]: url });
  }

  function normalizeUrl(url: string): string {
    if (!url) return url;
    const trimmed = url.trim();
    if (trimmed && !trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return `https://${trimmed}`;
    }
    return trimmed;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700">Social Media & Listings</h4>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {linkedCount}/{PLATFORMS.length} linked
        </span>
      </div>

      <div className="space-y-1.5">
        {visiblePlatforms.map((platform) => (
          <div key={platform.key} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-sm text-gray-600">{platform.label}</span>
            <div className="relative flex-1">
              <input
                type="url"
                value={(value[platform.key] as string) ?? ''}
                onChange={(e) => handleChange(platform.key, e.target.value)}
                onBlur={(e) => {
                  if (e.target.value) {
                    handleChange(platform.key, normalizeUrl(e.target.value));
                  }
                }}
                placeholder={platform.placeholder}
                disabled={disabled}
                className="w-full rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm placeholder:text-gray-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
              />
              {value[platform.key] && (
                <a
                  href={value[platform.key]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {secondaryPlatforms.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
        >
          {showAll ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {showAll ? 'Show fewer platforms' : `Show all platforms (${secondaryPlatforms.length} more)`}
        </button>
      )}
    </div>
  );
}
