import type { AccountInfluenceBand, AccountPoolCategory } from '../storage/schema';

export const accountCategoryOptions: Array<{
  value: AccountPoolCategory;
  label: string;
  description: string;
}> = [
  {
    value: 'peer',
    label: '同生态',
    description: '和你面对相近用户、相近话题、相近问题的创作者或开发者。',
  },
  {
    value: 'benchmark',
    label: '对标学习',
    description: '值得持续拆解内容结构、选题和表达方式的学习对象。',
  },
];

export const accountInfluenceBandOptions: Array<{
  value: AccountInfluenceBand;
  label: string;
}> = [
  { value: '0_500', label: '0-500' },
  { value: '500_1k', label: '500-1k' },
  { value: '1k_5k', label: '1k-5k' },
  { value: '5k_10k', label: '5k-10k' },
  { value: '10k_20k', label: '10k-20k' },
  { value: '20k_plus', label: '20k+' },
];

const influenceBandOrder: Record<AccountInfluenceBand, number> = {
  '0_500': 1,
  '500_1k': 2,
  '1k_5k': 3,
  '5k_10k': 4,
  '10k_20k': 5,
  '20k_plus': 6,
};

export function getAccountCategoryLabel(category: AccountPoolCategory | null) {
  if (!category) {
    return '待判断';
  }

  return accountCategoryOptions.find((option) => option.value === category)?.label ?? category;
}

export function getInfluenceBandLabel(influenceBand: AccountInfluenceBand | null) {
  if (!influenceBand) {
    return '待测量级';
  }

  return (
    accountInfluenceBandOptions.find((option) => option.value === influenceBand)?.label ??
    influenceBand
  );
}

export function getInfluenceBandScore(influenceBand: AccountInfluenceBand | null) {
  if (!influenceBand) {
    return 0;
  }

  return influenceBandOrder[influenceBand] ?? 0;
}

export function isInfluenceBandAtLeast(
  influenceBand: AccountInfluenceBand | null,
  minimumBand: AccountInfluenceBand,
) {
  return getInfluenceBandScore(influenceBand) >= getInfluenceBandScore(minimumBand);
}

export function inferInfluenceBand(followersCount: number | null) {
  if (typeof followersCount !== 'number' || followersCount < 0) {
    return null;
  }

  if (followersCount < 500) {
    return '0_500' satisfies AccountInfluenceBand;
  }

  if (followersCount < 1_000) {
    return '500_1k' satisfies AccountInfluenceBand;
  }

  if (followersCount < 5_000) {
    return '1k_5k' satisfies AccountInfluenceBand;
  }

  if (followersCount < 10_000) {
    return '5k_10k' satisfies AccountInfluenceBand;
  }

  if (followersCount < 20_000) {
    return '10k_20k' satisfies AccountInfluenceBand;
  }

  return '20k_plus' satisfies AccountInfluenceBand;
}

export function normalizeLegacyAccountCategory(
  rawCategory: string | null | undefined,
): AccountPoolCategory | null {
  if (!rawCategory) {
    return null;
  }

  if (rawCategory === 'peer') {
    return 'peer';
  }

  if (rawCategory === 'benchmark') {
    return 'benchmark';
  }

  if (
    rawCategory === 'big_creator' ||
    rawCategory === 'competitor' ||
    rawCategory === 'topic_source'
  ) {
    return 'benchmark';
  }

  if (rawCategory === 'potential_mutual') {
    return 'peer';
  }

  return null;
}
