import type {
  ArticleRecognitionDebugEntry,
  ContentFormat,
  ContentFormatGroup,
  ContentRecognitionStatus,
  ShortPostRecognitionDebugEntry,
} from '../storage/schema';

export type ComposerActionType = 'original' | 'reply' | 'quote';

export interface ComposerMutationEventDetail {
  actionType: ComposerActionType;
  endpoint: string;
  timestamp: string;
  requestKind: 'fetch' | 'xhr';
  signature: string;
  targetHandle?: string | null;
  contentFormat?: ContentFormat | null;
  contentFormatGroup?: ContentFormatGroup | null;
  contentRecognitionStatus?: ContentRecognitionStatus;
}

export interface CandidateAccountImportEventDetail {
  source: 'from_following' | 'from_followers';
  items: Array<{
    handle: string;
    displayName: string;
    followersCount: number | null;
    followingCount: number | null;
    verified: boolean;
    bio: string;
    capturedAt: string;
  }>;
}

export type ArticleDebugEventDetail = ArticleRecognitionDebugEntry;
export type ShortPostDebugEventDetail = ShortPostRecognitionDebugEntry;
