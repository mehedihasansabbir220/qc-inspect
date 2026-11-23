/**
 * AQL sampling plans — ISO 2859-1 (ANSI/ASQ Z1.4), single sampling, normal inspection.
 *
 * The master table is diagonal: moving one AQL step left is the same as moving one
 * code-letter row up. So instead of hard-coding ~250 cells, we encode one column's
 * sequence and the row where each AQL reaches Ac=0. Arrows (↓ / ↑) are resolved the
 * way the standard prescribes: use the first sampling plan below / above the arrow,
 * including that plan's sample size.
 */

export type InspectionLevel = 'I' | 'II' | 'III';
export const AQL_VALUES = ['0.65', '1.0', '1.5', '2.5', '4.0', '6.5'] as const;
export type AqlValue = (typeof AQL_VALUES)[number];

export interface AcRe {
  ac: number; // accept if defects <= ac
  re: number; // reject if defects >= re
}

export interface ClassPlan extends AcRe {
  sampleSize: number;
  codeLetter: string;
}

export interface SamplingPlan {
  lotSize: number;
  level: InspectionLevel;
  codeLetter: string;
  /** Pieces to inspect: the largest sample required by any defect class, capped at lot size. */
  sampleSize: number;
  critical: AcRe;
  major: AcRe & { aql: AqlValue };
  minor: AcRe & { aql: AqlValue };
  /** True when the sample size equals the whole lot (100% inspection). */
  fullInspection: boolean;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R'] as const;
const SAMPLE_SIZES = [2, 3, 5, 8, 13, 20, 32, 50, 80, 125, 200, 315, 500, 800, 1250, 2000];

/** Upper bound of each lot-size band (table 1). */
const LOT_BANDS = [8, 15, 25, 50, 90, 150, 280, 500, 1200, 3200, 10000, 35000, 150000, 500000, Infinity];

/** Code letter index per lot band, per general inspection level (table 1). */
const LEVEL_LETTERS: Record<InspectionLevel, number[]> = {
  //   2-8 9-15 16-25 26-50 51-90 91-150 151-280 281-500 501-1.2k 1.2k-3.2k 3.2k-10k 10k-35k 35k-150k 150k-500k 500k+
  I: [0, 0, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  II: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  III: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
};

/** Row (letter index) at which each AQL column has its Ac=0 Re=1 cell. */
const ZERO_ROW: Record<AqlValue, number> = {
  '6.5': 0,
  '4.0': 1,
  '2.5': 2,
  '1.5': 3,
  '1.0': 4,
  '0.65': 5,
};

type Cell = AcRe | 'up' | 'down';
/** Sequence down any AQL column, starting at its Ac=0 row. */
const COLUMN: Cell[] = [
  { ac: 0, re: 1 },
  'up',
  'down',
  { ac: 1, re: 2 },
  { ac: 2, re: 3 },
  { ac: 3, re: 4 },
  { ac: 5, re: 6 },
  { ac: 7, re: 8 },
  { ac: 10, re: 11 },
  { ac: 14, re: 15 },
  { ac: 21, re: 22 },
];

function cell(row: number, aql: AqlValue): Cell {
  const offset = row - ZERO_ROW[aql];
  if (offset < 0) return 'down';
  if (offset >= COLUMN.length) return 'up';
  return COLUMN[offset];
}

export function codeLetterFor(lotSize: number, level: InspectionLevel): number {
  if (!Number.isFinite(lotSize) || lotSize < 2) throw new RangeError('Lot size must be at least 2');
  const band = LOT_BANDS.findIndex((max) => lotSize <= max);
  return LEVEL_LETTERS[level][band];
}

/** Resolve the plan for one AQL starting at a code-letter row, following arrows. */
export function resolveClassPlan(row: number, aql: AqlValue): ClassPlan {
  let r = row;
  for (let guard = 0; guard < LETTERS.length; guard++) {
    const c = cell(r, aql);
    if (c === 'down') r += 1;
    else if (c === 'up') r -= 1;
    else return { ...c, sampleSize: SAMPLE_SIZES[r], codeLetter: LETTERS[r] };
  }
  throw new Error(`Unresolvable AQL cell (row ${row}, AQL ${aql})`);
}

export function samplingPlan(
  lotSize: number,
  level: InspectionLevel = 'II',
  aqlMajor: AqlValue = '2.5',
  aqlMinor: AqlValue = '4.0',
): SamplingPlan {
  const row = codeLetterFor(lotSize, level);
  const major = resolveClassPlan(row, aqlMajor);
  const minor = resolveClassPlan(row, aqlMinor);
  const required = Math.max(major.sampleSize, minor.sampleSize, SAMPLE_SIZES[row]);
  const sampleSize = Math.min(required, lotSize);
  return {
    lotSize,
    level,
    codeLetter: LETTERS[row],
    sampleSize,
    critical: { ac: 0, re: 1 }, // zero tolerance for critical (safety) defects
    major: { ac: major.ac, re: major.re, aql: aqlMajor },
    minor: { ac: minor.ac, re: minor.re, aql: aqlMinor },
    fullInspection: sampleSize >= lotSize,
  };
}
