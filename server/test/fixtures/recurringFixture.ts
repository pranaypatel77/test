import type { RecurringTransactionRow } from '../../src/recurring.js';

/** Deterministic pseudo-random number generator (mulberry32) for reproducible fixtures. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface SeriesSpec {
  payeeVariants: string[];
  baseAmountCents: number;
  amountJitterFraction: number;
  cadenceDays: number;
  cadenceJitter: number;
  occurrences: number;
  startDate: string;
  categoryId: number | null;
}

export interface RecurringFixture {
  transactions: RecurringTransactionRow[];
  /** ids of transactions that are hand-labelled as part of a recurring series. */
  recurringIds: Set<number>;
}

/**
 * Builds a deterministic fixture of ~200 transactions: several genuinely
 * recurring series (varying cadence, amount jitter, and payee formatting
 * including trailing store codes) plus a larger set of one-off and
 * near-miss "trap" transactions that a good detector should NOT flag as
 * recurring (irregular intervals, too few occurrences, or wildly varying
 * amounts). Returns the transactions alongside a hand-labelled set of
 * transaction ids that are truly recurring, for precision/recall scoring.
 */
export function buildRecurringFixture(): RecurringFixture {
  const random = mulberry32(42);
  let nextId = 1;
  const transactions: RecurringTransactionRow[] = [];
  const recurringIds = new Set<number>();

  const recurringSpecs: SeriesSpec[] = [
    {
      payeeVariants: ['Netflix.com'],
      baseAmountCents: -1599,
      amountJitterFraction: 0,
      cadenceDays: 30,
      cadenceJitter: 2,
      occurrences: 14,
      startDate: '2023-01-05',
      categoryId: 4,
    },
    {
      payeeVariants: ['City Power & Light'],
      baseAmountCents: -8500,
      amountJitterFraction: 0.08,
      cadenceDays: 30,
      cadenceJitter: 4,
      occurrences: 13,
      startDate: '2023-01-10',
      categoryId: 3,
    },
    {
      payeeVariants: ['Landlord Rent'],
      baseAmountCents: -145000,
      amountJitterFraction: 0,
      cadenceDays: 30,
      cadenceJitter: 1,
      occurrences: 14,
      startDate: '2023-01-01',
      categoryId: 2,
    },
    {
      payeeVariants: ['Gym Fitness Club'],
      baseAmountCents: -4500,
      amountJitterFraction: 0,
      cadenceDays: 30,
      cadenceJitter: 3,
      occurrences: 11,
      startDate: '2023-02-01',
      categoryId: null,
    },
    {
      payeeVariants: ['Spotify Premium'],
      baseAmountCents: -999,
      amountJitterFraction: 0,
      cadenceDays: 30,
      cadenceJitter: 2,
      occurrences: 14,
      startDate: '2023-01-15',
      categoryId: 4,
    },
    {
      payeeVariants: ['Farmers Market Stall'],
      baseAmountCents: -2500,
      amountJitterFraction: 0.15,
      cadenceDays: 7,
      cadenceJitter: 1,
      occurrences: 20,
      startDate: '2023-03-01',
      categoryId: 1,
    },
    {
      // Trailing store codes that normalizePayee must strip in order to
      // group these into a single series.
      payeeVariants: ['Costco Whse #1234', 'Costco Whse #5678', 'Costco Whse #9012'],
      baseAmountCents: -9800,
      amountJitterFraction: 0.05,
      cadenceDays: 30,
      cadenceJitter: 4,
      occurrences: 12,
      startDate: '2023-01-20',
      categoryId: 1,
    },
    {
      // Boundary case: exactly the minimum occurrence count, annual cadence.
      payeeVariants: ['Domain Registrar Renewal'],
      baseAmountCents: -1200,
      amountJitterFraction: 0,
      cadenceDays: 365,
      cadenceJitter: 5,
      occurrences: 3,
      startDate: '2021-06-01',
      categoryId: null,
    },
  ];

  for (const spec of recurringSpecs) {
    let date = spec.startDate;
    for (let i = 0; i < spec.occurrences; i += 1) {
      const jitterDays = Math.round((random() * 2 - 1) * spec.cadenceJitter);
      const amountJitter = 1 + (random() * 2 - 1) * spec.amountJitterFraction;
      const amount = Math.round(spec.baseAmountCents * amountJitter);
      const payee = spec.payeeVariants[i % spec.payeeVariants.length];

      const id = nextId;
      nextId += 1;
      transactions.push({
        id,
        date,
        amount_cents: amount,
        payee,
        category_id: spec.categoryId,
      });
      recurringIds.add(id);

      date = addDays(date, spec.cadenceDays + jitterDays);
    }
  }

  // --- Traps: series that must NOT be detected as recurring. ---

  // Same payee, correct amount, but irregular (non-cadence) intervals.
  {
    const payee = 'Irregular Hardware Store';
    const dates = ['2023-01-03', '2023-01-19', '2023-03-22', '2023-04-02', '2023-09-14'];
    for (const date of dates) {
      const id = nextId;
      nextId += 1;
      transactions.push({ id, date, amount_cents: -3200, payee, category_id: null });
    }
  }

  // Same payee, monthly cadence, but amount varies far outside tolerance.
  {
    const payee = 'Variable Amount Vendor';
    let date = '2023-02-01';
    const amounts = [-1000, -4000, -1200, -6000];
    for (const amount of amounts) {
      const id = nextId;
      nextId += 1;
      transactions.push({ id, date, amount_cents: amount, payee, category_id: null });
      date = addDays(date, 30);
    }
  }

  // Only two occurrences at a monthly cadence: below the minimum of three.
  {
    const payee = 'Two Time Subscription';
    const id1 = nextId;
    nextId += 1;
    transactions.push({ id: id1, date: '2023-05-01', amount_cents: -2000, payee, category_id: null });
    const id2 = nextId;
    nextId += 1;
    transactions.push({ id: id2, date: '2023-05-31', amount_cents: -2000, payee, category_id: null });
  }

  // A large batch of one-off, unrelated purchases spread across ~2 years,
  // each with a unique payee, so none of them can accidentally form a
  // group of 3+.
  const oneOffPayees = [
    'Coffee Corner', 'Bookshop Downtown', 'Hardware Depot', 'Local Diner', 'Movie Theater',
    'Bike Repair Shop', 'Pet Supplies Co', 'Furniture Outlet', 'Electronics World', 'Bakery Fresh',
    'Taxi Ride', 'Museum Gift Shop', 'Garden Center', 'Shoe Store', 'Toy Emporium',
    'Art Supplies', 'Auto Parts Plus', 'Sporting Goods', 'Music Store', 'Candle Shop',
    'Stationery Nook', 'Antique Mall', 'Craft Fair', 'Farm Stand', 'Bowling Alley',
    'Ice Cream Parlor', 'Record Store', 'Camera Shop', 'Jewelry Boutique', 'Thrift Store',
    'Plant Nursery', 'Comic Book Shop', 'Bicycle Cafe', 'Paint Supply', 'Fishing Tackle',
    'Board Game Store', 'Kitchenware Shop', 'Pottery Studio', 'Yarn Shop', 'Cheese Shop',
    'Wine Cellar', 'Spice Market', 'Herbal Remedies', 'Tailor Shop', 'Cobbler',
    'Locksmith', 'Print Shop', 'Photo Lab', 'Tattoo Parlor', 'Barber Shop',
    'Nail Salon', 'Dry Cleaner', 'Car Wash', 'Gas Station Stop', 'Vending Machine',
    'Food Truck', 'Street Vendor', 'Pop Up Shop', 'Flea Market Stall', 'Garage Sale',
    'Charity Shop', 'Souvenir Stand', 'Airport Kiosk', 'Train Station Cafe', 'Ferry Terminal Shop',
  ];

  let noiseDate = '2023-01-02';
  for (let i = 0; i < oneOffPayees.length; i += 1) {
    const id = nextId;
    nextId += 1;
    const amount = -(500 + Math.round(random() * 9500));
    transactions.push({ id, date: noiseDate, amount_cents: amount, payee: oneOffPayees[i], category_id: null });
    noiseDate = addDays(noiseDate, 3 + Math.round(random() * 9));
  }

  // Fill remaining slots (to reach ~200 total) with more one-off noise
  // transactions reusing payees from the list above but shuffled dates,
  // still never repeating a payee 3+ times at a consistent cadence.
  let fillerDate = '2023-01-04';
  while (transactions.length < 200) {
    const id = nextId;
    nextId += 1;
    const payee = `${oneOffPayees[nextId % oneOffPayees.length]} Extra`;
    const amount = -(300 + Math.round(random() * 7000));
    transactions.push({ id, date: fillerDate, amount_cents: amount, payee, category_id: null });
    fillerDate = addDays(fillerDate, 2 + Math.round(random() * 6));
  }

  return { transactions, recurringIds };
}
