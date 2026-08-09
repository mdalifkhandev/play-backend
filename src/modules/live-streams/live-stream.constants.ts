export const LIVE_STREAM_STATUS = {
  SCHEDULED: 'SCHEDULED',
  LIVE: 'LIVE',
  ENDED: 'ENDED',
  CANCELLED: 'CANCELLED',
} as const;

export type LiveStreamStatus = (typeof LIVE_STREAM_STATUS)[keyof typeof LIVE_STREAM_STATUS];

export const LIVE_STREAM_FEED_TAB = {
  ALL: 'all',
  LIVE: 'live',
  WATCH: 'watch',
  RECENT: 'recent',
  TOP_LIKE: 'top_like',
} as const;

export type LiveStreamFeedTab = (typeof LIVE_STREAM_FEED_TAB)[keyof typeof LIVE_STREAM_FEED_TAB];

export const LIVE_STREAM_ROLE = {
  HOST: 'host',
  VIEWER: 'viewer',
} as const;

export type LiveStreamRole = (typeof LIVE_STREAM_ROLE)[keyof typeof LIVE_STREAM_ROLE];
