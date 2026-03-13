import { z } from 'zod';
import { participantKeySchema, trainerKeySchema } from './exercise-keys.js';
import { exerciseTemplateIdSchema } from './ids.js';
import { vehicleTemplateSchema } from './models/vehicle-template.js';
import { AlarmGroup } from './models/alarm-group.js';

export const exerciseKeysSchema = z.object({
    participantKey: participantKeySchema,
    trainerKey: trainerKeySchema,
});
export type ExerciseKeys = z.infer<typeof exerciseKeysSchema>;

export const userDataSchema = z.object({
    id: z.string(),
    displayName: z.string(),
    username: z.string(),
});

export const userDataResponseSchema = z.object({
    user: userDataSchema.nullable().optional(),
    expired: z.boolean().optional(),
    userRegistrationsEnabled: z.boolean().optional(),
    userSelfServiceEnabled: z.boolean().optional(),
});

export type UserDataResponse = z.infer<typeof userDataResponseSchema>;

export interface AuthQueryParams {
    logoutStatus?: 'loggedOut' | 'noSessionFound' | 'sessionExpired';
    loginFailure?: string;
    loginSuccess?: boolean;
}

const stringToDate = z.codec(
    z.iso.datetime({ offset: true }), // input schema: ISO date string
    z.date(), // output schema: Date object
    {
        decode: (isoString) => new Date(isoString), // ISO string → Date
        encode: (date) => date.toISOString(), // Date → ISO string
    }
);

export const getExerciseResponseDataSchema = z.object({
    participantKey: participantKeySchema,
    trainerKey: trainerKeySchema,
    createdAt: stringToDate,
    lastUsedAt: stringToDate,
    baseTemplate: z
        .object({ id: exerciseTemplateIdSchema, name: z.string() })
        .nullable(),
});
export type GetExerciseResponseData = z.infer<
    typeof getExerciseResponseDataSchema
>;

export const getExercisesResponseDataSchema = z.array(
    getExerciseResponseDataSchema
);
export type GetExercisesResponseData = z.infer<
    typeof getExercisesResponseDataSchema
>;
export type GetExercisesResponseDataInput = z.input<
    typeof getExercisesResponseDataSchema
>;

export const exerciseExistsResponseDataSchema = z.object({
    isTemplate: z.boolean(),
});

export type ExerciseExistsResponseDataInput = z.input<
    typeof exerciseExistsResponseDataSchema
>;

export const getExerciseTemplateResponseDataSchema = z.object({
    id: exerciseTemplateIdSchema,
    trainerKey: trainerKeySchema,
    createdAt: stringToDate,
    lastExerciseCreatedAt: z.nullable(stringToDate),
    name: z.string(),
    description: z.string(),
});
export type GetExerciseTemplateResponseData = z.infer<
    typeof getExerciseTemplateResponseDataSchema
>;
export type GetExerciseTemplateResponseDataInput = z.input<
    typeof getExerciseTemplateResponseDataSchema
>;

export const postExerciseTemplateRequestDataSchema = z.object({
    name: z.string().trim().nonempty(),
    description: z.string().trim(),
});
export type PostExerciseTemplateRequestData = z.infer<
    typeof postExerciseTemplateRequestDataSchema
>;

export const patchExerciseTemplateRequestDataSchema =
    postExerciseTemplateRequestDataSchema.partial();
export type PatchExerciseTemplateRequestData = z.infer<
    typeof patchExerciseTemplateRequestDataSchema
>;

export const getExerciseTemplatesResponseDataSchema = z.array(
    getExerciseTemplateResponseDataSchema
);

export type GetExerciseTemplatesResponseData = z.infer<
    typeof getExerciseTemplatesResponseDataSchema
>;
export type GetExerciseTemplatesResponseDataInput = z.input<
    typeof getExerciseTemplatesResponseDataSchema
>;

export const joinExerciseResponseDataSchema = z.object({
    clientId: z.string(),
    exerciseTemplate: z.nullable(getExerciseTemplateResponseDataSchema),
});
export type JoinExerciseResponseData = z.infer<
    typeof joinExerciseResponseDataSchema
>;
export type JoinExerciseResponseDataInput = z.input<
    typeof joinExerciseResponseDataSchema
>;

// ###### Exercise Element Set ######

class Route<TRequest = never, TResponse = never> {
    constructor(opts: { request?: TRequest; response?: TResponse }) {
        this.requestSchema = opts.request as TRequest;
        this.responseSchema = opts.response as TResponse;
    }

    public readonly requestSchema: TRequest;
    public readonly responseSchema: TResponse;
    public readonly Request!: TRequest extends z.ZodType
        ? z.infer<TRequest>
        : never;
    public readonly Response!: TResponse extends z.ZodType
        ? z.infer<TResponse>
        : never;
}

export namespace Marketplace {
    export const exerciseElementObjectUnionSchema = z.union([
        vehicleTemplateSchema,
        //TODO: Quixelation
        z.object({
            type: z.literal('alarmGroup'),
            id: z.string(),
            name: z.string(),
            triggerLimit: z.number().nullable(),
            alarmGroupVehicles: z.record(
                z.string(),
                z.object({
                    name: z.string(),
                    vehicleTemplateId: z.string(),
                    time: z.number(),
                })
            ),
            triggerCount: z.number(),
        }),
    ]);

    export type ExerciseElementObjectUnion =
        | z.infer<typeof exerciseElementObjectUnionSchema>
        | AlarmGroup;

    export const elementSetVisbilitySchema = z.enum(['private', 'public']);

    export type ElementSetVisibility = z.infer<
        typeof elementSetVisbilitySchema
    >;

    // WARNING: This does not include versionId and entityId, since those have specific drizzle schemas
    const stateVersionedEntitySchema = z.object({
        version: z.number(),
        stateVersion: z.number(),
        createdAt: z.string(),
    });

    // set needs to be split up for internal deps
    export namespace Set {
        export const versionIdSchema = z
            .string()
            .regex(/^set_version_.+$/u)
            .brand<'SetVersionId'>();
        export type VersionId = z.infer<typeof versionIdSchema>;
        export const isSetVersionId = (value: string): value is VersionId => {
            return versionIdSchema.safeParse(value).success;
        };

        export const entityIdSchema = z
            .string()
            .regex(/^set_entity_.+$/u)
            .brand<'SetEntityId'>();
        export type EntityId = z.infer<typeof entityIdSchema>;
        export const isSetEntityId = (
            value: string | null
        ): value is EntityId => {
            return entityIdSchema.safeParse(value).success;
        };

        export const dtoSchema = z.object({
            ...stateVersionedEntitySchema.shape,
            versionId: Set.versionIdSchema,
            entityId: Set.entityIdSchema,
            title: z.string(),
            visibility: elementSetVisbilitySchema,
            owner: z.string(),
            draftState: z.boolean(),
        });

        export type Dto = z.infer<typeof dtoSchema>;
    }

    export namespace Element {
        export const versionIdSchema = z
            .string()
            .regex(/^element_version_.+$/u)
            .brand<'ElementVersionId'>();
        export type VersionId = z.infer<typeof versionIdSchema>;
        export const isVersionId = (value: string): value is VersionId => {
            return versionIdSchema.safeParse(value).success;
        };

        export const entityIdSchema = z
            .string()
            .regex(/^element_entity_.+$/u)
            .brand<'ElementEntityId'>();
        export type EntityId = z.infer<typeof entityIdSchema>;
        export const isEntityId = (value: string | null): value is EntityId => {
            return entityIdSchema.safeParse(value).success;
        };

        export const dtoSchema = z.object({
            ...stateVersionedEntitySchema.shape,
            versionId: Element.versionIdSchema,
            entityId: Element.entityIdSchema,
            title: z.string(),
            content: exerciseElementObjectUnionSchema,
        });

        export type Dto = z.infer<typeof dtoSchema>;
        export type TypedDto<TContent> = Omit<Dto, 'content'> & {
            content: TContent;
        };

        export const Create = new Route({
            request: z.object({
                data: exerciseElementObjectUnionSchema,
            }),
            response: z.object({
                newSetVersionId: Set.versionIdSchema,
                result: dtoSchema,
            }),
        });

        export const Edit = new Route({
            request: z.object({
                data: exerciseElementObjectUnionSchema,
            }),
            response: z.object({
                newSetVersionId: Set.versionIdSchema,
                result: dtoSchema,
            }),
        });

        export const Delete = new Route({
            response: z.object({
                newSetVersionId: Set.versionIdSchema,
            }),
        });

        export const GetByEntityId = new Route({
            response: z.object({
                result: z.array(dtoSchema),
            }),
        });
    }

    export namespace Set {
        export const Create = new Route({
            request: z.object({
                title: z.string().trim().nonempty(),
            }),
            response: z.object({
                result: dtoSchema,
            }),
        });

        export const LoadMy = new Route({
            response: z.object({
                result: z.array(dtoSchema),
            }),
        });

        export const GetByEntityId = new Route({
            response: z.object({
                result: dtoSchema,
            }),
        });

        export const transitiveCollectionSchema = z.object({
            collection: dtoSchema,
            elements: z.array(Element.dtoSchema),
        });

        export const GetLatestElementsBySetVersionId = new Route({
            response: z.object({
                direct: z.array(Element.dtoSchema),
                transitive: z.array(transitiveCollectionSchema),
            }),
        });

        export const GetCollectionVersion = new Route({
            response: z.object({
                result: Set.dtoSchema,
            }),
        });

        export const ChangeVisibility = new Route({
            request: z.object({
                visibility: elementSetVisbilitySchema,
            }),
            response: z.object({
                status: z.literal(['success']),
            }),
        });

        export const Duplicate = new Route({
            response: z.object({
                createdSet: dtoSchema,
            }),
        });

        export const Import = new Route({
            response: z.object({
                importedSet: transitiveCollectionSchema,
            }),
        });

        export const SaveDraftState = new Route({
            response: z.object({
                result: dtoSchema,
            }),
        });

        export const GetElementsOfCollectionVersion = new Route({
            response: z.object({
                direct: z.array(Element.dtoSchema),
                transitive: z.array(transitiveCollectionSchema),
            }),
        });

        class TypedSchema<D, T> {
            constructor(public readonly schema: T) {}

            public readonly Type!: T extends z.ZodType
                ? // if D is defined (override type), use D, otherwise infer from T
                  D extends unknown
                    ? z.infer<T>
                    : D
                : never;
        }

        export namespace Events {
            const defineEvent = <TName extends string, TData>(
                eventName: TName,
                dataSchema: TData
            ) => {
                const schema = z.object({
                    event: z.literal(eventName),
                    data: dataSchema,
                    collectionEntityId: Set.entityIdSchema,
                });
                // We need to type seperately to keep the event-name as a literal type
                return new TypedSchema<
                    {
                        event: TName;
                        collectionEntityId: Set.EntityId;
                        data: z.infer<TData>;
                    },
                    typeof schema
                >(schema);
            };

            export const DependencyAdd = defineEvent(
                'dependency:add',
                Set.versionIdSchema
            );

            export const DependencyReplaceData = defineEvent(
                'dependency:replace-data',
                z.array(transitiveCollectionSchema)
            );

            export const InitialData = defineEvent(
                'initialdata',
                z.object({
                    collection: Set.dtoSchema,
                    elements: z.object({
                        direct: z.array(Element.dtoSchema),
                        transitive: z.array(transitiveCollectionSchema),
                    }),
                })
            );

            export const ElementCreate = defineEvent(
                'element:create',
                Element.dtoSchema
            );

            export const ElementUpdate = defineEvent(
                'element:update',
                Element.dtoSchema
            );

            export const ElementDelete = defineEvent(
                'element:delete',
                z.object({
                    entityId: Element.entityIdSchema,
                })
            );

            export const CollectionUpdate = defineEvent(
                'collection:update',
                Set.dtoSchema
            );

            export const VersionSwitch = defineEvent(
                'version:switch',
                z.object({
                    newVersionId: Set.versionIdSchema,
                })
            );

            export const Event = new TypedSchema(
                z.union([
                    CollectionUpdate.schema,
                    DependencyAdd.schema,
                    DependencyReplaceData.schema,
                    ElementCreate.schema,
                    ElementDelete.schema,
                    ElementUpdate.schema,
                    InitialData.schema,
                    VersionSwitch.schema,
                ])
            );
        }
    }
}
