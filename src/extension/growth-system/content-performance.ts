import { getTodayKey } from '../shared/date';
import {
  getLastContentRecognition,
  getOriginalContentRecords,
  getSettings,
  saveLastContentRecognition,
  saveOriginalContentRecords,
} from '../storage/storage';
import type {
  ContentFormat,
  ContentFormatGroup,
  ContentRecognitionStatus,
  LastContentRecognition,
  OriginalContentRecord,
} from '../storage/schema';

const MAX_ORIGINAL_CONTENT_RECORDS = 400;
const THREAD_DEDUP_WINDOW_MS = 12_000;

export interface ContentFormatSummary {
  shortCount: number;
  threadCount: number;
  longFormCount: number;
  unrecognizedCount: number;
  totalCount: number;
  lastRecognition: LastContentRecognition;
}

function buildContentRecordId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `content-${Date.now()}`;
}

function clampRecords(records: OriginalContentRecord[]) {
  return [...records]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(-MAX_ORIGINAL_CONTENT_RECORDS);
}

function getFallbackTaskIds(stageId: string) {
  if (stageId === 'scale_1000_5000') {
    return ['shortPosts'];
  }

  if (stageId === 'cold_start_0_100' || stageId === 'growth_100_1000') {
    return ['shortContentPosts'];
  }

  return [];
}

export function getTaskIdsForContentFormatGroup(
  stageId: string,
  formatGroup: ContentFormatGroup | null,
) {
  if (stageId === 'scale_1000_5000') {
    if (formatGroup === 'thread') {
      return ['threadPosts'];
    }

    if (formatGroup === 'long_form') {
      return ['longFormPosts'];
    }

    return ['shortPosts'];
  }

  if (stageId === 'cold_start_0_100' || stageId === 'growth_100_1000') {
    if (formatGroup === 'long_form') {
      return ['longFormPosts'];
    }

    return ['shortContentPosts'];
  }

  return [];
}

export function getContentFormatGroupLabel(formatGroup: ContentFormatGroup | null) {
  if (formatGroup === 'thread') {
    return '线程';
  }

  if (formatGroup === 'long_form') {
    return '长文';
  }

  if (formatGroup === 'short') {
    return '短推';
  }

  return '未识别';
}

export function getContentFormatLabel(format: ContentFormat | null) {
  if (format === 'thread') {
    return '线程';
  }

  if (format === 'long_post') {
    return '长帖';
  }

  if (format === 'note') {
    return 'Note';
  }

  if (format === 'article') {
    return 'Article';
  }

  if (format === 'short_post') {
    return '短推';
  }

  return '未识别';
}

function buildRecognitionLabel(input: {
  format: ContentFormat | null;
  formatGroup: ContentFormatGroup | null;
  status: ContentRecognitionStatus;
  fallbackApplied: boolean;
}) {
  if (input.status === 'unrecognized') {
    return input.fallbackApplied ? '未识别，已按短内容计入' : '未识别';
  }

  const label = getContentFormatGroupLabel(input.formatGroup);
  return input.fallbackApplied ? `${label}（回退计入）` : label;
}

function isDuplicateThreadRecord(
  records: OriginalContentRecord[],
  endpoint: string,
  createdAt: string,
  formatGroup: ContentFormatGroup | null,
) {
  if (formatGroup !== 'thread') {
    return false;
  }

  const currentTimestamp = new Date(createdAt).getTime();

  return records.some((record) => {
    if (record.formatGroup !== 'thread' || record.endpoint !== endpoint) {
      return false;
    }

    const previousTimestamp = new Date(record.createdAt).getTime();
    return Math.abs(currentTimestamp - previousTimestamp) <= THREAD_DEDUP_WINDOW_MS;
  });
}

export async function recordOriginalContentRecognition(input: {
  format: ContentFormat | null;
  formatGroup: ContentFormatGroup | null;
  status: ContentRecognitionStatus;
  endpoint: string;
  signature: string;
}) {
  const [records, settings] = await Promise.all([getOriginalContentRecords(), getSettings()]);
  const existingRecord = records.find((record) => record.signature === input.signature);
  const createdAt = new Date().toISOString();
  const fallbackApplied = input.status === 'unrecognized' || input.formatGroup === null;
  const effectiveFormatGroup = input.formatGroup ?? 'short';

  if (
    existingRecord ||
    isDuplicateThreadRecord(records, input.endpoint, createdAt, input.formatGroup)
  ) {
    const lastRecognition = await getLastContentRecognition();
    return {
      alreadyRecorded: true,
      taskIds: getTaskIdsForContentFormatGroup(settings.currentStageId, effectiveFormatGroup),
      lastRecognition,
    };
  }

  const nextRecord: OriginalContentRecord = {
    id: buildContentRecordId(),
    date: getTodayKey(),
    format: input.format,
    formatGroup: input.formatGroup,
    status: input.status,
    source: 'auto',
    endpoint: input.endpoint,
    signature: input.signature,
    createdAt,
  };

  const nextRecords = clampRecords([...records, nextRecord]);
  await saveOriginalContentRecords(nextRecords);

  const lastRecognition: LastContentRecognition = {
    timestamp: createdAt,
    format: input.format,
    formatGroup: input.formatGroup,
    status: input.status,
    summaryLabel: buildRecognitionLabel({
      format: input.format,
      formatGroup: input.formatGroup,
      status: input.status,
      fallbackApplied,
    }),
    endpoint: input.endpoint,
    fallbackApplied,
  };
  await saveLastContentRecognition(lastRecognition);

  const taskIds =
    getTaskIdsForContentFormatGroup(settings.currentStageId, effectiveFormatGroup).length > 0
      ? getTaskIdsForContentFormatGroup(settings.currentStageId, effectiveFormatGroup)
      : getFallbackTaskIds(settings.currentStageId);

  return {
    alreadyRecorded: false,
    taskIds,
    lastRecognition,
  };
}

export async function getTodayContentFormatSummary(date = getTodayKey()) {
  const [records, lastRecognition] = await Promise.all([
    getOriginalContentRecords(),
    getLastContentRecognition(),
  ]);

  const todayRecords = records.filter((record) => record.date === date);
  const shortCount = todayRecords.filter((record) => record.formatGroup === 'short').length;
  const threadCount = todayRecords.filter((record) => record.formatGroup === 'thread').length;
  const longFormCount = todayRecords.filter((record) => record.formatGroup === 'long_form').length;
  const unrecognizedCount = todayRecords.filter(
    (record) => record.status === 'unrecognized',
  ).length;

  return {
    shortCount,
    threadCount,
    longFormCount,
    unrecognizedCount,
    totalCount: todayRecords.length,
    lastRecognition,
  } satisfies ContentFormatSummary;
}
