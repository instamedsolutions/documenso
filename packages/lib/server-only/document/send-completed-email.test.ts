import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_DOCUMENT_EMAIL_SETTINGS } from '../../types/document-email';

const {
  getEmailContextMock,
  getFileServerSideMock,
  getI18nInstanceMock,
  isRecipientEmailValidForSendingMock,
  mailerSendMailMock,
  prismaDocumentAuditLogCreateMock,
  prismaEnvelopeFindUniqueMock,
  renderEmailWithI18NMock,
} = vi.hoisted(() => ({
  getEmailContextMock: vi.fn(),
  getFileServerSideMock: vi.fn(),
  getI18nInstanceMock: vi.fn(),
  isRecipientEmailValidForSendingMock: vi.fn(),
  mailerSendMailMock: vi.fn(),
  prismaDocumentAuditLogCreateMock: vi.fn(),
  prismaEnvelopeFindUniqueMock: vi.fn(),
  renderEmailWithI18NMock: vi.fn(),
}));

vi.mock('@documenso/email/mailer', () => ({
  mailer: {
    sendMail: mailerSendMailMock,
  },
}));

vi.mock('@lingui/core/macro', () => ({
  msg: (strings: TemplateStringsArray, ...values: string[]) => String.raw({ raw: strings }, ...values),
}));

vi.mock('@prisma/client', () => ({
  DocumentSource: {
    DOCUMENT: 'DOCUMENT',
    TEMPLATE: 'TEMPLATE',
    TEMPLATE_DIRECT_LINK: 'TEMPLATE_DIRECT_LINK',
  },
  EnvelopeType: {
    DOCUMENT: 'DOCUMENT',
  },
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    envelope: {
      findUnique: prismaEnvelopeFindUniqueMock,
    },
    documentAuditLog: {
      create: prismaDocumentAuditLogCreateMock,
    },
  },
}));

vi.mock('@documenso/email/templates/document-completed', () => ({
  DocumentCompletedEmailTemplate: () => null,
}));

vi.mock('../../types/document-audit-logs', () => ({
  DOCUMENT_AUDIT_LOG_TYPE: {
    EMAIL_SENT: 'EMAIL_SENT',
  },
}));

vi.mock('../../client-only/providers/i18n-server', () => ({
  getI18nInstance: getI18nInstanceMock,
}));

vi.mock('../email/get-email-context', () => ({
  getEmailContext: getEmailContextMock,
}));

vi.mock('../../universal/upload/get-file.server', () => ({
  getFileServerSide: getFileServerSideMock,
}));

vi.mock('../../utils/render-email-with-i18n', () => ({
  renderEmailWithI18N: renderEmailWithI18NMock,
}));

vi.mock('../../utils/recipients', () => ({
  isRecipientEmailValidForSending: isRecipientEmailValidForSendingMock,
}));

vi.mock('../../utils/teams', () => ({
  formatDocumentsPath: vi.fn(() => '/documents'),
}));

vi.mock('../../utils/document-audit-logs', () => ({
  createDocumentAuditLogData: vi.fn((data) => data),
}));

import { sendCompletedEmail } from './send-completed-email';

const buildEnvelope = (emailSettings: Partial<typeof DEFAULT_DOCUMENT_EMAIL_SETTINGS> = {}) => ({
  id: 1,
  title: 'Patient Intake',
  teamId: 1,
  internalVersion: 1,
  source: 'DOCUMENT_UPLOAD',
  recipients: [
    {
      id: 2,
      email: 'patient@example.com',
      name: 'Patient',
      role: 'SIGNER',
      token: 'recipient-token',
    },
  ],
  user: {
    id: 10,
    email: 'owner@example.com',
    name: 'Owner',
  },
  team: {
    id: 1,
    url: 'team-url',
  },
  envelopeItems: [
    {
      title: 'Patient Intake',
      documentData: {
        type: 'S3_PATH',
        id: 'doc-1',
        data: 'documents/doc-1.pdf',
      },
    },
  ],
  documentMeta: {
    emailSettings: {
      ...DEFAULT_DOCUMENT_EMAIL_SETTINGS,
      ...emailSettings,
    },
  },
});

describe('sendCompletedEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getEmailContextMock.mockResolvedValue({
      branding: undefined,
      emailLanguage: 'en',
      senderEmail: 'sender@example.com',
      replyToEmail: 'reply@example.com',
    });
    getI18nInstanceMock.mockResolvedValue({
      _: (value: string) => value,
    });
    renderEmailWithI18NMock.mockResolvedValue('rendered-email');
    mailerSendMailMock.mockResolvedValue(undefined);
    prismaDocumentAuditLogCreateMock.mockResolvedValue(undefined);
    getFileServerSideMock.mockResolvedValue(new Uint8Array([1, 2, 3]));
    isRecipientEmailValidForSendingMock.mockReturnValue(true);
  });

  it('does not attach completed documents when disabled', async () => {
    prismaEnvelopeFindUniqueMock.mockResolvedValue(
      buildEnvelope({
        attachCompletedDocument: false,
        ownerDocumentCompleted: false,
      }),
    );

    await sendCompletedEmail({
      id: {
        type: 'documentId',
        id: 1,
      },
    });

    expect(getFileServerSideMock).not.toHaveBeenCalled();
    expect(mailerSendMailMock).toHaveBeenCalledTimes(1);
    expect(mailerSendMailMock).toHaveBeenCalledWith(
      expect.not.objectContaining({
        attachments: expect.anything(),
      }),
    );
  });

  it('does not fetch completed documents when no completion emails are enabled', async () => {
    prismaEnvelopeFindUniqueMock.mockResolvedValue(
      buildEnvelope({
        documentCompleted: false,
        ownerDocumentCompleted: false,
      }),
    );

    await sendCompletedEmail({
      id: {
        type: 'documentId',
        id: 1,
      },
    });

    expect(getEmailContextMock).not.toHaveBeenCalled();
    expect(getFileServerSideMock).not.toHaveBeenCalled();
    expect(mailerSendMailMock).not.toHaveBeenCalled();
    expect(prismaDocumentAuditLogCreateMock).not.toHaveBeenCalled();
  });
});
