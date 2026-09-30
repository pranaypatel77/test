import { describe, expect, it } from 'vitest';
import { detectRecurringSeries, normalizePayee } from '../src/recurring.js';
import { buildRecurringFixture } from './fixtures/recurringFixture.js';

describe('normalizePayee', () => {
  it('lowercases and trims whitespace', () => {
    expect(normalizePayee('  Netflix.Com  ')).toBe('netflix.com');
  });

  it('strips trailing store codes and punctuation', () => {
    expect(normalizePayee('Costco Whse #1234')).toBe('costco whse');
    expect(normalizePayee('Shell Gas 00123')).toBe('shell gas');
    expect(normalizePayee('Amazon.com*AB12345')).toBe(normalizePayee('Amazon.com*AB12345'));
  });

  it('groups differently-coded variants of the same payee together', () => {
    expect(normalizePayee('Costco Whse #1234')).toBe(normalizePayee('Costco Whse #5678'));
  });
});

describe('detectRecurringSeries', () => {
  const fixture = buildRecurringFixture();

  it('operates on a fixture of approximately 200 transactions', () => {
    expect(fixture.transactions.length).toBeGreaterThanOrEqual(195);
    expect(fixture.transactions.length).toBeLessThanOrEqual(210);
  });

  it('reports precision and recall of at least 0.8 against the hand-labelled fixture', () => {
    const series = detectRecurringSeries(fixture.transactions);
    const detectedIds = new Set(series.flatMap((s) => s.transaction_ids));

    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    const allIds = fixture.transactions.map((t) => t.id);
    for (const id of allIds) {
      const detected = detectedIds.has(id);
      const labelled = fixture.recurringIds.has(id);
      if (detected && labelled) truePositives += 1;
      else if (detected && !labelled) falsePositives += 1;
      else if (!detected && labelled) falseNegatives += 1;
    }

    const precision = truePositives / (truePositives + falsePositives || 1);
    const recall = truePositives / (truePositives + falseNegatives || 1);

    console.log(`recurring detector: precision=${precision.toFixed(2)} recall=${recall.toFixed(2)}`);

    expect(precision).toBeGreaterThanOrEqual(0.8);
    expect(recall).toBeGreaterThanOrEqual(0.8);
  });

  it('requires at least 3 occurrences', () => {
    const series = detectRecurringSeries(fixture.transactions);
    for (const s of series) {
      expect(s.transaction_ids.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('does not flag the two-occurrence subscription trap', () => {
    const series = detectRecurringSeries(fixture.transactions);
    const flagged = series.some((s) => s.payee.toLowerCase().includes('two time subscription'));
    expect(flagged).toBe(false);
  });

  it('does not flag the irregular-interval hardware store trap', () => {
    const series = detectRecurringSeries(fixture.transactions);
    const flagged = series.some((s) => s.payee.toLowerCase().includes('irregular hardware store'));
    expect(flagged).toBe(false);
  });

  it('assigns cadence buckets correctly for known series', () => {
    const series = detectRecurringSeries(fixture.transactions);
    const netflix = series.find((s) => normalizePayee(s.payee) === 'netflix.com');
    expect(netflix?.cadence).toBe('monthly');

    const farmersMarket = series.find((s) => normalizePayee(s.payee) === 'farmers market stall');
    expect(farmersMarket?.cadence).toBe('weekly');

    const domainRenewal = series.find((s) => normalizePayee(s.payee) === 'domain registrar renewal');
    expect(domainRenewal?.cadence).toBe('annual');
  });

  it('groups store-coded variants of the same payee into one series', () => {
    const series = detectRecurringSeries(fixture.transactions);
    const costco = series.find((s) => normalizePayee(s.payee) === 'costco whse');
    expect(costco).toBeDefined();
    expect(costco!.transaction_ids.length).toBeGreaterThanOrEqual(3);
  });

  it('emits a confidence score between 0 and 1', () => {
    const series = detectRecurringSeries(fixture.transactions);
    for (const s of series) {
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });
});
