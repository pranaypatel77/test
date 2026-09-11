import type { Category } from '../types.js';

interface CategorySelectProps {
  categories: Category[];
  value: number | null;
  onChange: (categoryId: number | null) => void;
  id?: string;
}

/** A `<select>` populated with categories, plus a "No category" option. */
export default function CategorySelect({ categories, value, onChange, id }: CategorySelectProps) {
  return (
    <select
      id={id}
      value={value === null ? '' : String(value)}
      onChange={(event) => {
        const raw = event.target.value;
        onChange(raw === '' ? null : Number(raw));
      }}
    >
      <option value="">No category</option>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </select>
  );
}
