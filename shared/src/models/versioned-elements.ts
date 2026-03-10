import * as z from 'zod';
import { Marketplace } from '../index.js';

export const versionedElementSchema = z.strictObject({
    entityId: Marketplace.Element.entityIdSchema.optional(),
    versionId: Marketplace.Element.versionIdSchema.optional()
});

export type VersionedElementPartial = z.infer<typeof versionedElementSchema>;
