// -- Predictive Insights Engine
// Pure computation. No DB, no side effects.

export interface ChurnRiskInput {
  daysSinceLastVisit: number;
  visitTrend: 'increasing' | 'stable' | 'declining';
  spendTrend: 'increasing' | 'stable' | 'declining';
  autopayFailures: number;
  hasHold: boolean;
  hasLateFees: boolean;
  accountAgeDays: number;
}

export interface ChurnRiskFactor { factor: string; points: number; description: string; }

export interface ChurnRiskResult {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  predictedChurnMonth: number | null;
  factors: ChurnRiskFactor[];
}

export function predictChurnRisk(input: ChurnRiskInput): ChurnRiskResult {
  const factors: ChurnRiskFactor[] = [];
  let score = 0;
  if (input.daysSinceLastVisit > 90) { score += 35; factors.push({ factor: 'absence_90_plus', points: 35, description: 'No visit in 90+ days' }); }
  else if (input.daysSinceLastVisit > 60) { score += 20; factors.push({ factor: 'absence_60_90', points: 20, description: 'No visit in 60-90 days' }); }
  else if (input.daysSinceLastVisit > 30) { score += 10; factors.push({ factor: 'absence_30_60', points: 10, description: 'No visit in 30-60 days' }); }
  if (input.visitTrend === 'declining') { score += 15; factors.push({ factor: 'visit_trend_declining', points: 15, description: 'Visit frequency declining' }); }
  if (input.spendTrend === 'declining') { score += 10; factors.push({ factor: 'spend_trend_declining', points: 10, description: 'Spend amount declining' }); }
  if (input.autopayFailures > 0) { const pts = Math.min(input.autopayFailures * 10, 30); score += pts; factors.push({ factor: 'autopay_failures', points: pts, description: input.autopayFailures + ' autopay failure(s)' }); }
  if (input.hasHold) { score += 10; factors.push({ factor: 'has_hold', points: 10, description: 'Account has active hold' }); }
  if (input.hasLateFees) { score += 5; factors.push({ factor: 'has_late_fees', points: 5, description: 'Account has outstanding late fees' }); }
  if (input.accountAgeDays < 90) { score += -10; factors.push({ factor: 'new_account_bonus', points: -10, description: 'New account (< 90 days) - lower churn risk' }); }
  score = Math.max(0, Math.min(100, score));
  let riskLevel: ChurnRiskResult['riskLevel'];
  let predictedChurnMonth: number | null;
  if (score >= 76) { riskLevel = 'critical'; predictedChurnMonth = 1; }
  else if (score >= 51) { riskLevel = 'high'; predictedChurnMonth = 2; }
  else if (score >= 26) { riskLevel = 'medium'; predictedChurnMonth = 4; }
  else { riskLevel = 'low'; predictedChurnMonth = null; }
  return { riskScore: score, riskLevel, predictedChurnMonth, factors };
}

export interface ShortfallProjectionInput { requiredCents: number; spentCents: number; daysElapsed: number; totalDaysInPeriod: number; }
export interface ShortfallProjectionResult { projectedSpendCents: number; shortfallCents: number; dailySpendNeededCents: number; status: 'on_track' | 'shortfall'; }

export function projectShortfall(input: ShortfallProjectionInput): ShortfallProjectionResult {
  const { requiredCents, spentCents, daysElapsed, totalDaysInPeriod } = input;
  const dailyRate = daysElapsed > 0 ? spentCents / daysElapsed : 0;
  const projectedSpendCents = Math.round(dailyRate * totalDaysInPeriod);
  const shortfallCents = Math.max(0, requiredCents - projectedSpendCents);
  const remainingDays = Math.max(0, totalDaysInPeriod - daysElapsed);
  const remainingNeeded = Math.max(0, requiredCents - spentCents);
  const dailySpendNeededCents = remainingDays > 0 ? Math.ceil(remainingNeeded / remainingDays) : remainingNeeded > 0 ? remainingNeeded : 0;
  const status: ShortfallProjectionResult['status'] = projectedSpendCents >= requiredCents ? 'on_track' : 'shortfall';
  return { projectedSpendCents, shortfallCents, dailySpendNeededCents, status };
}

export interface DelinquencyRiskInput { daysPastDue: number; outstandingCents: number; autopayEnabled: boolean; autopayFailures: number; paymentHistoryOnTime: number; paymentHistoryLate: number; }
export interface DelinquencyRiskResult { riskLevel: 'low' | 'medium' | 'high' | 'critical'; riskScore: number; suggestedActions: string[]; }

export function assessDelinquencyRisk(input: DelinquencyRiskInput): DelinquencyRiskResult {
  let score = 0;
  if (input.daysPastDue >= 90) { score += 70; }
  else if (input.daysPastDue >= 61) { score += 50; }
  else if (input.daysPastDue >= 31) { score += 30; }
  else if (input.daysPastDue >= 1) { score += 15; }
  if (!input.autopayEnabled) { score += 10; }
  if (input.autopayFailures > 0) { score += Math.min(input.autopayFailures * 10, 20); }
  const totalPayments = input.paymentHistoryOnTime + input.paymentHistoryLate;
  if (totalPayments > 0 && (input.paymentHistoryLate / totalPayments) > 0.3) { score += 10; }
  score = Math.max(0, Math.min(100, score));
  let riskLevel: DelinquencyRiskResult['riskLevel'];
  if (score >= 76) { riskLevel = 'critical'; }
  else if (score >= 51) { riskLevel = 'high'; }
  else if (score >= 26) { riskLevel = 'medium'; }
  else { riskLevel = 'low'; }
  const suggestedActions: string[] = [];
  if (riskLevel === 'critical') { suggestedActions.push('Escalate to collections', 'Place charging hold', 'Contact member immediately'); }
  else if (riskLevel === 'high') { suggestedActions.push('Send final notice', 'Review autopay configuration', 'Schedule follow-up call'); }
  else if (riskLevel === 'medium') { suggestedActions.push('Send reminder notice', 'Enable autopay if not configured'); }
  else { suggestedActions.push('No action needed'); }
  return { riskLevel, riskScore: score, suggestedActions };
}
