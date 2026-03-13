import * as z from 'zod';
import { Marketplace } from '../http-interfaces.js';

export const versionedElementSchema = z.strictObject({
    entityId: Marketplace.Element.entityIdSchema,
    versionId: Marketplace.Element.versionIdSchema,
});

export type VersionedElementPartial = z.infer<typeof versionedElementSchema>;

export const versionedCollectionSchema = z.strictObject({
    entityId: Marketplace.Set.entityIdSchema,
    versionId: Marketplace.Set.versionIdSchema,
});

export type VersionedCollectionPartial = z.infer<
    typeof versionedCollectionSchema
>;
