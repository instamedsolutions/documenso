import { describe, expect, it } from 'vitest';

import { DEFAULT_DOCUMENT_EMAIL_SETTINGS, ZDocumentEmailSettingsSchema } from './document-email';

describe('document email settings', () => {
  it('defaults to attaching completed documents', () => {
    expect(ZDocumentEmailSettingsSchema.parse({})).toEqual(DEFAULT_DOCUMENT_EMAIL_SETTINGS);
  });

  it('supports explicitly disabling completed document attachments', () => {
    expect(
      ZDocumentEmailSettingsSchema.parse({
        attachCompletedDocument: false,
      }),
    ).toMatchObject({
      ...DEFAULT_DOCUMENT_EMAIL_SETTINGS,
      attachCompletedDocument: false,
    });
  });
});
