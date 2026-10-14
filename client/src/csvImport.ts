/**
 * Pure CSV parsing utility for previewing transaction imports.
 *
 * Expects a header row of `date,amount,description,category` followed by
 * data rows. Does not throw: malformed rows are reported as per-line errors
 * while valid rows are still parsed and returned.
 */

export interface ParsedTransactionRow {
  /** 1-based line number in the original CSV text (header is line 1). */
  line: number;
  date: string;
  amount: number;
  description: string;
  category: string;
}

export interface CsvParseError {
  /** 1-based line number in the original CSV text. */
  line: number;
  message: string;
}

export interface CsvParseResult {
  rows: ParsedTransactionRow[];
  errors: CsvParseError[];
}

const EXPECTED_HEADER = ['date', 'amount', 'description', 'category'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function splitLine(line: string): string[] {
  return line.split(',').map((field) => field.trim());
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Parses CSV text with a `date,amount,description,category` header into
 * typed rows for a preview table, collecting per-line errors (bad date,
 * non-numeric amount, empty description) without throwing.
 */
export function parseTransactionsCsv(text: string): CsvParseResult {
  const rows: ParsedTransactionRow[] = [];
  const errors: CsvParseError[] = [];

  const lines = text.split(/\r\n|\r|\n/).filter((line, index, all) => {
    // Drop a single trailing empty line caused by a final newline, but keep
    // intentional blank lines in the middle of the input.
    return !(index === all.length - 1 && line === '');
  });

  if (lines.length === 0) {
    errors.push({ line: 1, message: 'CSV is empty' });
    return { rows, errors };
  }

  const header = splitLine(lines[0]).map((field) => field.toLowerCase());
  const headerMatches =
    header.length === EXPECTED_HEADER.length &&
    EXPECTED_HEADER.every((name, index) => header[index] === name);

  if (!headerMatches) {
    errors.push({
      line: 1,
      message: `Expected header "${EXPECTED_HEADER.join(',')}"`,
    });
    return { rows, errors };
  }

  for (let index = 1; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const rawLine = lines[index];
    if (rawLine.trim() === '') continue;

    const fields = splitLine(rawLine);
    const [date = '', amountText = '', description = '', category = ''] = fields;

    const lineErrors: string[] = [];

    if (!isValidDate(date)) {
      lineErrors.push(`Invalid date "${date}"`);
    }

    const amount = Number(amountText);
    if (amountText.trim() === '' || Number.isNaN(amount)) {
      lineErrors.push(`Invalid amount "${amountText}"`);
    }

    if (description.trim() === '') {
      lineErrors.push('Description is empty');
    }

    if (lineErrors.length > 0) {
      for (const message of lineErrors) {
        errors.push({ line: lineNumber, message });
      }
      continue;
    }

    rows.push({
      line: lineNumber,
      date,
      amount,
      description,
      category,
    });
  }

  return { rows, errors };
}
