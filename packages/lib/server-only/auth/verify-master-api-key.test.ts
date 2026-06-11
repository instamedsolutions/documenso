import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getMasterApiKey, isMasterApiKeyEnabled, verifyMasterApiKey } from './verify-master-api-key';

describe('verifyMasterApiKey', () => {
  const ORIGINAL_KEY = process.env.NEXT_PRIVATE_MASTER_API_KEY;

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.NEXT_PRIVATE_MASTER_API_KEY;
    } else {
      process.env.NEXT_PRIVATE_MASTER_API_KEY = ORIGINAL_KEY;
    }
  });

  describe('when no master API key is configured', () => {
    beforeEach(() => {
      delete process.env.NEXT_PRIVATE_MASTER_API_KEY;
    });

    it('reports the feature as disabled', () => {
      expect(getMasterApiKey()).toBeNull();
      expect(isMasterApiKeyEnabled()).toBe(false);
    });

    it('rejects every candidate', () => {
      expect(verifyMasterApiKey('anything')).toBe(false);
      expect(verifyMasterApiKey('')).toBe(false);
      expect(verifyMasterApiKey(null)).toBe(false);
      expect(verifyMasterApiKey(undefined)).toBe(false);
    });
  });

  describe('when the master API key is blank/whitespace', () => {
    it('treats it as disabled', () => {
      process.env.NEXT_PRIVATE_MASTER_API_KEY = '   ';

      expect(isMasterApiKeyEnabled()).toBe(false);
      expect(verifyMasterApiKey('   ')).toBe(false);
    });
  });

  describe('when a master API key is configured', () => {
    beforeEach(() => {
      process.env.NEXT_PRIVATE_MASTER_API_KEY = 'super-secret-master-key';
    });

    it('reports the feature as enabled', () => {
      expect(getMasterApiKey()).toBe('super-secret-master-key');
      expect(isMasterApiKeyEnabled()).toBe(true);
    });

    it('accepts the exact key', () => {
      expect(verifyMasterApiKey('super-secret-master-key')).toBe(true);
    });

    it('rejects an incorrect key', () => {
      expect(verifyMasterApiKey('wrong-key')).toBe(false);
    });

    it('rejects keys that only differ by length (prefix)', () => {
      expect(verifyMasterApiKey('super-secret-master-ke')).toBe(false);
      expect(verifyMasterApiKey('super-secret-master-key-extra')).toBe(false);
    });

    it('rejects empty / nullish candidates', () => {
      expect(verifyMasterApiKey('')).toBe(false);
      expect(verifyMasterApiKey(null)).toBe(false);
      expect(verifyMasterApiKey(undefined)).toBe(false);
    });

    it('ignores surrounding whitespace in the configured key', () => {
      process.env.NEXT_PRIVATE_MASTER_API_KEY = '  padded-key  ';

      expect(getMasterApiKey()).toBe('padded-key');
      expect(verifyMasterApiKey('padded-key')).toBe(true);
    });
  });
});
