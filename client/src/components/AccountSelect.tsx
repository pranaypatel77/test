import type { Account } from '../types.js';

interface AccountSelectProps {
  accounts: Account[];
  value: number | null;
  onChange: (accountId: number | null) => void;
  id?: string;
  allLabel?: string;
}

/**
 * A `<select>` populated with accounts, plus an "All accounts" option
 * (represented as `null`).
 */
export default function AccountSelect({
  accounts,
  value,
  onChange,
  id,
  allLabel = 'All accounts',
}: AccountSelectProps) {
  return (
    <select
      id={id}
      value={value === null ? '' : String(value)}
      onChange={(event) => {
        const raw = event.target.value;
        onChange(raw === '' ? null : Number(raw));
      }}
    >
      <option value="">{allLabel}</option>
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          {account.name}
        </option>
      ))}
    </select>
  );
}
