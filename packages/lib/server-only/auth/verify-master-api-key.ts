import { timingSafeEqual } from 'node:crypto';

import { env } from '../../utils/env';

/**
 * Returns the configured master API key, or `null` when the feature is disabled.
 *
 * The master API key is a privileged server-side secret (configured via
 * `NEXT_PRIVATE_MASTER_API_KEY`) that allows trusted backends to provision
 * user accounts directly, bypassing the public signup restrictions.
 */
export const getMasterApiKey = (): string | null => {
  const masterApiKey = env('NEXT_PRIVATE_MASTER_API_KEY')?.trim();

  return masterApiKey ? masterApiKey : null;
};

/**
 * Whether the master API key feature is enabled (i.e. a key is configured).
 */
export const isMasterApiKeyEnabled = (): boolean => getMasterApiKey() !== null;

/**
 * Constant-time comparison of a candidate key against the configured master API key.
 *
 * Returns `false` when the feature is disabled, when no candidate is provided,
 * or when the candidate does not match.
 */
export const verifyMasterApiKey = (candidate: string | null | undefined): boolean => {
  const masterApiKey = getMasterApiKey();

  if (!masterApiKey || !candidate) {
    return false;
  }

  const candidateBuffer = Buffer.from(candidate);
  const masterApiKeyBuffer = Buffer.from(masterApiKey);

  // `timingSafeEqual` throws when the buffers differ in length, so guard first.
  // The early return leaks length only, never the key contents.
  if (candidateBuffer.length !== masterApiKeyBuffer.length) {
    return false;
  }

  return timingSafeEqual(candidateBuffer, masterApiKeyBuffer);
};
