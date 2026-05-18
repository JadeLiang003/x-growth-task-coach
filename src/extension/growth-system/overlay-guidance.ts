import { personaOverlays, stagePlaybooks } from '../shared/playbook-data';
import type {
  ContentFormatGroup,
  CustomOverlayDefinition,
  ExtensionSettings,
} from '../storage/schema';

const BUILT_IN_OVERLAY_KEYWORDS: Record<string, string[]> = {
  build_in_public: ['公开构建', '构建', '上线', '进展', '复盘', '产品进展', '用户反馈', '迭代'],
  ai_creator: ['AI', '自动化', '工作流', '智能体', '提示词', '模型', '实验', '应用'],
  indie_hacker: ['独立开发', '产品', '增长', '盈利', '用户反馈', '试错', '迭代', 'SaaS'],
};

export interface OverlayGuidanceDefinition {
  id: string;
  name: string;
  description: string;
  topicSuggestions: string[];
  toneRules: string[];
  keywords: string[];
  source: 'builtin' | 'custom';
}

export interface ContentSuggestionCard {
  id: string;
  title: string;
  prompt: string;
  preferredFormatGroup: ContentFormatGroup;
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getBuiltInOverlayDefinitions(): OverlayGuidanceDefinition[] {
  return personaOverlays.map((overlay) => ({
    id: overlay.id,
    name: overlay.name,
    description: overlay.description,
    topicSuggestions: overlay.topicSuggestions,
    toneRules: overlay.toneRules,
    keywords: BUILT_IN_OVERLAY_KEYWORDS[overlay.id] ?? [],
    source: 'builtin',
  }));
}

function normalizeCustomOverlay(overlay: CustomOverlayDefinition): OverlayGuidanceDefinition {
  return {
    id: overlay.id,
    name: overlay.name,
    description: overlay.description,
    topicSuggestions: dedupeStrings(overlay.topicSuggestions),
    toneRules: dedupeStrings(overlay.toneRules),
    keywords: dedupeStrings(overlay.keywords),
    source: 'custom',
  };
}

export function getAllOverlayDefinitions(settings: ExtensionSettings) {
  return [
    ...getBuiltInOverlayDefinitions(),
    ...settings.customOverlays.map(normalizeCustomOverlay),
  ];
}

export function getSelectedOverlayDefinitions(settings: ExtensionSettings) {
  const selectedIds = new Set(settings.overlayIds);
  return getAllOverlayDefinitions(settings).filter((overlay) => selectedIds.has(overlay.id));
}

export function getOverlayNamesFromSettings(
  settings: ExtensionSettings,
  overlayIds = settings.overlayIds,
) {
  const selectedIds = new Set(overlayIds);
  return getAllOverlayDefinitions(settings)
    .filter((overlay) => selectedIds.has(overlay.id))
    .map((overlay) => overlay.name);
}

export function getOverlayKeywordList(settings: ExtensionSettings) {
  return dedupeStrings(
    getSelectedOverlayDefinitions(settings).flatMap((overlay) => overlay.keywords),
  );
}

export function buildOverlayKeywordQuery(settings: ExtensionSettings) {
  const keywords = getOverlayKeywordList(settings).slice(0, 8);
  if (keywords.length === 0) {
    return '(AI OR 自动化 OR 独立开发 OR 产品 OR 增长)';
  }

  return `(${keywords.join(' OR ')})`;
}

export function getOverlayToneSummary(settings: ExtensionSettings) {
  return dedupeStrings(
    getSelectedOverlayDefinitions(settings).flatMap((overlay) => overlay.toneRules),
  ).slice(0, 3);
}

export function getOverlayTopicSuggestions(settings: ExtensionSettings) {
  return dedupeStrings(
    getSelectedOverlayDefinitions(settings).flatMap((overlay) => overlay.topicSuggestions),
  ).slice(0, 8);
}

function pickPreferredFormatGroup(stageId: string, suggestionIndex: number): ContentFormatGroup {
  if (stageId === 'scale_1000_5000') {
    if (suggestionIndex % 3 === 1) {
      return 'thread';
    }

    if (suggestionIndex % 3 === 2) {
      return 'long_form';
    }
  }

  if (suggestionIndex % 4 === 3) {
    return 'long_form';
  }

  return 'short';
}

export function getContentSuggestionCards(
  settings: ExtensionSettings,
  limit = 4,
): ContentSuggestionCard[] {
  const stage = stagePlaybooks.find((item) => item.id === settings.currentStageId);
  const topics = getOverlayTopicSuggestions(settings);
  const tones = getOverlayToneSummary(settings);

  const fallbackTopics = stage
    ? [
        `围绕「${stage.name}」复盘今天最有效的动作`,
        `把今天的一个真实结果讲清楚`,
        `拿一个问题写成可复用步骤`,
      ]
    : ['记录今天的真实进展', '拆一个有效动作', '写一个可复用步骤'];

  const nextTopics = (topics.length > 0 ? topics : fallbackTopics).slice(0, limit);

  return nextTopics.map((topic, index) => {
    const tone = tones[index % Math.max(tones.length, 1)] ?? '优先讲真实结果和真实过程';
    const formatGroup = pickPreferredFormatGroup(settings.currentStageId, index);

    return {
      id: `${settings.currentStageId}-${index}-${topic}`,
      title: topic,
      prompt: `${topic}。写的时候注意：${tone}。`,
      preferredFormatGroup: formatGroup,
    };
  });
}

export function getReviewSuggestionSuffix(settings: ExtensionSettings) {
  const firstSuggestion = getContentSuggestionCards(settings, 1)[0];
  if (!firstSuggestion) {
    return '';
  }

  return `下一步可以优先写：${firstSuggestion.title}。`;
}
