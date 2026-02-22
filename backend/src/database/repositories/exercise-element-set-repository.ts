import {
    ElementSetVisibility,
    ExerciseElementObjectUnion,
    ExerciseState,
    Marketplace,
} from 'fuesim-digital-shared';
import {
    elementTemplateToSetMappingTable,
    exerciseElementSetTable,
    exerciseElementTemplateTable,
    latestExerciseElementTemplateView,
} from '../schema.js';
import { BaseRepository } from './base-repository.js';
import { eq, desc, getTableColumns, sql, and } from 'drizzle-orm';

export class ExerciseElementSetRepository extends BaseRepository {
    public async createExerciseSet(title: string, owner: string) {
        console.log("Creating exercise set with title:", title, "for owner:", owner);
        const result = await this.databaseConnection
            .insert(exerciseElementSetTable)
            .values({
                title,
                description: '',
                stateVersion: ExerciseState.currentStateVersion,
                version: 1,
                owner,
                visibility: 'private',
            })
            .returning();

        return this.onlySingle(result);
    }

    public async createExerciseSetVersion(entityId: Marketplace.Set.EntityId) {
        const latestVersion = this.onlySingleStrict(await this.databaseConnection
            .select()
            .from(exerciseElementSetTable)
            .where(eq(exerciseElementSetTable.entityId, entityId)));

        const newVersion = latestVersion.version + 1;

        const result = await this.databaseConnection
            .insert(exerciseElementSetTable)
            .values({
                ...latestVersion,
                version: newVersion,
            })
            .returning();

        return this.onlySingle(result);
    }

    public async createExerciseObjectVersion(
        data: {
            content: ExerciseElementObjectUnion,
            version: number,
            entityId?: Marketplace.Element.EntityId
        }
    ) {
        const result = await this.databaseConnection
            .insert(exerciseElementTemplateTable)
            .values({
                version: data.version,
                stateVersion: ExerciseState.currentStateVersion,
                title: data.content.name,
                description: '',
                content: data.content,
                entityId: data.entityId,
                createdBy: "test-owner", //TODO: @Quixelation
            })
            .returning();

        return this.onlySingle(result);
    }

    public async addExerciseObjectToSet(
        elementVersionId: Marketplace.Element.VersionId,
        setVersionId: Marketplace.Set.VersionId,
    ) {
        const element = this.onlySingleStrict(await this.databaseConnection.select().from(exerciseElementTemplateTable).where(
            eq(exerciseElementTemplateTable.versionId, elementVersionId)
        ));

        const set = this.onlySingleStrict(await this.databaseConnection.select().from(exerciseElementSetTable).where(
            eq(exerciseElementSetTable.versionId, setVersionId)
        ));

        await this.databaseConnection.delete(elementTemplateToSetMappingTable)
            .where(
                and(
                    eq(elementTemplateToSetMappingTable.setVersionId, setVersionId),
                    eq(elementTemplateToSetMappingTable.elementEntityId, element.entityId)
                )
            )

        return await this.databaseConnection
            .insert(elementTemplateToSetMappingTable)
            .values({
                setEntityId: set.entityId,
                setVersionId,
                elementEntityId: element.entityId,
                elementVersionId,
            }).returning();
    }

    public async copyReferencesBetweenSets(
        sourceSetVersionId: Marketplace.Set.VersionId,
        targetSetVersionId: Marketplace.Set.VersionId
    ) {
        this.databaseConnection.insert(elementTemplateToSetMappingTable).select(
            this.databaseConnection.select(
                {
                    // INFO: This is order-sensitive, based on the order in the schema
                    // and requires ALL fields (even defaulted ones) to be selected
                    setEntityId: elementTemplateToSetMappingTable.setEntityId,
                    setVersionId: sql<string>`${targetSetVersionId}`.as('setVersionId'),
                    elementEntityId: elementTemplateToSetMappingTable.elementEntityId,
                    elementVersionId: elementTemplateToSetMappingTable.elementVersionId,
                } satisfies Record<keyof typeof elementTemplateToSetMappingTable.$inferInsert, any>
            ).from(elementTemplateToSetMappingTable).where(
                eq(
                    elementTemplateToSetMappingTable.setVersionId,
                    sourceSetVersionId
                ))
        )
    }

    public async copyElementsBetweenSets(
        sourceSetVersionId: Marketplace.Set.VersionId,
        targetSetVersionId: Marketplace.Set.VersionId
    ) {
        await this.databaseConnection.transaction(async (tx) => {
            const sourceSet = this.onlySingleStrict(
                await tx
                    .select()
                    .from(exerciseElementSetTable)
                    .where(
                        eq(
                            exerciseElementSetTable.versionId,
                            targetSetVersionId
                        )
                    )
            );

            await tx.insert(exerciseElementTemplateTable).select(
                tx
                    .select({
                        // INFO: This is order-sensitive, based on the order in the schema
                        // and requires ALL fields (even defaulted ones) to be selected
                        versionId: sql`'element_version_' || uuid_generate_v4()`.as('versionId'),
                        entityId: sql`'element_entity_' || uuid_generate_v4()`.as('entityId'),
                        version: sql<number>`1`.as('version'),
                        stateVersion: latestExerciseElementTemplateView.stateVersion,
                        createdBy: sql<string>`${sourceSet.owner}`.as('createdBy'),
                        createdAt: sql`now()`.as('createdAt'),
                        title: latestExerciseElementTemplateView.title,
                        description: latestExerciseElementTemplateView.description,
                        content: latestExerciseElementTemplateView.content,
                    } satisfies Record<keyof typeof exerciseElementTemplateTable.$inferInsert, any>)
                    .from(latestExerciseElementTemplateView).innerJoin(elementTemplateToSetMappingTable,
                        eq(
                            latestExerciseElementTemplateView.versionId,
                            elementTemplateToSetMappingTable.elementVersionId
                        )
                    )
                    .where(
                        eq(
                            elementTemplateToSetMappingTable.setVersionId,
                            sourceSetVersionId
                        )
                    )
            );
        });
    }

    public async getExerciseElementSetByVersionId(
        versionId: Marketplace.Set.VersionId
    ) {
        const result = await this.databaseConnection
            .select()
            .from(exerciseElementSetTable)
            .where(eq(exerciseElementSetTable.versionId, versionId));

        return this.onlySingle(result);
    }

    public async getExerciseElementSetsForUser(userId: string) {
        const result = this.databaseConnection
            .select()
            .from(exerciseElementSetTable)
        //TODO: @Quixelation
        //.where(eq(exerciseElementSetTable.owner, userId));

        return result;
    }


    public async getLatestExerciseElementsForSet(
        setVersionId: Marketplace.Set.VersionId
    ) {
        const result = await this.databaseConnection
            .select()
            .from(latestExerciseElementTemplateView)
            .innerJoin(
                elementTemplateToSetMappingTable,
                eq(
                    latestExerciseElementTemplateView.versionId,
                    elementTemplateToSetMappingTable.elementVersionId
                )
            )
            .where(eq(elementTemplateToSetMappingTable.setVersionId, setVersionId));

        return result.map((row) => (row.latest_exercise_element_templates));
    }

    public async getLatestExerciseElementObjectVersion(
        entityId: Marketplace.Element.EntityId
    ) {
        const result = await this.databaseConnection
            .select()
            .from(latestExerciseElementTemplateView)
            .where(eq(latestExerciseElementTemplateView.entityId, entityId));

        return this.onlySingle(result);
    }

    public async deleteExerciseElementObjectByEntityId(
        entityId: Marketplace.Element.EntityId
    ) {
        await this.databaseConnection
            .delete(exerciseElementTemplateTable)
            .where(eq(exerciseElementTemplateTable.entityId, entityId));
    }

    public async deleteExerciseElementSet(entityId: Marketplace.Set.EntityId) {
        await this.databaseConnection
            .delete(exerciseElementSetTable)
            .where(eq(exerciseElementSetTable.entityId, entityId));
    }

    public async getExerciseElementObjectVersions(
        entityId: Marketplace.Element.EntityId
    ) {
        const result = await this.databaseConnection
            .select()
            .from(exerciseElementTemplateTable)
            .where(eq(exerciseElementTemplateTable.entityId, entityId))
            .orderBy(desc(exerciseElementTemplateTable.version));

        return result;
    }

    public async setExerciseElementSetVisibility(
        setEntityId: Marketplace.Set.EntityId,
        visibility: ElementSetVisibility
    ) {
        console.log(
            `Updating visibility for setEntityId ${setEntityId} to ${visibility}`
        );
        return this.databaseConnection
            .update(exerciseElementSetTable)
            .set({
                visibility,
            })
            .where(eq(exerciseElementSetTable.entityId, setEntityId));
    }

    public async getLatestSetByElementVersionId(elementVersionId: Marketplace.Element.VersionId) {
        return this.onlySingle(
            await this.databaseConnection
                .select(getTableColumns(exerciseElementSetTable))
                .from(exerciseElementSetTable)
                .innerJoin(elementTemplateToSetMappingTable, eq(exerciseElementSetTable.versionId, elementTemplateToSetMappingTable.setVersionId))
                .where(
                    eq(elementTemplateToSetMappingTable.elementVersionId, elementVersionId)
                ).orderBy(desc(exerciseElementSetTable.version)).limit(1))
    }
}
