export type CategoryKind = 'expense' | 'income';
export type AccountKind = 'checking' | 'credit' | 'cash';

export interface Category {
  id: number;
  name: string;
  color: string;
  kind: CategoryKind;
}

export interface Account {
  id: number;
  name: string;
  kind: AccountKind;
  opening_balance_cents: number;
}

export interface Transaction {
  id: number;
  date: string;
  amount_cents: number;
  payee: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  account_id: number | null;
  note: string | null;
  created_at: string;
}

export interface Summary {
  totalIncome: number;
  totalExpenses: number;
  net: number;
  categoryTotals: Record<string, number>;
}

export interface BudgetStatus {
  category_id: number;
  category_name: string;
  category_color: string;
  month: string;
  limit_cents: number | null;
  amount_spent_cents: number;
}

export type Cadence = 'weekly' | 'monthly' | 'annual';

export interface RecurringSeries {
  payee: string;
  category_id: number | null;
  average_amount_cents: number;
  cadence: Cadence;
  last_seen_date: string;
  next_expected_date: string;
  transaction_ids: number[];
  confidence: number;
}
