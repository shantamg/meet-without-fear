import type { SessionCost } from '../types/costs';

export function exportSessionCostsToCSV(sessions: SessionCost[]): void {
  const headers = ['Session', 'Turns', 'Sonnet Cost', 'Haiku Cost', 'Titan Cost', 'Total Cost'];
  const rows = sessions.map(s => [
    s.participants,
    s.turns.toString(),
    `$${s.sonnetCost.toFixed(6)}`,
    `$${s.haikuCost.toFixed(6)}`,
    `$${s.titanCost.toFixed(6)}`,
    `$${s.totalCost.toFixed(6)}`,
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `session-costs-${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
