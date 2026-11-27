import { z } from 'zod';

import { isHttpUrl } from '../utils/is-http-url';
import { zEmail } from '../utils/zod';

export const OWNER_NOTIFICATION_EMAILS_MAX = 20;

export const ZOwnerNotificationEmailsSchema = z
  .array(zEmail())
  .max(OWNER_NOTIFICATION_EMAILS_MAX)
  .describe(
    'Addresses that receive the owner e-mails (recipient signed, document completed, recipient expired) instead of the document owner. An empty array means nobody. Null or absent means the document owner.',
  );

export type TOwnerNotificationEmails = z.infer<typeof ZOwnerNotificationEmailsSchema>;

export const ZOwnerNotificationLinkSchema = z
  .string()
  .url()
  .max(2048)
  .refine(isHttpUrl, { message: 'Link must be an http or https URL' })
  .describe('Link used as the button of the owner e-mails instead of the Documenso dashboard link.');
