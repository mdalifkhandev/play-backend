export enum ContentPageType {
  ABOUT_US = 'about-us',
  PRIVACY_POLICY = 'privacy-policy',
  TERMS_CONDITIONS = 'terms-conditions',
}

export enum ContentPageStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export const PUBLIC_CONTENT_CACHE_TTL_SECONDS = 300;
