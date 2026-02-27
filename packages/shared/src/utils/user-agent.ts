/**
 * Lightweight user-agent parser — no external dependency.
 * Extracts browser name/version and OS from raw UA string.
 */

export interface ParsedUserAgent {
  browser: string;
  os: string;
}

const BROWSER_PATTERNS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/Chrome\/(\d+)/, 'Chrome'],
  [/Firefox\/(\d+)/, 'Firefox'],
  [/Version\/(\d+).*Safari/, 'Safari'],
  [/MSIE (\d+)/, 'IE'],
  [/Trident.*rv:(\d+)/, 'IE'],
];

const OS_PATTERNS: [RegExp, string][] = [
  [/Windows NT 10/, 'Windows'],
  [/Windows NT 6\.3/, 'Windows 8.1'],
  [/Windows NT 6\.1/, 'Windows 7'],
  [/Mac OS X/, 'macOS'],
  [/Android (\d+)/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Linux/, 'Linux'],
  [/CrOS/, 'ChromeOS'],
];

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) return { browser: 'Unknown', os: 'Unknown' };

  let browser = 'Unknown';
  for (const [re, name] of BROWSER_PATTERNS) {
    const m = re.exec(ua);
    if (m) {
      browser = m[1] ? `${name} ${m[1]}` : name;
      break;
    }
  }

  let os = 'Unknown';
  for (const [re, name] of OS_PATTERNS) {
    if (re.test(ua)) {
      os = name;
      break;
    }
  }

  return { browser, os };
}
