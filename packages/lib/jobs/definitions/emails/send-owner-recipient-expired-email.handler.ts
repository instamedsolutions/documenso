import { RecipientExpiredTemplate } from '@documenso/email/templates/recipient-expired';
import { prisma } from '@documenso/prisma';
import { msg } from '@lingui/core/macro';
import { createElement } from 'react';

import { getI18nInstance } from '../../../client-only/providers/i18n-server';
import { NEXT_PUBLIC_WEBAPP_URL } from '../../../constants/app';
import { getEmailContext } from '../../../server-only/email/get-email-context';
import { meterOwnerNotificationRecipients } from '../../../server-only/rate-limit/meter-owner-notification-recipients';
import { extractDerivedDocumentEmailSettings } from '../../../types/document-email';
import { resolveOwnerNotification } from '../../../utils/owner-notification';
import { renderEmailWithI18N } from '../../../utils/render-email-with-i18n';
import { formatDocumentsPath } from '../../../utils/teams';
import type { JobRunIO } from '../../client/_internal/job';
import type { TSendOwnerRecipientExpiredEmailJobDefinition } from './send-owner-recipient-expired-email';

export const run = async ({ payload, io }: { payload: TSendOwnerRecipientExpiredEmailJobDefinition; io: JobRunIO }) => {
  const { recipientId, envelopeId } = payload;

  const envelope = await prisma.envelope.findFirst({
    where: {
      id: envelopeId,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      documentMeta: true,
      team: {
        select: {
          teamEmail: true,
          name: true,
          url: true,
        },
      },
    },
  });

  if (!envelope) {
    throw new Error(`Envelope ${envelopeId} not found`);
  }

  const recipient = await prisma.recipient.findFirst({
    where: {
      id: recipientId,
      envelopeId,
    },
  });

  if (!recipient) {
    throw new Error(`Recipient ${recipientId} not found on envelope ${envelopeId}`);
  }

  const { documentMeta, user: documentOwner } = envelope;

  const isEmailEnabled = extractDerivedDocumentEmailSettings(documentMeta).ownerRecipientExpired;

  if (!isEmailEnabled) {
    return;
  }

  const { branding, emailLanguage, senderEmail, emailsDisabled, emailTransport, organisationId, claims } =
    await getEmailContext({
      emailType: 'RECIPIENT',
      source: {
        type: 'team',
        teamId: envelope.teamId,
      },
      meta: documentMeta,
    });

  // Don't send any emails if the organisation has email sending disabled.
  if (emailsDisabled) {
    return;
  }

  const i18n = await getI18nInstance(emailLanguage);

  const ownerNotification = resolveOwnerNotification({ owner: documentOwner, documentMeta });

  if (ownerNotification.recipients.length === 0) {
    return;
  }

  const documentLink =
    ownerNotification.link ?? `${NEXT_PUBLIC_WEBAPP_URL()}${formatDocumentsPath(envelope.team.url)}/${envelope.id}`;

  const template = createElement(RecipientExpiredTemplate, {
    documentName: envelope.title,
    recipientName: recipient.name || recipient.email,
    recipientEmail: recipient.email,
    documentLink,
    assetBaseUrl: NEXT_PUBLIC_WEBAPP_URL(),
  });

  await io.runTask('send-owner-recipient-expired-email', async () => {
    const [html, text] = await Promise.all([
      renderEmailWithI18N(template, { lang: emailLanguage, branding }),
      renderEmailWithI18N(template, {
        lang: emailLanguage,
        branding,
        plainText: true,
      }),
    ]);

    const ownerRecipientsToNotify = await meterOwnerNotificationRecipients({
      target: ownerNotification,
      organisationId,
      organisationClaim: claims,
      onLimitExceeded: (dropped) =>
        io.logger.warn({
          msg: 'Owner recipient expired emails dropped: org email limit exceeded',
          organisationId,
          envelopeId: envelope.id,
          droppedCount: dropped.length,
        }),
    });

    await Promise.all(
      ownerRecipientsToNotify.map(async (to) =>
        emailTransport.sendMail({
          to,
          from: senderEmail,
          subject: i18n._(
            msg`Signing window expired for "${recipient.name || recipient.email}" on "${envelope.title}"`,
          ),
          html,
          text,
        }),
      ),
    );
  });
};
