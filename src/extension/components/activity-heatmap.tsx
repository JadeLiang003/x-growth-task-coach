import type { DailyRecord } from '../storage/schema';

type HeatmapRange = 'quarter' | 'year';

interface ActivityHeatmapProps {
  records: DailyRecord[];
  range?: HeatmapRange;
  compact?: boolean;
  showWeekdayLabels?: boolean;
  showMonthLabels?: boolean;
  endDate?: Date;
}

interface HeatmapCell {
  date: string;
  completionRate: number;
  inRange: boolean;
  level: 0 | 1 | 2 | 3 | 4;
}

interface HeatmapWeek {
  startDate: string;
  cells: HeatmapCell[];
}

interface HeatmapMonthMarker {
  column: number;
  label: string;
}

export interface HeatmapMonthView {
  cells: HeatmapCell[];
  monthLabel: string;
  stats: HeatmapRangeStats;
}

export interface HeatmapRangeStats {
  completedDays: number;
  averageCompletionRate: number;
  longestStreak: number;
}

export interface HeatmapRangeView {
  weeks: HeatmapWeek[];
  monthMarkers: HeatmapMonthMarker[];
  stats: HeatmapRangeStats;
  startDate: string;
  endDate: string;
}

const RANGE_DAY_COUNT: Record<HeatmapRange, number> = {
  quarter: 90,
  year: 365,
};

const WEEKDAY_LABEL_POSITIONS = [
  { label: 'Mon', row: 0 },
  { label: 'Wed', row: 2 },
  { label: 'Fri', row: 4 },
  { label: 'Sun', row: 6 },
] as const;

function formatDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatShortDate(date: Date) {
  return `${date.getMonth() + 1}月`;
}

function startOfWeekMonday(date: Date) {
  const nextDate = new Date(date);
  const weekdayOffset = (nextDate.getDay() + 6) % 7;
  nextDate.setDate(nextDate.getDate() - weekdayOffset);
  return nextDate;
}

function endOfWeekMonday(date: Date) {
  const nextDate = new Date(date);
  const weekdayOffset = (nextDate.getDay() + 6) % 7;
  nextDate.setDate(nextDate.getDate() + (6 - weekdayOffset));
  return nextDate;
}

function shiftDate(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getHeatLevel(completionRate: number): 0 | 1 | 2 | 3 | 4 {
  if (completionRate >= 1) {
    return 4;
  }

  if (completionRate >= 0.7) {
    return 3;
  }

  if (completionRate >= 0.4) {
    return 2;
  }

  if (completionRate > 0) {
    return 1;
  }

  return 0;
}

function getLevelClass(level: HeatmapCell['level'], inRange: boolean) {
  if (!inRange) {
    return 'bg-[rgba(36,36,36,0.06)]';
  }

  if (level === 4) {
    return 'bg-[#242424]';
  }

  if (level === 3) {
    return 'bg-[#4e4d4d]';
  }

  if (level === 2) {
    return 'bg-[rgba(36,36,36,0.38)]';
  }

  if (level === 1) {
    return 'bg-[rgba(207,218,245,0.95)]';
  }

  return 'bg-[rgba(36,36,36,0.08)]';
}

function buildMonthMarkers(weeks: HeatmapWeek[]) {
  const markers: HeatmapMonthMarker[] = [];
  let previousMonthKey: string | null = null;

  weeks.forEach((week, column) => {
    const rangeCells = week.cells.filter((cell) => cell.inRange);
    if (rangeCells.length === 0) {
      return;
    }

    const firstInRangeCell = rangeCells[0]!;
    const firstDate = new Date(firstInRangeCell.date);
    const monthKey = `${firstDate.getFullYear()}-${firstDate.getMonth()}`;

    if (monthKey !== previousMonthKey) {
      markers.push({
        column,
        label: formatShortDate(firstDate),
      });
      previousMonthKey = monthKey;
    }
  });

  return markers;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function formatHeatmapMonthLabel(monthDate: Date) {
  return `${monthDate.getMonth() + 1}月`;
}

export function getHeatmapMonthView(
  records: DailyRecord[],
  monthDate = new Date(),
): HeatmapMonthView {
  const recordMap = new Map(records.map((record) => [record.date, record.completionRate]));
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const gridStart = startOfWeekMonday(monthStart);
  const gridEnd = endOfWeekMonday(monthEnd);
  const cells: HeatmapCell[] = [];
  const monthCells: HeatmapCell[] = [];

  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = shiftDate(cursor, 1)) {
    const dateKey = formatDateKey(cursor);
    const inCurrentMonth =
      cursor.getFullYear() === monthDate.getFullYear() &&
      cursor.getMonth() === monthDate.getMonth();
    const completionRate = recordMap.get(dateKey) ?? 0;
    const cell: HeatmapCell = {
      date: dateKey,
      completionRate,
      inRange: inCurrentMonth,
      level: getHeatLevel(completionRate),
    };

    cells.push(cell);

    if (inCurrentMonth) {
      monthCells.push(cell);
    }
  }

  let runningStreak = 0;
  let longestStreak = 0;
  let completedDays = 0;
  let completionTotal = 0;

  monthCells.forEach((cell) => {
    completionTotal += cell.completionRate;

    if (cell.completionRate >= 1) {
      completedDays += 1;
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
      return;
    }

    runningStreak = 0;
  });

  return {
    cells,
    monthLabel: formatHeatmapMonthLabel(monthDate),
    stats: {
      completedDays,
      averageCompletionRate:
        monthCells.length > 0 ? Math.round((completionTotal / monthCells.length) * 100) : 0,
      longestStreak,
    },
  };
}

export function getHeatmapRangeView(
  records: DailyRecord[],
  range: HeatmapRange,
  endDate = new Date(),
): HeatmapRangeView {
  const recordMap = new Map(records.map((record) => [record.date, record.completionRate]));
  const normalizedEndDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const rangeDayCount = RANGE_DAY_COUNT[range];
  const rangeStartDate = shiftDate(normalizedEndDate, -(rangeDayCount - 1));
  const gridStart = startOfWeekMonday(rangeStartDate);
  const gridEnd = endOfWeekMonday(normalizedEndDate);
  const weeks: HeatmapWeek[] = [];
  const rangeCells: HeatmapCell[] = [];

  for (
    let weekCursor = new Date(gridStart);
    weekCursor <= gridEnd;
    weekCursor = shiftDate(weekCursor, 7)
  ) {
    const weekCells: HeatmapCell[] = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = shiftDate(weekCursor, dayIndex);
      const dateKey = formatDateKey(date);
      const inRange = date >= rangeStartDate && date <= normalizedEndDate;
      const completionRate = inRange ? (recordMap.get(dateKey) ?? 0) : 0;
      const cell: HeatmapCell = {
        date: dateKey,
        completionRate,
        inRange,
        level: getHeatLevel(completionRate),
      };

      weekCells.push(cell);

      if (inRange) {
        rangeCells.push(cell);
      }
    }

    weeks.push({
      startDate: formatDateKey(weekCursor),
      cells: weekCells,
    });
  }

  let runningStreak = 0;
  let longestStreak = 0;
  let completedDays = 0;
  let completionTotal = 0;

  rangeCells.forEach((cell) => {
    completionTotal += cell.completionRate;

    if (cell.completionRate >= 1) {
      completedDays += 1;
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
      return;
    }

    runningStreak = 0;
  });

  return {
    weeks,
    monthMarkers: buildMonthMarkers(weeks),
    stats: {
      completedDays,
      averageCompletionRate:
        rangeCells.length > 0 ? Math.round((completionTotal / rangeCells.length) * 100) : 0,
      longestStreak,
    },
    startDate: formatDateKey(rangeStartDate),
    endDate: formatDateKey(normalizedEndDate),
  };
}

export function formatHeatmapRangeLabel(range: HeatmapRange) {
  if (range === 'quarter') {
    return '近 90 天';
  }

  return '近 1 年';
}

export function formatHeatmapDateRange(startDate: string, endDate: string) {
  const [startYear, startMonth] = startDate.split('-');
  const [, endMonth] = endDate.split('-');

  if (startYear === endDate.split('-')[0]) {
    return `${Number(startMonth)}月 - ${Number(endMonth)}月`;
  }

  return `${startDate} - ${endDate}`;
}

export function ActivityHeatmap({
  records,
  range = 'quarter',
  compact = false,
  showWeekdayLabels = true,
  showMonthLabels = true,
  endDate = new Date(),
}: ActivityHeatmapProps) {
  const { weeks, monthMarkers } = getHeatmapRangeView(records, range, endDate);
  const weekCount = Math.max(weeks.length, 1);
  const cellClass = compact
    ? 'aspect-square w-full rounded-[2px]'
    : 'aspect-square w-full rounded-[2.5px]';
  const weekColumnGapClass = compact ? 'gap-x-[2px]' : 'gap-x-[4px]';
  const rowGapClass = compact ? 'gap-[2px]' : 'gap-[4px]';
  const monthLabelLeftOffset = showWeekdayLabels ? (compact ? 20 : 28) : 0;

  return (
    <div class="w-full overflow-hidden">
      {showMonthLabels ? (
        <div
          class="mb-2 grid h-4 items-start text-[10px] font-medium text-[#797776]"
          style={{
            gridTemplateColumns: `repeat(${weekCount}, minmax(0, 1fr))`,
            marginLeft: `${monthLabelLeftOffset}px`,
          }}
        >
          {monthMarkers.map((marker) => (
            <span
              class="whitespace-nowrap leading-none"
              key={`${marker.column}-${marker.label}`}
              style={{ gridColumn: `${Math.min(marker.column + 1, weekCount)} / span 2` }}
            >
              {marker.label}
            </span>
          ))}
        </div>
      ) : null}

      <div
        class="grid items-start gap-2"
        style={{ gridTemplateColumns: showWeekdayLabels ? 'auto minmax(0,1fr)' : 'minmax(0,1fr)' }}
      >
        {showWeekdayLabels ? (
          <div class={`mt-[2px] grid shrink-0 grid-rows-7 ${rowGapClass}`}>
            {Array.from({ length: 7 }).map((_, rowIndex) => {
              const labelConfig = WEEKDAY_LABEL_POSITIONS.find((item) => item.row === rowIndex);
              return (
                <span
                  class={`text-right text-[9px] font-medium text-[#797776] ${
                    compact ? 'h-[13px] leading-[13px]' : 'h-[22px] leading-[22px]'
                  }`}
                  key={`weekday-${rowIndex}`}
                  style={compact ? { width: '16px' } : undefined}
                >
                  {labelConfig?.label ?? ''}
                </span>
              );
            })}
          </div>
        ) : null}

        <div
          class={`grid min-w-0 ${weekColumnGapClass}`}
          style={{ gridTemplateColumns: `repeat(${weekCount}, minmax(0, 1fr))` }}
        >
          {weeks.map((week) => (
            <div class={`grid min-w-0 grid-rows-7 ${rowGapClass}`} key={week.startDate}>
              {week.cells.map((cell, index) => (
                <span
                  class={`${cellClass} ${getLevelClass(cell.level, cell.inRange)}`}
                  key={`${cell.date}-${index}`}
                  title={`${cell.date} · 完成率 ${Math.round(cell.completionRate * 100)}%`}
                ></span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
