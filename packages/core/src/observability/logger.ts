/**
 * Structured JSON logger — outputs to stdout for Vercel log drain.
 *
 * Every log line is valid JSON with consistent fields for filtering/alerting.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  tenantId?: string;
  userId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  dbQueryCount?: number;
  dbQueryTimeMs?: number;
  coldStart?: boolean;
  region?: string;
  error?: {
    code?: string;
    message: string;
    stack?: string;
  };
  [key: string]: unknown;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
}

function emit(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export function log(level: LogLevel, message: string, fields?: Partial<LogEntry>): void {
  if (!shouldLog(level)) return;
  emit({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields,
  });
}

export const logger = {
  debug: (message: string, fields?: Partial<LogEntry>) => log('debug', message, fields),
  info: (message: string, fields?: Partial<LogEntry>) => log('info', message, fields),
  warn: (message: string, fields?: Partial<LogEntry>) => log('warn', message, fields),
  error: (message: string, fields?: Partial<LogEntry>) => log('error', message, fields),
};
