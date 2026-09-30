import type { Category } from '../types.js';

interface CategoryMultiSelectProps {
  categories: Category[];
  value: number[];
  onChange: (categoryIds: number[]) => void;
}

/** A checkbox group for selecting zero or more categories to filter by. */
export default function CategoryMultiSelect({ categories, value, onChange }: CategoryMultiSelectProps) {
  function toggle(categoryId: number, checked: boolean) {
    if (checked) {
      if (value.includes(categoryId)) {
        return;
      }
      onChange([...value, categoryId]);
      return;
    }
    onChange(value.filter((id) => id !== categoryId));
  }

  return (
    <fieldset className="category-multi-select">
      <legend>Categories</legend>
      {categories.map((category) => (
        <label key={category.id} className="category-multi-select-option">
          <input
            type="checkbox"
            checked={value.includes(category.id)}
            onChange={(event) => toggle(category.id, event.target.checked)}
          />
          {category.name}
        </label>
      ))}
    </fieldset>
  );
}
