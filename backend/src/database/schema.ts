import type {
    ActionId,
    ExerciseAction,
    ExerciseId,
    ExerciseState,
    ExerciseTemplateId,
    Marketplace,
    ParticipantKey,
    TrainerKey,
} from 'fuesim-digital-shared';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { and, eq, getTableColumns, max, relations, sql } from 'drizzle-orm';
import {
    char,
    integer,
    pgTable,
    uuid,
    json,
    bigint,
    foreignKey,
    varchar,
    timestamp,
    unique,
    text,
    pgView,
    pgEnum,
    boolean,
    check,
} from 'drizzle-orm/pg-core';

const typedUUID = <T = string>() => uuid().$type<T>();
const defaultUUID = <T = string>() =>
    typedUUID<T>().default(sql`uuid_generate_v4()`);
const defaultPrefixedUUID = (prefix: string) =>
    varchar().$defaultFn(() => `${prefix}_${crypto.randomUUID()}`);

const baseTable = <T>() => ({
    id: defaultUUID<T>().primaryKey().notNull(),
});

export const userTable = pgTable('users', {
    /**
     * This should always be the sub claim from the OIDC provider
     */
    id: varchar().primaryKey().notNull(),
    username: varchar().notNull(),
    displayName: varchar().notNull(),
    updatedAt: timestamp({ mode: 'date', precision: 3 })
        .notNull()
        .defaultNow()
        .$onUpdateFn(() => new Date()),
});

export const sessionTable = pgTable('sessions', {
    id: varchar().primaryKey().notNull(),
    userId: varchar()
        .notNull()
        .references(() => userTable.id, {
            onDelete: 'cascade',
            onUpdate: 'cascade',
        }),
    createdAt: timestamp({ mode: 'date', precision: 3 }).notNull().defaultNow(),
    expiresAt: timestamp({ mode: 'date', precision: 3 }).notNull(),
    accessToken: varchar().notNull(),
});
export type SessionEntry = InferSelectModel<typeof sessionTable>;

export const exerciseTemplateTable = pgTable('exercise_template', {
    ...baseTable<ExerciseTemplateId>(),
    user: varchar()
        .references(() => userTable.id, { onDelete: 'cascade' })
        .notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' })
        .notNull()
        .defaultNow(),
    lastExerciseCreatedAt: timestamp({
        withTimezone: true,
        mode: 'date',
    }),
    name: varchar().notNull(),
    description: text().notNull().default(''),
});
export type ExerciseTemplateEntry = InferSelectModel<
    typeof exerciseTemplateTable
>;
export type ExerciseTemplateInsert = InferInsertModel<
    typeof exerciseTemplateTable
>;

export const exerciseTable = pgTable('exercise_entity', {
    ...baseTable<ExerciseId>(),
    tickCounter: integer().default(0).notNull(),
    initialStateString: json().$type<ExerciseState>().notNull(),
    participantKey: char({ length: 6 }).$type<ParticipantKey>().notNull(),
    trainerKey: char({ length: 8 }).$type<TrainerKey>().notNull(),
    currentStateString: json().$type<ExerciseState>().notNull(),
    stateVersion: integer().notNull(),
    user: varchar().references(() => userTable.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true, mode: 'date' })
        .notNull()
        .defaultNow(),
    lastUsedAt: timestamp({ withTimezone: true, mode: 'date' })
        .notNull()
        .defaultNow(),
    // by setting a templateId this exercise will be an exercise template
    templateId: uuid()
        .$type<ExerciseTemplateId>()
        .references(() => exerciseTemplateTable.id, {
            onDelete: 'cascade',
        }),
    baseTemplateId: uuid()
        .$type<ExerciseTemplateId>()
        .references(() => exerciseTemplateTable.id, {
            onDelete: 'set null',
        }),
});
export type ExerciseEntry = InferSelectModel<typeof exerciseTable>;
export type ExerciseInsert = InferInsertModel<typeof exerciseTable>;

export const actionTable = pgTable(
    'action_entity',
    {
        ...baseTable<ActionId>(),
        emitterId: uuid(),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        index: bigint({ mode: 'number' }).notNull(),
        actionString: json().$type<ExerciseAction>().notNull(),
        exerciseId: typedUUID<ExerciseId>().notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.exerciseId],
            foreignColumns: [exerciseTable.id],
            name: 'FK_180a58767f06b503216ba2b0982',
        })
            .onUpdate('cascade')
            .onDelete('cascade'),
    ]
);
export type ActionEntry = InferSelectModel<typeof actionTable>;

const stateVersionedEntity = <EntityBrand, VersionBrand>(prefix: string) => ({
    versionId: defaultPrefixedUUID(prefix + '_version')
        .unique()
        .notNull()
        .primaryKey()
        .$type<VersionBrand>(),
    entityId: defaultPrefixedUUID(prefix + '_entity')
        .notNull()
        .$type<EntityBrand>(),
    version: integer().notNull(),
    stateVersion: integer().notNull(),
    createdBy: varchar().notNull().default('unknown'), //TODO: @Quixelation - replace with actual user id when creating sets and elements
    createdAt: timestamp({ withTimezone: true, mode: 'date' })
        .defaultNow()
        .notNull(),
});

export const setVisibilityEnum = pgEnum('exercise_set_visibility', [
    'private',
    'public',
]);

export const collectionTable = pgTable(
    'exercise_element_sets',
    {
        ...stateVersionedEntity<
            Marketplace.Set.EntityId,
            Marketplace.Set.VersionId
        >('set'),
        title: varchar().notNull(),
        description: varchar().notNull(),
        visibility: setVisibilityEnum().notNull().default('private'),
        owner: varchar().notNull(),
        draftState: boolean().notNull(),
    },
    (table) => [
        unique('unique_set_version').on(table.entityId, table.version),
        unique('unique_set_id').on(table.entityId, table.versionId),
    ]
);

export const elementCollectionMappingTable = pgTable(
    'exercise_element_to_set_mapping',
    {
        setEntityId: varchar().notNull().$type<Marketplace.Set.EntityId>(),
        setVersionId: varchar()
            .notNull()
            .$type<Marketplace.Set.VersionId>()
            .references(() => collectionTable.versionId, {
                onDelete: 'cascade',
            }),
        elementEntityId: varchar()
            .notNull()
            .$type<Marketplace.Element.EntityId>(),
        elementVersionId: varchar()
            .notNull()
            .$type<Marketplace.Element.VersionId>()
            .references(() => elementTable.versionId, {
                onDelete: 'cascade',
            }),
        isBaseReference: boolean().default(false),
    },
    (table) => [
        unique('unique_element_set_mapping').on(
            table.setVersionId,
            table.elementVersionId
        ),
        unique('unique_element_set_mapping_2').on(
            table.setVersionId,
            table.elementEntityId
        ),
    ]
);

export const collectionDependencyMappingTable = pgTable(
    'collection_dependency_mapping',
    {
        collectionEntityId: varchar()
            .notNull()
            .$type<Marketplace.Set.EntityId>(),
        collectionVersionId: varchar()
            .notNull()
            .$type<Marketplace.Set.VersionId>()
            .references(() => collectionTable.versionId, {
                onDelete: 'cascade',
            }),
        dependentCollectionEntityId: varchar()
            .notNull()
            .$type<Marketplace.Set.EntityId>(),
        dependentCollectionVersionId: varchar()
            .notNull()
            .$type<Marketplace.Set.VersionId>()
            .references(() => collectionTable.versionId, {
                onDelete: 'cascade',
            }),
    },
    (table) => [
        unique('unique_collection_dependency').on(
            table.collectionVersionId,
            table.dependentCollectionVersionId
        ),
    ]
);

export const elementTable = pgTable(
    'exercise_element_templates',
    {
        ...stateVersionedEntity<
            Marketplace.Element.EntityId,
            Marketplace.Element.VersionId
        >('element'),
        title: varchar().notNull(),
        description: varchar().notNull(),
        content: json()
            .$type<Marketplace.ExerciseElementObjectUnion>()
            .notNull(),
    },
    (table) => [
        unique('unique_template_version').on(table.entityId, table.version),
        unique('unique_template_id').on(table.entityId, table.versionId),
    ]
);


export const actionEntityRelations = relations(actionTable, ({ one }) => ({
    exerciseWrapperEntity: one(exerciseTable, {
        fields: [actionTable.exerciseId],
        references: [exerciseTable.id],
    }),
}));

export const exerciseEntityRelations = relations(exerciseTable, ({ many }) => ({
    actionWrapperEntities: many(actionTable),
}));
