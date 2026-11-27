import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_DOCUMENT_EMAIL_SETTINGS } from '../../../types/document-email';

const {
  createElementMock,
  envelopeFindFirstMock,
  getEmailContextMock,
  recipientFindFirstMock,
  renderEmailWithI18NMock,
  sendMailMock,
} = vi.hoisted(() => ({
  createElementMock: vi.fn((..._args: unknown[]) => null),
  envelopeFindFirstMock: vi.fn(),
  getEmailContextMock: vi.fn(),
  recipientFindFirstMock: vi.fn(),
  renderEmailWithI18NMock: vi.fn(),
  sendMailMock: vi.fn(),
}));

vi.mock('react', () => ({ createElement: createElementMock }));
vi.mock('@lingui/core/macro', () => ({
  msg: (strings: TemplateStringsArray, ...values: string[]) => String.raw({ raw: strings }, ...values),
}));
vi.mock('@prisma/client', () => ({ EnvelopeType: { DOCUMENT: 'DOCUMENT' } }));
vi.mock('@documenso/prisma', () => ({
  prisma: { envelope: { findFirst: envelopeFindFirstMock }, recipient: { findFirst: recipientFindFirstMock } },
}));
vi.mock('@documenso/email/templates/document-recipient-signed', () => ({
  DocumentRecipientSignedEmailTemplate: 'signed-template',
}));
vi.mock('@documenso/email/templates/recipient-expired', () => ({ RecipientExpiredTemplate: 'expired-template' }));
vi.mock('../../../client-only/providers/i18n-server', () => ({
  getI18nInstance: vi.fn().mockResolvedValue({ _: (value: string) => value }),
}));
vi.mock('../../../constants/app', () => ({ NEXT_PUBLIC_WEBAPP_URL: () => 'https://documenso.test' }));
vi.mock('../../../server-only/email/get-email-context', () => ({ getEmailContext: getEmailContextMock }));
vi.mock('../../../utils/envelope', () => ({ unsafeBuildEnvelopeIdQuery: vi.fn(() => ({ id: 'envelope-1' })) }));
vi.mock('../../../utils/recipients', () => ({ isRecipientEmailValidForSending: vi.fn(() => true) }));
vi.mock('../../../utils/render-email-with-i18n', () => ({ renderEmailWithI18N: renderEmailWithI18NMock }));
vi.mock('../../../utils/teams', () => ({ formatDocumentsPath: vi.fn(() => '/documents') }));

import { run as runExpired } from './send-owner-recipient-expired-email.handler';
import { run as runSigned } from './send-recipient-signed-email.handler';

const recipient = { id: 2, email: 'patient@example.com', name: 'Patient', role: 'SIGNER' };

const buildEnvelope = (
  emailSettings: Partial<typeof DEFAULT_DOCUMENT_EMAIL_SETTINGS>,
  ownerNotification: { ownerNotificationEmails?: string[] | null; ownerNotificationLink?: string | null } = {},
) => ({
  id: 'envelope-1',
  title: 'Doc',
  teamId: 1,
  recipients: [recipient],
  user: { id: 10, email: 'owner@example.com', name: 'Owner' },
  team: { teamEmail: null, name: 'Team', url: 'team' },
  documentMeta: { emailSettings: { ...DEFAULT_DOCUMENT_EMAIL_SETTINGS, ...emailSettings }, ...ownerNotification },
});

const signed = () =>
  runSigned({
    payload: { documentId: 1, recipientId: 2 },
    io: { runTask: async (_id: string, fn: () => Promise<unknown>) => fn() },
  } as unknown as Parameters<typeof runSigned>[0]);

const expired = () =>
  runExpired({
    payload: { envelopeId: 'envelope-1', recipientId: 2 },
    io: { runTask: async (_id: string, fn: () => Promise<unknown>) => fn() },
  } as unknown as Parameters<typeof runExpired>[0]);

const sentTo = () => sendMailMock.mock.calls.map(([mail]) => mail.to.address);

describe.each([
  { name: 'recipientSigned', flag: 'recipientSigned', runJob: signed, template: 'signed-template' },
  { name: 'ownerRecipientExpired', flag: 'ownerRecipientExpired', runJob: expired, template: 'expired-template' },
])('owner notification recipients: $name', ({ flag, runJob, template }) => {
  const setEnvelope = (
    settings: Partial<typeof DEFAULT_DOCUMENT_EMAIL_SETTINGS>,
    ownerNotification?: Parameters<typeof buildEnvelope>[1],
  ) => {
    const envelope = buildEnvelope(settings, ownerNotification);
    envelopeFindFirstMock.mockResolvedValue(envelope);
    recipientFindFirstMock.mockResolvedValue(recipient);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getEmailContextMock.mockResolvedValue({
      branding: undefined,
      emailLanguage: 'en',
      senderEmail: 'sender@example.com',
      emailsDisabled: false,
      emailTransport: { sendMail: sendMailMock },
    });
    renderEmailWithI18NMock.mockResolvedValue('rendered');
  });

  it('notifies the owner when the list is null', async () => {
    setEnvelope({}, { ownerNotificationEmails: null });
    await runJob();

    expect(sentTo()).toEqual(['owner@example.com']);
  });

  it('notifies the configured addresses, one e-mail each', async () => {
    setEnvelope({}, { ownerNotificationEmails: ['a@example.com', 'b@example.com'] });
    await runJob();

    expect(sentTo()).toEqual(['a@example.com', 'b@example.com']);
  });

  it('notifies nobody for an empty list', async () => {
    setEnvelope({}, { ownerNotificationEmails: [] });
    await runJob();

    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('notifies nobody when the flag is disabled, whatever the list', async () => {
    setEnvelope({ [flag]: false }, { ownerNotificationEmails: ['a@example.com'] });
    await runJob();

    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('passes the custom link to the template', async () => {
    setEnvelope({}, { ownerNotificationEmails: ['a@example.com'], ownerNotificationLink: 'https://app.test/docs' });
    await runJob();

    const props = createElementMock.mock.calls.find(([type]) => type === template)?.[1] as {
      documentLink?: string;
    };
    expect(props.documentLink).toBe('https://app.test/docs');
  });
});
