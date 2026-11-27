import type { DocumentMeta } from '@prisma/client';

import { ZOwnerNotificationEmailsSchema } from '../types/owner-notification';

export type TOwnerNotificationTarget = {
  /** True when the envelope defines its own list (the owner is then not notified implicitly). */
  isCustom: boolean;
  /** One entry per address that must receive the owner e-mails. May be empty. */
  recipients: { name: string; address: string }[];
  /** Custom button link, or null to use the default Documenso link. */
  link: string | null;
};

/**
 * Resolve who receives the owner-targeted e-mails of an envelope (recipient signed,
 * document completed, recipient expired) and which link their button points to.
 *
 * - `ownerNotificationEmails` null/absent: the envelope owner (legacy behaviour).
 * - empty array: nobody.
 * - otherwise: exactly those addresses.
 */
export const resolveOwnerNotification = ({
  owner,
  documentMeta,
}: {
  owner: { email: string; name?: string | null };
  documentMeta?: Pick<DocumentMeta, 'ownerNotificationEmails' | 'ownerNotificationLink'> | null;
}): TOwnerNotificationTarget => {
  const link = documentMeta?.ownerNotificationLink || null;
  const parsedEmails = ZOwnerNotificationEmailsSchema.safeParse(documentMeta?.ownerNotificationEmails);

  if (documentMeta?.ownerNotificationEmails == null || !parsedEmails.success) {
    return {
      isCustom: false,
      recipients: [{ name: owner.name || '', address: owner.email }],
      link,
    };
  }

  return {
    isCustom: true,
    recipients: [...new Set(parsedEmails.data.map((email) => email.trim()))].map((address) => ({
      name: '',
      address,
    })),
    link,
  };
};
