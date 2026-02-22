import type {
    ActionId,
    ExerciseAction,
    ExerciseElementObjectUnion,
    ExerciseState,
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
} from 'drizzle-orm/pg-core';

const typedUUID = <T = string>() => uuid().$type<T>();
const defaultUUID = <T = string>() =>
    typedUUID<T>().default(sql`uuid_generate_v4()`);
const defaultPrefixedUUID = (prefix: string) =>
    varchar().$defaultFn(() => `${prefix}_${crypto.randomUUID()}`);

export type ActionId = z.infer<typeof actionIdSchema>;
export type ExerciseTemplateId = z.infer<typeof exerciseTemplateIdSchema>;
export type ExerciseId = z.infer<typeof exerciseIdSchema>;

const actionIdSchema = z.uuidv4().brand<'ActionId'>();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    .brand<'ExerciseTemplateId'>();
    .uuidv4()
export const exerciseTemplateIdSchema = z

const exerciseIdSchema = z.uuidv4().brand<'ExerciseId'>();
// eslint-disable-next-line @typescript-eslint/no-unused-vars

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

export const exerciseElementSetTable = pgTable(
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
    },
    (table) => [
        unique('unique_set_version').on(table.entityId, table.version),
        unique('unique_set_id').on(table.entityId, table.versionId),
    ]
);

export const elementTemplateToSetMappingTable = pgTable(
    'exercise_element_to_set_mapping',
    {
        setEntityId: varchar().notNull().references(() => exerciseElementSetTable.entityId, {
            onDelete: 'cascade',
        }),
        setVersionId: varchar().notNull().references(() => exerciseElementSetTable.versionId, {
            onDelete: 'cascade',
        }),
        elementEntityId: varchar().notNull().references(() => exerciseElementTemplateTable.entityId, {
            onDelete: 'cascade',
        }),
        elementVersionId: varchar().notNull().references(() => exerciseElementTemplateTable.versionId, {
            onDelete: 'cascade',
        }),
    },
    (table) => [
        unique('unique_element_set_mapping').on(
            table.setVersionId,
            table.elementVersionId
        ),
    ]
);

export const exerciseElementTemplateTable = pgTable(
    'exercise_element_templates',
    {
        ...stateVersionedEntity<
            Marketplace.Element.EntityId,
            Marketplace.Element.VersionId
        >('element'),
        title: varchar().notNull(),
        description: varchar().notNull(),
        content: json().$type<ExerciseElementObjectUnion>().notNull(),
    },
    (table) => [
        unique('unique_template_version').on(table.entityId, table.version),
        unique('unique_template_id').on(table.entityId, table.versionId),
    ]
);

export const latestExerciseElementTemplateVersionNumbersView = pgView(
    'latest_exercise_element_template_version_numbers'
).as((qb) =>
    qb
        .select({
            entityId: exerciseElementTemplateTable.entityId,
            latestversion: max(exerciseElementTemplateTable.version).as(
                'latestversion'
            ),
        })
        .from(exerciseElementTemplateTable)
        .groupBy(exerciseElementTemplateTable.entityId)
);

export const latestExerciseElementTemplateView = pgView(
    'latest_exercise_element_templates'
).as((qb) =>
    qb
        .select(getTableColumns(exerciseElementTemplateTable))
        .from(exerciseElementTemplateTable)
        .innerJoin(
            latestExerciseElementTemplateVersionNumbersView,
            and(
                eq(
                    exerciseElementTemplateTable.entityId,
                    latestExerciseElementTemplateVersionNumbersView.entityId
                ),
                eq(
                    exerciseElementTemplateTable.version,
                    latestExerciseElementTemplateVersionNumbersView.latestversion
                )
            )
        )
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
