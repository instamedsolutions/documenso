import { describe, expect, it } from 'vitest';

import { ZDocumentMetaCreateSchema } from '../types/document-meta';
import { resolveOwnerNotification } from './owner-notification';

const owner = { email: 'owner@example.com', name: 'Owner' };

describe('resolveOwnerNotification', () => {
  it('targets the owner when the list is null, absent or invalid', () => {
    for (const documentMeta of [null, undefined, { ownerNotificationEmails: null, ownerNotificationLink: null }]) {
      const result = resolveOwnerNotification({ owner, documentMeta });
      expect(result.isCustom).toBe(false);
      expect(result.recipients).toEqual([{ name: 'Owner', address: 'owner@example.com' }]);
      expect(result.link).toBeNull();
    }
  });

  it('targets exactly the configured addresses, deduplicated', () => {
    const result = resolveOwnerNotification({
      owner,
      documentMeta: {
        ownerNotificationEmails: ['a@example.com', 'a@example.com', 'b@example.com'],
        ownerNotificationLink: 'https://example.com/x',
      },
    });

    expect(result.isCustom).toBe(true);
    expect(result.recipients.map((r) => r.address)).toEqual(['a@example.com', 'b@example.com']);
    expect(result.link).toBe('https://example.com/x');
  });

  it('targets nobody for an empty list', () => {
    const result = resolveOwnerNotification({
      owner,
      documentMeta: { ownerNotificationEmails: [], ownerNotificationLink: null },
    });

    expect(result.isCustom).toBe(true);
    expect(result.recipients).toEqual([]);
  });
});

describe('meta schema', () => {
  it('validates the owner notification fields', () => {
    expect(ZDocumentMetaCreateSchema.safeParse({}).success).toBe(true);
    expect(
      ZDocumentMetaCreateSchema.safeParse({ ownerNotificationEmails: null, ownerNotificationLink: null }).success,
    ).toBe(true);
    expect(
      ZDocumentMetaCreateSchema.safeParse({
        ownerNotificationEmails: ['a@example.com'],
        ownerNotificationLink: 'https://example.com/x',
      }).success,
    ).toBe(true);
    expect(ZDocumentMetaCreateSchema.safeParse({ ownerNotificationEmails: ['nope'] }).success).toBe(false);
    expect(
      ZDocumentMetaCreateSchema.safeParse({
        ownerNotificationEmails: Array.from({ length: 21 }, (_, i) => `a${i}@example.com`),
      }).success,
    ).toBe(false);
    expect(ZDocumentMetaCreateSchema.safeParse({ ownerNotificationLink: 'javascript:alert(1)' }).success).toBe(false);
    expect(ZDocumentMetaCreateSchema.safeParse({ ownerNotificationLink: 'not a url' }).success).toBe(false);
  });
});
