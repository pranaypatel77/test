interface CategoryChipProps {
  name: string;
  color: string;
}

/** A small colored pill showing a category's name, tinted with its color. */
export default function CategoryChip({ name, color }: CategoryChipProps) {
  return (
    <span className="category-chip" style={{ backgroundColor: color }}>
      {name}
    </span>
  );
}
