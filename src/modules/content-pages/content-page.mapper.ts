import type { ContentPage } from './content-page.model.js';

export interface ContentPageDto {
  id: string;
  pageType: ContentPage['pageType'];
  title: string;
  sections: ContentPage['sections'];
  version: number;
  status: ContentPage['status'];
  changeSummary?: string;
  effectiveAt?: string;
  publishedAt?: string;
  publishedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export function toContentPageDto(page: ContentPage): ContentPageDto {
  return {
    id: page._id.toString(),
    pageType: page.pageType,
    title: page.title,
    sections: [...page.sections].sort((left, right) => left.order - right.order),
    version: page.version,
    status: page.status,
    ...(page.changeSummary ? { changeSummary: page.changeSummary } : {}),
    ...(page.effectiveAt ? { effectiveAt: page.effectiveAt.toISOString() } : {}),
    ...(page.publishedAt ? { publishedAt: page.publishedAt.toISOString() } : {}),
    ...(page.publishedBy ? { publishedBy: page.publishedBy.toString() } : {}),
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  };
}
