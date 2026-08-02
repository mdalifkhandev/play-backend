export enum SupportCategory {
  ACCOUNT = 'account',
  BILLING = 'billing',
  CONTENT = 'content',
  SAFETY = 'safety',
  TECHNICAL = 'technical',
  OTHER = 'other',
}

export enum SupportRequestStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum SupportPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum SupportMessageSenderType {
  USER = 'user',
  STAFF = 'staff',
}
