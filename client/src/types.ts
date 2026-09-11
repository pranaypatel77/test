export type CategoryKind = 'expense' | 'income';

export interface Category {
  id: number;
  name: string;
  color: string;
  kind: CategoryKind;
}

export interface Transaction {
  id: number;
  date: string;
  amount_cents: number;
  payee: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  note: string | null;
  created_at: string;
}
