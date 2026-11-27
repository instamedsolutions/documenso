import type { OrganisationClaim } from '@prisma/client';

import type { TOwnerNotificationTarget } from '../../utils/owner-notification';
import { assertOrganisationRatesAndLimits } from './assert-organisation-rates-and-limits';

/**
 * Meter the e-mails sent to a custom owner notification list against the organisation
 * email quota. The owner itself is never metered (legacy behaviour), but custom addresses
 * are arbitrary and never agreed to be part of the document, like a CC recipient.
 *
 * Returns the recipients that may be e-mailed; the ones over the limit are dropped.
 */
export const meterOwnerNotificationRecipients = async ({
  target,
  organisationId,
  organisationClaim,
  onLimitExceeded,
}: {
  target: TOwnerNotificationTarget;
  organisationId: string;
  organisationClaim: OrganisationClaim;
  onLimitExceeded?: (dropped: TOwnerNotificationTarget['recipients']) => void;
}): Promise<TOwnerNotificationTarget['recipients']> => {
  if (!target.isCustom) {
    return target.recipients;
  }

  const allowed: TOwnerNotificationTarget['recipients'] = [];

  for (const [index, recipient] of target.recipients.entries()) {
    try {
      await assertOrganisationRatesAndLimits({
        organisationId,
        organisationClaim,
        type: 'email',
        count: 1,
      });
    } catch (_err) {
      onLimitExceeded?.(target.recipients.slice(index));

      break;
    }

    allowed.push(recipient);
  }

  return allowed;
};
