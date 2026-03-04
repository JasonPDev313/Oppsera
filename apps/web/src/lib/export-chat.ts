// ── Chat Export — multi-format export, print, clipboard ─────────
import type { ChatMessage } from '@/hooks/use-semantic-chat';
import { rowsToCsv } from '@/components/semantic/format-utils';

// ── Unified turn type that works for both DB turns and live messages ──

export interface ExportableTurn {
  userMessage: string;
  narrative: string | null;
  wasClarification: boolean;
  clarificationMessage: string | null;
  compiledSql: string | null;
  resultSample: Record<string, unknown>[] | null;
  rowCount: number | null;
  createdAt: string;
}

// ── Convert live ChatMessage[] pairs → ExportableTurn[] ──────────

export function chatMessagesToExportTurns(messages: ChatMessage[]): ExportableTurn[] {
  const turns: ExportableTurn[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    if (msg.role !== 'user') continue;
    const assistant = messages[i + 1];
    if (!assistant || assistant.role !== 'assistant') continue;
    turns.push({
      userMessage: msg.content,
      narrative: assistant.isClarification ? null : assistant.content,
      wasClarification: assistant.isClarification ?? false,
      clarificationMessage: assistant.isClarification ? assistant.content : null,
      compiledSql: assistant.compiledSql ?? null,
      resultSample: assistant.rows ?? null,
      rowCount: assistant.rowCount ?? null,
      createdAt: new Date(msg.timestamp).toISOString(),
    });
  }
  return turns;
}

// ── Helper: file download trigger ────────────────────────────────

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function dateSlug(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function formatDateHeader(iso: string): string {
  return new Date(iso).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function turnTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Plain text export (updated to include table data + SQL) ──────

export function exportSessionAsTxt(
  title: string,
  startedAt: string,
  turns: ExportableTurn[],
): void {
  const lines: string[] = [
    'AI Insights Conversation',
    `Date: ${formatDateHeader(startedAt)}`,
    '---',
    '',
  ];

  for (const turn of turns) {
    const time = turnTime(turn.createdAt);

    lines.push(`[${time}] You:`);
    lines.push(turn.userMessage);
    lines.push('');

    let response: string;
    if (turn.wasClarification) {
      response = turn.clarificationMessage ?? 'Could you clarify your question?';
    } else if (turn.narrative) {
      response = turn.narrative;
    } else {
      response = '(No response generated)';
    }

    lines.push(`[${time}] AI Insights:`);
    lines.push(response);

    // Include table data
    if (turn.resultSample && turn.resultSample.length > 0) {
      lines.push('');
      lines.push(`Data (${turn.rowCount ?? turn.resultSample.length} rows):`);
      lines.push(rowsToCsv(turn.resultSample));
    }

    // Include SQL
    if (turn.compiledSql) {
      lines.push('');
      lines.push('SQL:');
      lines.push(turn.compiledSql);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  downloadFile(lines.join('\n'), `ai-insights-${dateSlug(startedAt)}.txt`, 'text/plain');
}

// ── Markdown export ──────────────────────────────────────────────

function buildMarkdownTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]!);
  const header = '| ' + cols.map((c) => c.replace(/_/g, ' ')).join(' | ') + ' |';
  const sep = '| ' + cols.map(() => '---').join(' | ') + ' |';
  const body = rows.map(
    (row) => '| ' + cols.map((c) => {
      const v = row[c];
      if (v === null || v === undefined) return '';
      return String(v).replace(/\|/g, '\\|');
    }).join(' | ') + ' |',
  ).join('\n');
  return [header, sep, body].join('\n');
}

export function buildSessionMarkdown(
  title: string,
  startedAt: string,
  turns: ExportableTurn[],
): string {
  const lines: string[] = [
    `# ${title}`,
    '',
    `*${formatDateHeader(startedAt)}*`,
    '',
    '---',
    '',
  ];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]!;
    const time = turnTime(turn.createdAt);

    lines.push(`## Turn ${i + 1}`);
    lines.push('');
    lines.push(`**You** *(${time})*: ${turn.userMessage}`);
    lines.push('');

    if (turn.wasClarification) {
      lines.push(`**AI Insights**: ${turn.clarificationMessage ?? 'Could you clarify your question?'}`);
    } else if (turn.narrative) {
      lines.push(`**AI Insights**:`);
      lines.push('');
      lines.push(turn.narrative);
    } else {
      lines.push('**AI Insights**: *(No response generated)*');
    }

    if (turn.resultSample && turn.resultSample.length > 0) {
      lines.push('');
      lines.push(`*${turn.rowCount ?? turn.resultSample.length} rows returned*`);
      lines.push('');
      lines.push(buildMarkdownTable(turn.resultSample));
    }

    if (turn.compiledSql) {
      lines.push('');
      lines.push('<details><summary>SQL Query</summary>');
      lines.push('');
      lines.push('```sql');
      lines.push(turn.compiledSql);
      lines.push('```');
      lines.push('');
      lines.push('</details>');
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function exportSessionAsMarkdown(
  title: string,
  startedAt: string,
  turns: ExportableTurn[],
): void {
  const md = buildSessionMarkdown(title, startedAt, turns);
  downloadFile(md, `ai-insights-${dateSlug(startedAt)}.md`, 'text/markdown');
}

// ── HTML export (self-contained, dark theme, print-friendly) ─────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtmlTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]!);
  const header = cols.map((c) => `<th>${escapeHtml(c.replace(/_/g, ' '))}</th>`).join('');
  const body = rows.map(
    (row) => '<tr>' + cols.map((c) => {
      const v = row[c];
      return `<td>${v === null || v === undefined ? '' : escapeHtml(String(v))}</td>`;
    }).join('') + '</tr>',
  ).join('\n');
  return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function buildSessionHtml(
  title: string,
  startedAt: string,
  turns: ExportableTurn[],
): string {
  const turnsHtml = turns.map((turn, i) => {
    const time = turnTime(turn.createdAt);
    let responseHtml: string;
    if (turn.wasClarification) {
      responseHtml = `<p>${escapeHtml(turn.clarificationMessage ?? 'Could you clarify your question?')}</p>`;
    } else if (turn.narrative) {
      // Preserve line breaks and basic markdown bold
      responseHtml = turn.narrative
        .split('\n')
        .map((line) => {
          let escaped = escapeHtml(line);
          escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
          return escaped;
        })
        .map((line) => line.trim() === '' ? '<br>' : `<p>${line}</p>`)
        .join('\n');
    } else {
      responseHtml = '<p class="empty"><em>No response generated</em></p>';
    }

    let tableHtml = '';
    if (turn.resultSample && turn.resultSample.length > 0) {
      tableHtml = `<div class="data-section"><p class="row-count">${turn.rowCount ?? turn.resultSample.length} rows</p>${buildHtmlTable(turn.resultSample)}</div>`;
    }

    let sqlHtml = '';
    if (turn.compiledSql) {
      sqlHtml = `<details><summary>SQL Query</summary><pre><code>${escapeHtml(turn.compiledSql)}</code></pre></details>`;
    }

    return `
      <div class="turn">
        <div class="turn-header">Turn ${i + 1}</div>
        <div class="user-msg"><span class="label">You</span> <span class="time">${escapeHtml(time)}</span><p>${escapeHtml(turn.userMessage)}</p></div>
        <div class="ai-msg"><span class="label">AI Insights</span>${responseHtml}${tableHtml}${sqlHtml}</div>
      </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — AI Insights</title>
<style>
  :root { --bg: #0a0a0a; --card: #141414; --border: #262626; --fg: #ededed; --muted: #888; --primary: #6366f1; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--fg); padding: 2rem; max-width: 900px; margin: 0 auto; font-size: 14px; line-height: 1.6; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .date { color: var(--muted); font-size: 0.85rem; margin-bottom: 2rem; }
  .turn { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
  .turn-header { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 0.75rem; }
  .label { font-weight: 600; color: var(--primary); }
  .time { color: var(--muted); font-size: 0.75rem; margin-left: 0.5rem; }
  .user-msg { margin-bottom: 1rem; }
  .user-msg p, .ai-msg p { margin: 0.3rem 0; }
  .empty { color: var(--muted); }
  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-top: 0.5rem; }
  th, td { padding: 0.4rem 0.75rem; border: 1px solid var(--border); text-align: left; }
  th { background: #1a1a1a; font-weight: 600; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.03em; color: var(--muted); }
  tr:nth-child(even) { background: rgba(255,255,255,0.02); }
  .row-count { font-size: 0.75rem; color: var(--muted); margin: 0.75rem 0 0.25rem; }
  details { margin-top: 0.75rem; }
  summary { cursor: pointer; font-size: 0.8rem; color: var(--muted); }
  pre { background: #1a1a1a; padding: 0.75rem; border-radius: 6px; overflow-x: auto; margin-top: 0.5rem; }
  code { font-family: 'SF Mono', Menlo, monospace; font-size: 0.8rem; }
  @media print {
    :root { --bg: #fff; --card: #fff; --border: #ddd; --fg: #111; --muted: #666; --primary: #4338ca; }
    body { padding: 0; }
    .turn { break-inside: avoid; border: 1px solid #ddd; }
    th { background: #f5f5f5; }
    pre { background: #f5f5f5; }
  }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="date">${escapeHtml(formatDateHeader(startedAt))}</div>
${turnsHtml}
</body>
</html>`;
}

export function exportSessionAsHtml(
  title: string,
  startedAt: string,
  turns: ExportableTurn[],
): void {
  const html = buildSessionHtml(title, startedAt, turns);
  downloadFile(html, `ai-insights-${dateSlug(startedAt)}.html`, 'text/html');
}

// ── Print session ────────────────────────────────────────────────

export function printSession(
  title: string,
  startedAt: string,
  turns: ExportableTurn[],
): void {
  const html = buildSessionHtml(title, startedAt, turns);
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  // Wait for content to render before triggering print
  win.onload = () => win.print();
}

// ── Copy session to clipboard (Markdown) ─────────────────────────

export async function copySessionToClipboard(
  title: string,
  startedAt: string,
  turns: ExportableTurn[],
): Promise<void> {
  const md = buildSessionMarkdown(title, startedAt, turns);
  await navigator.clipboard.writeText(md);
}
