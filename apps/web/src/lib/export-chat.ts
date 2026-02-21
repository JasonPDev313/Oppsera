// ── Chat Export — .txt file download ────────────────────────────

interface ExportTurn {
  userMessage: string;
  narrative: string | null;
  wasClarification: boolean;
  clarificationMessage: string | null;
  createdAt: string;
}

export function exportSessionAsTxt(
  title: string,
  startedAt: string,
  turns: ExportTurn[],
): void {
  const dateStr = new Date(startedAt).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const lines: string[] = [
    'AI Insights Conversation',
    `Date: ${dateStr}`,
    '---',
    '',
  ];

  for (const turn of turns) {
    const time = new Date(turn.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

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
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const text = lines.join('\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const dateSlug = new Date(startedAt).toISOString().slice(0, 10);
  const filename = `ai-insights-${dateSlug}.txt`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
