import { ConflictError } from '../../common/errors/conflict-error.js';
import { auditService } from '../audit/audit.service.js';
import { ContentPageStatus, ContentPageType } from '../content-pages/content-page.constants.js';
import { contentPageRepository } from '../content-pages/content-page.repository.js';
import type { LegalConsent } from './legal-consent.model.js';
import { legalConsentRepository } from './legal-consent.repository.js';
import type { AcceptLegalConsentInput } from './legal-consent.validation.js';

interface ConsentContext {
  ipAddress?: string;
  userAgent?: string;
}

interface InitialLegalVersions {
  termsConditionsVersion: number;
  privacyPolicyVersion: number;
}

export class LegalConsentService {
  async assertCurrentVersions(input: InitialLegalVersions): Promise<void> {
    const [terms, privacy] = await Promise.all([
      contentPageRepository.findPublished(ContentPageType.TERMS_CONDITIONS),
      contentPageRepository.findPublished(ContentPageType.PRIVACY_POLICY),
    ]);
    const fieldErrors = [
      ...(terms?.version === input.termsConditionsVersion
        ? []
        : [{
            field: 'legalConsents.termsConditionsVersion',
            message: 'Please review the latest Terms and Conditions.',
            code: 'LEGAL_VERSION_NOT_CURRENT',
          }]),
      ...(privacy?.version === input.privacyPolicyVersion
        ? []
        : [{
            field: 'legalConsents.privacyPolicyVersion',
            message: 'Please review the latest Privacy Policy.',
            code: 'LEGAL_VERSION_NOT_CURRENT',
          }]),
    ];

    if (fieldErrors.length > 0) {
      throw new ConflictError('One or more legal document versions are no longer current.', {
        code: 'LEGAL_VERSION_NOT_CURRENT',
        fieldErrors,
      });
    }
  }

  async acceptInitialConsents(
    userId: string,
    versions: InitialLegalVersions,
    context: ConsentContext,
  ): Promise<void> {
    await Promise.all([
      this.accept(
        userId,
        {
          documentType: ContentPageType.TERMS_CONDITIONS,
          version: versions.termsConditionsVersion,
        },
        context,
      ),
      this.accept(
        userId,
        {
          documentType: ContentPageType.PRIVACY_POLICY,
          version: versions.privacyPolicyVersion,
        },
        context,
      ),
    ]);
  }

  async accept(
    userId: string,
    input: AcceptLegalConsentInput,
    context: ConsentContext,
  ) {
    const page = await contentPageRepository.findPublished(input.documentType);

    if (!page || page.status !== ContentPageStatus.PUBLISHED || page.version !== input.version) {
      throw new ConflictError('The legal document version is no longer current.', {
        code: 'LEGAL_VERSION_NOT_CURRENT',
        fieldErrors: [
          {
            field: 'version',
            message: 'Please review and accept the latest published version.',
            code: 'LEGAL_VERSION_NOT_CURRENT',
          },
        ],
      });
    }

    const consent = await legalConsentRepository.createIdempotently({
      userId,
      documentType: input.documentType,
      contentPageId: page._id,
      version: page.version,
      acceptedAt: new Date(),
      ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
      ...(context.userAgent ? { userAgent: context.userAgent } : {}),
    });

    await auditService.record({
      actorUserId: userId,
      action: `legal_consent.accept.${input.documentType}`,
      outcome: 'success',
    });

    return { consent: toConsentDto(consent) };
  }

  async getCurrentStatus(userId: string) {
    const [privacyPage, termsPage, consents] = await Promise.all([
      contentPageRepository.findPublished(ContentPageType.PRIVACY_POLICY),
      contentPageRepository.findPublished(ContentPageType.TERMS_CONDITIONS),
      legalConsentRepository.findForUser(userId),
    ]);
    const accepted = new Set(consents.map((item) => `${item.documentType}:${item.version}`));

    return {
      documents: [privacyPage, termsPage]
        .filter((page) => page !== null)
        .map((page) => ({
          documentType: page.pageType,
          version: page.version,
          effectiveAt: page.effectiveAt?.toISOString() ?? null,
          accepted: accepted.has(`${page.pageType}:${page.version}`),
        })),
    };
  }
}

function toConsentDto(consent: LegalConsent) {
  return {
    id: consent._id.toString(),
    documentType: consent.documentType,
    version: consent.version,
    acceptedAt: consent.acceptedAt.toISOString(),
  };
}

export const legalConsentService = new LegalConsentService();
