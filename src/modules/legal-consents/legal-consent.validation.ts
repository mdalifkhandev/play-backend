import { z } from 'zod';

import { legalDocumentTypes } from './legal-consent.model.js';

export const acceptLegalConsentBodySchema = z.object({
  documentType: z.enum(legalDocumentTypes),
  version: z.coerce.number().int().min(1),
});

export type AcceptLegalConsentInput = z.infer<typeof acceptLegalConsentBodySchema>;
