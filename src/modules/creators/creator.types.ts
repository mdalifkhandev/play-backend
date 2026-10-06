import type { CreatorApplicationStatus } from './creator-application.model.js';

export type CreatorRequirementKey =
  | 'profile'
  | 'followers'
  | 'views'
  | 'watch_time'
  | 'likes'
  | 'account_age'
  | 'reels'
  | 'guidelines';

export interface CreatorRequirementDTO {
  key: CreatorRequirementKey;
  title: string;
  current: number;
  target: number;
  complete: boolean;
  locked?: boolean;
  enabled?: boolean;
}

export interface CreatorApplicationSummaryDTO {
  id: string;
  status: CreatorApplicationStatus;
  adminReason?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface CreatorEligibilityDTO {
  status: 'not_started' | 'eligible' | 'pending' | 'approved' | 'rejected' | 'held';
  progress: number;
  completedSteps: number;
  totalSteps: number;
  canApply: boolean;
  isCreator: boolean;
  application?: CreatorApplicationSummaryDTO;
  requirements: CreatorRequirementDTO[];
}
