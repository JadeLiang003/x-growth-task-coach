import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import {
  ActivityHeatmap,
  formatHeatmapRangeLabel,
  getHeatmapRangeView,
} from '../components/activity-heatmap';
import { FollowerSparkline } from '../components/follower-sparkline';
import {
  getFollowerTrendSeries,
  getFollowerSummary,
  getRecommendedAccounts,
  type FollowerSummary,
  type FollowerTrendPoint,
  type RecommendedAccount,
} from '../growth-system/phase-six-data';
import { getAccountCategoryLabel, getInfluenceBandLabel } from '../growth-system/account-taxonomy';
import {
  buildXSearchUrl,
  getOrCreateDailyReviewDraft,
  getPinnedSearchTemplates,
  updateDailyReviewDraftUrls,
} from '../growth-system/phase-seven-data';
import {
  getDailyRecords,
  getSettings,
  openOptionsPage,
  subscribeToStorageChanges,
} from '../storage/storage';
import type {
  DailyRecord,
  DailyReviewDraft,
  ExtensionSettings,
  SearchTemplate,
  TaskDashboardSummary,
} from '../storage/schema';
import { stagePlaybooks } from '../shared/playbook-data';
import { getOrCreateTodaySummary, resetTodayRecord } from '../task-system/daily-records';

const POPUP_RELEVANT_STORAGE_KEYS = new Set([
  'xGrowthTaskCoach.settings',
  'xGrowthTaskCoach.dailyRecords',
  'xGrowthTaskCoach.followerSnapshots',
  'xGrowthTaskCoach.accountPool',
  'xGrowthTaskCoach.searchTemplates',
  'xGrowthTaskCoach.dailyReviewDrafts',
  'xGrowthTaskCoach.candidateAccounts',
]);

function formatFollowerDelta(delta: number | null) {
  if (typeof delta !== 'number') {
    return '暂无昨日对比';
  }

  if (delta > 0) {
    return `较昨日 +${delta}`;
  }

  if (delta < 0) {
    return `较昨日 ${delta}`;
  }

  return '较昨日持平';
}

function buildReviewClipboardText(reviewDraft: DailyReviewDraft) {
  const lines = [reviewDraft.xDraft];

  const attachmentLines: string[] = [];

  if (reviewDraft.bestPostUrl) {
    attachmentLines.push(`最佳帖子：${reviewDraft.bestPostUrl}`);
  }

  if (reviewDraft.bestReplyUrl) {
    attachmentLines.push(`最佳回复：${reviewDraft.bestReplyUrl}`);
  }

  if (attachmentLines.length > 0) {
    lines.push('');
    lines.push('附录：');
    lines.push(...attachmentLines);
  }

  return lines.join('\n');
}

export function PopupApp() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [summary, setSummary] = useState<TaskDashboardSummary | null>(null);
  const [followerSummary, setFollowerSummary] = useState<FollowerSummary | null>(null);
  const [followerTrend, setFollowerTrend] = useState<FollowerTrendPoint[]>([]);
  const [recommendedAccounts, setRecommendedAccounts] = useState<RecommendedAccount[]>([]);
  const [pinnedSearchTemplates, setPinnedSearchTemplates] = useState<SearchTemplate[]>([]);
  const [reviewDraft, setReviewDraft] = useState<DailyReviewDraft | null>(null);
  const [dailyRecords, setDailyRecords] = useState<DailyRecord[]>([]);
  const [searchEntryExpanded, setSearchEntryExpanded] = useState(false);
  const [bestPostUrlInput, setBestPostUrlInput] = useState('');
  const [bestReplyUrlInput, setBestReplyUrlInput] = useState('');
  const [reviewCopyLabel, setReviewCopyLabel] = useState('复制复盘');
  const [isBusy, setIsBusy] = useState(false);
  const bestPostUrlRef = useRef<HTMLInputElement | null>(null);
  const bestReplyUrlRef = useRef<HTMLInputElement | null>(null);
  const reloadTimerRef = useRef<number | null>(null);

  const loadDashboard = async (options?: { syncReviewInputs?: boolean }) => {
    const [
      loadedSettings,
      loadedSummary,
      loadedFollowerSummary,
      loadedFollowerTrend,
      loadedRecommendedAccounts,
      loadedPinnedSearchTemplates,
      loadedReviewDraft,
      loadedDailyRecords,
    ] = await Promise.all([
      getSettings(),
      getOrCreateTodaySummary(),
      getFollowerSummary(),
      getFollowerTrendSeries(14),
      getRecommendedAccounts(),
      getPinnedSearchTemplates(4),
      getOrCreateDailyReviewDraft(),
      getDailyRecords(),
    ]);

    setSettings(loadedSettings);
    setSummary(loadedSummary);
    setFollowerSummary(loadedFollowerSummary);
    setFollowerTrend(loadedFollowerTrend);
    setRecommendedAccounts(loadedRecommendedAccounts);
    setPinnedSearchTemplates(loadedPinnedSearchTemplates);
    setReviewDraft(loadedReviewDraft);
    setDailyRecords(loadedDailyRecords);
    setReviewCopyLabel('复制复盘');

    if (options?.syncReviewInputs) {
      setBestPostUrlInput(loadedReviewDraft.bestPostUrl);
      setBestReplyUrlInput(loadedReviewDraft.bestReplyUrl);
    }
  };

  useEffect(() => {
    void loadDashboard({ syncReviewInputs: true });

    const scheduleReload = () => {
      if (reloadTimerRef.current !== null) {
        window.clearTimeout(reloadTimerRef.current);
      }

      reloadTimerRef.current = window.setTimeout(() => {
        reloadTimerRef.current = null;
        void loadDashboard({ syncReviewInputs: false });
      }, 100);
    };

    const unsubscribe = subscribeToStorageChanges((changes, areaName) => {
      if (areaName !== 'local') {
        return;
      }

      const hasRelevantChange = Object.keys(changes).some((key) =>
        POPUP_RELEVANT_STORAGE_KEYS.has(key),
      );
      if (hasRelevantChange) {
        scheduleReload();
      }
    });

    return () => {
      if (reloadTimerRef.current !== null) {
        window.clearTimeout(reloadTimerRef.current);
      }
      unsubscribe();
    };
  }, []);

  const stage = stagePlaybooks.find(
    (item) => item.id === (summary?.todayRecord.playbookId ?? settings?.currentStageId),
  );
  const completionPercent = Math.round((summary?.todayRecord.completionRate ?? 0) * 100);
  const consistencyPercent = Math.round((summary?.consistencyScore ?? 0) * 100);
  const visibleRecommendedAccounts = recommendedAccounts.slice(0, 4);
  const popupHeatmapView = useMemo(
    () => getHeatmapRangeView(dailyRecords, 'quarter', new Date()),
    [dailyRecords],
  );
  const followerTrendPoints = useMemo(
    () => followerTrend.map((item) => item.followersCount),
    [followerTrend],
  );

  const handleResetToday = async () => {
    setIsBusy(true);
    try {
      const nextSummary = await resetTodayRecord();
      setSummary(nextSummary);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveReviewUrls = async () => {
    setIsBusy(true);
    try {
      const nextBestPostUrl = bestPostUrlRef.current?.value ?? bestPostUrlInput;
      const nextBestReplyUrl = bestReplyUrlRef.current?.value ?? bestReplyUrlInput;
      const nextDraft = await updateDailyReviewDraftUrls({
        bestPostUrl: nextBestPostUrl,
        bestReplyUrl: nextBestReplyUrl,
      });
      setBestPostUrlInput(nextBestPostUrl);
      setBestReplyUrlInput(nextBestReplyUrl);
      setReviewDraft(nextDraft);
      setReviewCopyLabel('复制复盘');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyReviewDraft = async () => {
    if (!reviewDraft?.xDraft) {
      return;
    }

    await navigator.clipboard.writeText(buildReviewClipboardText(reviewDraft));
    setReviewCopyLabel('已复制');
  };

  return (
    <main class="coach-shell w-[364px] p-4">
      <section class="coach-panel rounded-[28px] p-4">
        <header class="mb-4 flex items-start justify-between gap-3">
          <div>
            <p class="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
              X Growth Task Coach
            </p>
            <h1
              class="m-0 text-[22px] leading-none text-slate-900"
              style={{ fontFamily: '"Palatino Linotype", Palatino, Georgia, serif' }}
            >
              今日总览
            </h1>
          </div>
          <button
            class="coach-button secondary px-3 py-2 text-xs"
            type="button"
            onClick={() => openOptionsPage()}
          >
            设置
          </button>
        </header>

        <section class="coach-badge mb-3 rounded-[24px] p-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="mb-1 mt-0 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                当前阶段
              </p>
              <p class="m-0 text-sm font-semibold text-slate-900">{stage?.name ?? '未设置'}</p>
            </div>
            <div class="text-right">
              <p class="mb-1 mt-0 text-lg font-semibold text-slate-900">{completionPercent}%</p>
              <p class="m-0 text-xs text-slate-500">{summary?.todayRecord.date ?? '--'}</p>
            </div>
          </div>
          <div class="mt-3 coach-progress-rail">
            <div class="coach-progress-fill" style={{ width: `${completionPercent}%` }}></div>
          </div>
          <div class="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600">
            <span>
              已完成 {summary?.completedTaskCount ?? 0} / {summary?.totalTaskCount ?? 0} 项
            </span>
            <span class="text-right">连续 {summary?.streakDays ?? 0} 天</span>
            <span>近 7 天稳定 {consistencyPercent}%</span>
            <span class="text-right">{settings?.intensityPreset ?? 'standard'} 档</span>
          </div>
        </section>

        <section class="mb-3 rounded-[24px] border border-[rgba(36,36,36,0.1)] bg-white/88 px-4 py-4">
          <div class="mb-3 flex items-start justify-between gap-3">
            <div>
              <p class="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-[#797776]">
                执行热力图
              </p>
            </div>
            <span class="rounded-full border border-[rgba(36,36,36,0.12)] bg-white/72 px-2.5 py-1 text-[11px] text-[#4e4d4d]">
              {formatHeatmapRangeLabel('quarter')}
            </span>
          </div>
          <div class="rounded-[18px] border border-[rgba(36,36,36,0.08)] bg-[rgba(207,218,245,0.12)] px-3.5 py-3">
            <ActivityHeatmap compact endDate={new Date()} records={dailyRecords} range="quarter" />
          </div>
          <div class="mt-3 flex items-center justify-between text-[11px] text-[#797776]">
            <span>完成 {popupHeatmapView.stats.completedDays} 天</span>
            <span>{popupHeatmapView.stats.longestStreak} 天最长连续</span>
            <span>平均 {popupHeatmapView.stats.averageCompletionRate}%</span>
          </div>
        </section>

        <section class="mb-3 rounded-[24px] border border-slate-200 bg-white/85 px-4 py-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="mb-1 mt-0 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                粉丝快照
              </p>
              <div class="mt-2 flex items-end gap-2">
                <p class="m-0 text-[28px] font-semibold leading-none text-slate-900">
                  {typeof followerSummary?.todayCount === 'number'
                    ? followerSummary.todayCount.toLocaleString('en-US')
                    : '--'}
                </p>
                <span class="mb-0.5 rounded-full border border-[rgba(36,36,36,0.12)] bg-[rgba(207,218,245,0.32)] px-2 py-0.5 text-[11px] font-medium text-[#4e4d4d]">
                  {formatFollowerDelta(followerSummary?.deltaFromPrevious ?? null)}
                </span>
              </div>
            </div>
            <span class="rounded-full border border-[rgba(36,36,36,0.1)] bg-white/72 px-2.5 py-1 text-[10px] font-medium text-[#797776]">
              最近 14 天
            </span>
          </div>
          <div
            class={`mt-3 rounded-[18px] border border-[rgba(36,36,36,0.08)] px-3 py-3 ${
              followerTrendPoints.length > 1
                ? 'bg-[rgba(207,218,245,0.14)]'
                : 'bg-[rgba(207,218,245,0.1)]'
            }`}
          >
            <div class="mb-2 flex items-center justify-between text-[11px] text-[#797776]">
              <span>趋势</span>
              <span>{followerTrendPoints.length > 1 ? '最近趋势' : '样本不足'}</span>
            </div>
            <div class={followerTrendPoints.length > 1 ? 'h-[52px]' : 'h-[26px]'}>
              <FollowerSparkline
                height={followerTrendPoints.length > 1 ? 60 : 28}
                points={followerTrendPoints}
              />
            </div>
          </div>
        </section>

        <section class="coach-badge mb-3 rounded-[24px] p-4">
          <div class="mb-3 flex items-center justify-between">
            <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              建议互动
            </span>
          </div>
          <div class="grid gap-2">
            {visibleRecommendedAccounts.length > 0 ? (
              visibleRecommendedAccounts.map((account) => (
                <a
                  class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border border-[rgba(36,36,36,0.08)] bg-white/85 px-3 py-2.5 text-sm no-underline"
                  href={`https://x.com/${account.handle}`}
                  key={account.id}
                  rel="noreferrer"
                  target="_blank"
                >
                  <div class="min-w-0 pr-2">
                    <p class="m-0 truncate text-[12px] font-medium text-slate-900">
                      {account.displayName || account.handle}
                      <span class="ml-1 text-[11px] text-[#797776]">@{account.handle}</span>
                    </p>
                  </div>
                  <div class="flex flex-wrap justify-end gap-1">
                    <span class="rounded-full border border-[rgba(36,36,36,0.08)] bg-[rgba(207,218,245,0.14)] px-2 py-0.5 text-[10px] font-medium text-[#4e4d4d]">
                      {getAccountCategoryLabel(account.category)}
                    </span>
                    {account.influenceBand ? (
                      <span class="rounded-full border border-[rgba(36,36,36,0.08)] bg-white/72 px-2 py-0.5 text-[10px] font-medium text-[#797776]">
                        {getInfluenceBandLabel(account.influenceBand)}
                      </span>
                    ) : null}
                  </div>
                </a>
              ))
            ) : (
              <span class="text-sm text-slate-500">暂无推荐账号</span>
            )}
          </div>
        </section>

        <section class="coach-badge mb-3 rounded-[24px] p-4">
          <button
            class="flex w-full items-center justify-between rounded-[16px] border border-[rgba(36,36,36,0.08)] bg-white/62 px-3 py-2.5 text-left"
            type="button"
            onClick={() => setSearchEntryExpanded((current) => !current)}
          >
            <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              搜索入口
            </span>
            <span class="text-xs text-slate-600">
              {searchEntryExpanded ? '收起' : '展开'}
            </span>
          </button>
          {searchEntryExpanded ? (
            <div class="mt-3 grid gap-2">
              {pinnedSearchTemplates.length > 0 ? (
                pinnedSearchTemplates.map((template) => (
                  <a
                    class="rounded-[16px] border border-[rgba(36,36,36,0.08)] bg-white/76 px-3 py-2.5 text-sm no-underline"
                    href={buildXSearchUrl(template.query)}
                    key={template.id}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <p class="m-0 min-w-0 truncate font-semibold text-slate-900">
                        {template.name}
                      </p>
                      <span class="shrink-0 text-[11px] text-slate-500">前往</span>
                    </div>
                    <p class="m-0 mt-1 line-clamp-1 text-[11px] leading-5 text-slate-500">
                      {template.description}
                    </p>
                  </a>
                ))
              ) : (
                <span class="text-sm text-slate-500">暂无固定模板</span>
              )}
            </div>
          ) : null}
        </section>

        <section class="coach-badge rounded-[24px] p-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              每日复盘
            </span>
          </div>
          <div class="rounded-[18px] border border-slate-200 bg-white/80 px-3 py-3">
            <p class="m-0 whitespace-pre-wrap text-sm leading-6 text-slate-800">
              {reviewDraft?.xDraft ?? '今天还没有复盘草稿'}
            </p>
          </div>
          <div class="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <button
              class="coach-button primary"
              type="button"
              onClick={() => void handleCopyReviewDraft()}
            >
              {reviewCopyLabel}
            </button>
            <button
              class="coach-button secondary"
              disabled={isBusy}
              type="button"
              onClick={() => void handleResetToday()}
            >
              重置今天
            </button>
          </div>

          <details class="mt-3 rounded-[18px] border border-[rgba(36,36,36,0.08)] bg-white/72 px-3 py-3">
            <summary class="cursor-pointer text-sm font-semibold text-slate-900">附录</summary>
            <div class="mt-3 grid gap-2">
              <input
                class="coach-select"
                ref={bestPostUrlRef}
                placeholder="最佳帖子 URL"
                value={bestPostUrlInput}
                onInput={(event) => setBestPostUrlInput(event.currentTarget.value)}
              />
              <input
                class="coach-select"
                ref={bestReplyUrlRef}
                placeholder="最佳回复 URL"
                value={bestReplyUrlInput}
                onInput={(event) => setBestReplyUrlInput(event.currentTarget.value)}
              />
              <button
                class="coach-button secondary"
                disabled={isBusy}
                type="button"
                onClick={() => void handleSaveReviewUrls()}
              >
                保存
              </button>
            </div>
          </details>
        </section>
      </section>
    </main>
  );
}
