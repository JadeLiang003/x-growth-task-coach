import { personaOverlays, stagePlaybooks } from '../shared/playbook-data';
import { getPreviousDateKey, getTodayKey } from '../shared/date';
import { getDailyRecords, getSettings, saveDailyRecords } from '../storage/storage';
import type {
  CustomOverlayDefinition,
  DailyRecord,
  DailyTaskProgress,
  ExtensionSettings,
  IntensityPreset,
  TaskTrackingMode,
  TaskDashboardSummary,
} from '../storage/schema';
import growthPlaybooks from '@/playbooks/growth_playbooks.json';

type StagePlaybook = (typeof stagePlaybooks)[number];
type TaskCatalogEntry =
  (typeof growthPlaybooks.taskCatalog)[keyof typeof growthPlaybooks.taskCatalog];

function getStagePlaybook(stageId: string) {
  const playbook = stagePlaybooks.find((item) => item.id === stageId);
  if (!playbook) {
    throw new Error(`未找到阶段 playbook: ${stageId}`);
  }
  return playbook;
}

function getTaskCatalogEntry(taskId: string) {
  const taskEntry = growthPlaybooks.taskCatalog[taskId as keyof typeof growthPlaybooks.taskCatalog];
  if (!taskEntry) {
    throw new Error(`未找到任务定义: ${taskId}`);
  }
  return taskEntry as TaskCatalogEntry;
}

function toTaskTrackingMode(mode: string): TaskTrackingMode {
  if (mode === 'auto' || mode === 'manual' || mode === 'mixed') {
    return mode;
  }
  return 'manual';
}

function getResolvedDailyTargetsWithOverrides(
  playbook: StagePlaybook,
  preset: IntensityPreset,
  taskTargetOverrides: Record<string, number>,
) {
  const presetTargets = playbook.intensityPresets[preset]?.dailyTargets ?? {};
  const mergedTargets = {
    ...playbook.dailyTargets,
    ...presetTargets,
    ...taskTargetOverrides,
  };

  return Object.fromEntries(
    Object.entries(mergedTargets).filter(([, target]) => typeof target === 'number'),
  ) as Record<string, number>;
}

function calculateCompletionRate(tasks: DailyTaskProgress[]) {
  if (tasks.length === 0) {
    return 0;
  }

  const totalProgress = tasks.reduce((sum, task) => {
    if (task.target <= 0) {
      return sum;
    }
    return sum + Math.min(task.current / task.target, 1);
  }, 0);

  return Number((totalProgress / tasks.length).toFixed(4));
}

function withCompletionState(task: DailyTaskProgress): DailyTaskProgress {
  return {
    ...task,
    completed: task.current >= task.target,
  };
}

function createDailyTasks(playbook: StagePlaybook, preset: IntensityPreset) {
  return createDailyTasksWithOverrides(playbook, preset, {});
}

function createDailyTasksWithOverrides(
  playbook: StagePlaybook,
  preset: IntensityPreset,
  taskTargetOverrides: Record<string, number>,
) {
  const dailyTargets = getResolvedDailyTargetsWithOverrides(playbook, preset, taskTargetOverrides);

  return Object.entries(dailyTargets)
    .filter(([, target]) => target > 0)
    .map(([taskId, target]) => {
      const entry = getTaskCatalogEntry(taskId);
      return {
        taskId,
        label: entry.label,
        target,
        current: 0,
        unit: entry.unit,
        mode: toTaskTrackingMode(entry.trackingMode),
        category: entry.category,
        completed: false,
      } satisfies DailyTaskProgress;
    });
}

function getMappedLegacyContentTaskId(playbookId: string) {
  if (playbookId === 'scale_1000_5000') {
    return 'shortPosts';
  }

  if (playbookId === 'cold_start_0_100' || playbookId === 'growth_100_1000') {
    return 'shortContentPosts';
  }

  return null;
}

function migrateLegacyTasks(record: DailyRecord) {
  const playbook = getStagePlaybook(record.playbookId);
  const expectedTasks = createDailyTasks(playbook, record.intensityPreset);
  const currentTaskIds = new Set(record.tasks.map((task) => task.taskId));
  const alreadyAligned =
    expectedTasks.length === record.tasks.length &&
    expectedTasks.every((task) => currentTaskIds.has(task.taskId));

  if (alreadyAligned) {
    return record;
  }

  const taskMap = new Map(record.tasks.map((task) => [task.taskId, task]));
  const legacyOriginalPosts = taskMap.get('originalPosts');
  const mappedLegacyTaskId = getMappedLegacyContentTaskId(record.playbookId);

  const nextTasks = expectedTasks.map((task) => {
    const existingTask = taskMap.get(task.taskId);
    if (existingTask) {
      return withCompletionState({
        ...task,
        current: existingTask.current,
      });
    }

    if (legacyOriginalPosts && mappedLegacyTaskId === task.taskId) {
      return withCompletionState({
        ...task,
        current: legacyOriginalPosts.current,
      });
    }

    return task;
  });

  return {
    ...record,
    tasks: nextTasks,
    completionRate: calculateCompletionRate(nextTasks),
  } satisfies DailyRecord;
}

function createDailyRecord(settings: ExtensionSettings, date = getTodayKey()): DailyRecord {
  const playbook = getStagePlaybook(settings.currentStageId);
  const now = new Date().toISOString();
  const tasks = createDailyTasksWithOverrides(
    playbook,
    settings.intensityPreset,
    settings.taskTargetOverrides ?? {},
  );

  return {
    date,
    playbookId: playbook.id,
    intensityPreset: settings.intensityPreset,
    overlayIds: [...settings.overlayIds],
    tasks,
    completionRate: calculateCompletionRate(tasks),
    createdAt: now,
    updatedAt: now,
  } satisfies DailyRecord;
}

function canReplaceWithCurrentSettings(record: DailyRecord, settings: ExtensionSettings) {
  const hasProgress = record.tasks.some((task) => task.current > 0);
  const overlayChanged =
    record.overlayIds.length !== settings.overlayIds.length ||
    record.overlayIds.some((overlayId) => !settings.overlayIds.includes(overlayId));
  const expectedTasks = createDailyTasksWithOverrides(
    getStagePlaybook(settings.currentStageId),
    settings.intensityPreset,
    settings.taskTargetOverrides ?? {},
  );
  const taskTargetsChanged =
    expectedTasks.length !== record.tasks.length ||
    expectedTasks.some((task) => {
      const matchedTask = record.tasks.find((recordTask) => recordTask.taskId === task.taskId);
      return !matchedTask || matchedTask.target !== task.target;
    });

  return (
    !hasProgress &&
    (record.playbookId !== settings.currentStageId ||
      record.intensityPreset !== settings.intensityPreset ||
      overlayChanged ||
      taskTargetsChanged)
  );
}

function normalizeRecordWithCompletion(record: DailyRecord) {
  const migratedRecord = migrateLegacyTasks(record);
  const tasks = migratedRecord.tasks.map(withCompletionState);
  return {
    ...migratedRecord,
    tasks,
    completionRate: calculateCompletionRate(tasks),
  } satisfies DailyRecord;
}

function upsertRecord(records: DailyRecord[], record: DailyRecord) {
  const nextRecords = records.filter((item) => item.date !== record.date);
  nextRecords.push(record);
  nextRecords.sort((a, b) => a.date.localeCompare(b.date));
  return nextRecords;
}

function calculateStreak(records: DailyRecord[]) {
  const completedDates = new Set(
    records.filter((record) => record.completionRate >= 0.8).map((record) => record.date),
  );

  let streak = 0;
  let cursor = getTodayKey();

  while (completedDates.has(cursor)) {
    streak += 1;
    cursor = getPreviousDateKey(cursor);
  }

  return streak;
}

function calculateConsistencyScore(records: DailyRecord[]) {
  const recent = [...records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  if (recent.length === 0) {
    return 0;
  }

  const effectiveDays = recent.filter((record) => record.completionRate >= 0.8).length;
  return Number((effectiveDays / 7).toFixed(4));
}

function getTaskDashboardSummary(record: DailyRecord, records: DailyRecord[]) {
  const completedTaskCount = record.tasks.filter((task) => task.completed).length;

  return {
    todayRecord: record,
    streakDays: calculateStreak(records),
    consistencyScore: calculateConsistencyScore(records),
    completedTaskCount,
    totalTaskCount: record.tasks.length,
  } satisfies TaskDashboardSummary;
}

export async function getOrCreateTodaySummary() {
  const [settings, records] = await Promise.all([getSettings(), getDailyRecords()]);
  const todayKey = getTodayKey();
  const existingRecord = records.find((item) => item.date === todayKey);

  if (!existingRecord) {
    const nextRecord = createDailyRecord(settings, todayKey);
    const nextRecords = upsertRecord(records, nextRecord);
    await saveDailyRecords(nextRecords);
    return getTaskDashboardSummary(nextRecord, nextRecords);
  }

  const normalizedRecord = normalizeRecordWithCompletion(existingRecord);
  const shouldReplace = canReplaceWithCurrentSettings(normalizedRecord, settings);
  const nextRecord = shouldReplace ? createDailyRecord(settings, todayKey) : normalizedRecord;

  if (
    shouldReplace ||
    nextRecord.completionRate !== existingRecord.completionRate ||
    nextRecord.tasks.some(
      (task, index) => task.completed !== existingRecord.tasks[index]?.completed,
    )
  ) {
    const nextRecords = upsertRecord(records, {
      ...nextRecord,
      updatedAt: new Date().toISOString(),
    });
    await saveDailyRecords(nextRecords);
    return getTaskDashboardSummary(nextRecord, nextRecords);
  }

  return getTaskDashboardSummary(nextRecord, records);
}

export async function updateTodayTaskProgress(taskId: string, delta: number) {
  const summary = await getOrCreateTodaySummary();
  const currentRecord = summary.todayRecord;
  const hasTask = currentRecord.tasks.some((task) => task.taskId === taskId);

  if (!hasTask) {
    return summary;
  }

  const nextTasks = currentRecord.tasks.map((task) => {
    if (task.taskId !== taskId) {
      return task;
    }

    const nextCurrent = Math.max(0, task.current + delta);
    return withCompletionState({
      ...task,
      current: nextCurrent,
    });
  });

  const nextRecord = {
    ...currentRecord,
    tasks: nextTasks,
    completionRate: calculateCompletionRate(nextTasks),
    updatedAt: new Date().toISOString(),
  } satisfies DailyRecord;

  const records = await getDailyRecords();
  const nextRecords = upsertRecord(records, nextRecord);
  await saveDailyRecords(nextRecords);

  return getTaskDashboardSummary(nextRecord, nextRecords);
}

export async function resetTodayRecord() {
  const settings = await getSettings();
  const records = await getDailyRecords();
  const nextRecord = createDailyRecord(settings, getTodayKey());
  const nextRecords = upsertRecord(records, nextRecord);
  await saveDailyRecords(nextRecords);

  return getTaskDashboardSummary(nextRecord, nextRecords);
}

export async function rebuildTodayRecordFromSettings(options?: {
  preserveProgress?: boolean;
  settings?: ExtensionSettings;
}) {
  const settings = options?.settings ?? (await getSettings());
  const records = await getDailyRecords();
  const todayKey = getTodayKey();
  const existingRecord = records.find((item) => item.date === todayKey);
  const nextRecord = createDailyRecord(settings, todayKey);

  if (options?.preserveProgress !== false && existingRecord) {
    const currentTaskMap = new Map(existingRecord.tasks.map((task) => [task.taskId, task]));
    nextRecord.tasks = nextRecord.tasks.map((task) => {
      const existingTask = currentTaskMap.get(task.taskId);
      return withCompletionState({
        ...task,
        current: existingTask?.current ?? 0,
      });
    });
    nextRecord.completionRate = calculateCompletionRate(nextRecord.tasks);
  }

  const normalizedNextRecord = normalizeRecordWithCompletion({
    ...nextRecord,
    updatedAt: new Date().toISOString(),
  });
  const nextRecords = upsertRecord(records, normalizedNextRecord);
  await saveDailyRecords(nextRecords);

  return getTaskDashboardSummary(normalizedNextRecord, nextRecords);
}

export function getIntensityPreview(settings: ExtensionSettings) {
  const playbook = getStagePlaybook(settings.currentStageId);
  const presets = ['conservative', 'standard', 'aggressive'] as const;

  return Object.fromEntries(
    presets.map((preset) => [
      preset,
      createDailyTasksWithOverrides(playbook, preset, settings.taskTargetOverrides ?? {}).map(
        (task) => ({
          taskId: task.taskId,
          label: task.label,
          target: task.target,
          unit: task.unit,
        }),
      ),
    ]),
  ) as Record<
    IntensityPreset,
    Array<{
      taskId: string;
      label: string;
      target: number;
      unit: string;
    }>
  >;
}

export function getOverlayNames(overlayIds: string[]) {
  return getOverlayNamesWithCustom(overlayIds, []);
}

export function getOverlayNamesWithCustom(
  overlayIds: string[],
  customOverlays: CustomOverlayDefinition[],
) {
  const overlayMap = new Map(
    [...personaOverlays, ...customOverlays].map((overlay) => [overlay.id, overlay.name]),
  );

  return overlayIds
    .filter((overlayId, index) => overlayIds.indexOf(overlayId) === index)
    .map((overlayId) => overlayMap.get(overlayId))
    .filter((name): name is string => Boolean(name))
    .slice(0, 8);
}
