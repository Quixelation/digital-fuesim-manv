import {
    AlarmGroup,
    CollectionDto,
    CollectionEntityId,
    ElementDto,
    Marketplace,
    uuid,
    VehicleTemplate,
} from 'fuesim-digital-shared';
import { createTestEnvironment, createTestUserSession } from '../test/utils.js';

const ENDPOINT = '/api/collections';

describe('Collection Router', () => {
    const environment = createTestEnvironment();
    let session: string;
    const userInfo = {
        id: 'test-user',
        displayName: 'Test User',
        username: 'testuser',
    };
    let collection: CollectionDto;
    beforeEach(async () => {
        session = await createTestUserSession(environment, {
            user: userInfo,
        });

        const data = await environment.collectionService.createExerciseSet(
            'Test Collection',
            userInfo.id
        );
        if (!data) {
            throw new Error('Failed to create collection for testing');
        }
        collection = data;
    });

    describe('HTTP GET /my', () => {
        it('returns user collections', async () => {
            const collections = await environment.httpRequest(
                'get',
                ENDPOINT + '/my',
                session
            );

            const parsed = Marketplace.Set.LoadMy.responseSchema.parse(
                collections.body
            );

            expect(parsed.result).toHaveLength(1);
            expect(parsed.result[0]?.title).toBe(collection.title);
            expect(parsed.result[0]?.owner).toBe(userInfo.id);
            expect(parsed.result[0]?.draftState).toBe(false);
        });
    });

    describe('HTTP POST /create', () => {
        it('creates a new collection', async () => {
            const title = 'Test Collection';

            const data = Marketplace.Set.Create.requestSchema.encode({
                title,
            });

            const response = await environment.httpRequest(
                'post',
                ENDPOINT + '/create',
                session,
                data
            );
            const parsed = Marketplace.Set.Create.responseSchema.parse(
                response.body
            );

            expect(parsed.result.title).toBe(title);
            expect(parsed.result.draftState).toBe(false);

            const myCollections =
                await environment.collectionService.getLatestExerciseElementSetsForUser(
                    userInfo.id,
                    { includeDraftState: true }
                );

            expect(myCollections).toContainEqual(parsed.result);
            // bc we already created one collection in the beforeEach
            expect(myCollections).toHaveLength(2);
        });
    });

    describe('collections', () => {
        describe('visibility change', () => {
            it('works for existing collections', async () => {
                const returnedCollection =
                    await environment.collectionService.makeCollectionPublic(
                        collection.entityId
                    );
                expect(returnedCollection.versionId).toBe(collection.versionId);
                expect(returnedCollection.visibility).toBe('public');

                const fetchedCollection =
                    await environment.collectionService.getLatestCollectionById(
                        collection.entityId,
                        { draftState: false }
                    );
                expect(fetchedCollection?.versionId).toBe(collection.versionId);
                expect(fetchedCollection?.visibility).toBe('public');
            });
            it('throws for non-existing collections', async () => {
                expect(async () => {
                    await environment.collectionService.makeCollectionPublic(
                        'non-existing-collection-id' as CollectionEntityId
                    );
                }).rejects.toThrow();
            });
        });
    });

    describe('HTTP /:collectionEntityId', () => {
        describe('HTTP POST /create', () => {
            it('creates a new exercise element', async () => {
                const content = {
                    type: 'alarmGroup',
                    alarmGroupVehicles: {},
                    id: uuid(),
                    name: 'Test Alarm Group',
                    triggerCount: 0,
                    triggerLimit: null,
                } satisfies AlarmGroup;

                const element = await environment.httpRequest(
                    'post',
                    ENDPOINT + `/${collection.entityId}/create`,
                    session,
                    Marketplace.Element.Create.requestSchema.encode({
                        data: content,
                    })
                );

                const parsedElementResponse1 =
                    Marketplace.Element.Create.responseSchema.parse(
                        element.body
                    );

                expect(parsedElementResponse1.result.title).toBe(content.name);
                expect(parsedElementResponse1.result.content).toEqual(content);
                expect(parsedElementResponse1.newSetVersionId).not.toBe(
                    collection.versionId
                );

                const collectionData =
                    await environment.collectionService.getCollectionVersionById(
                        parsedElementResponse1.newSetVersionId
                    );
                expect(collectionData?.draftState).toBe(true);
            });

            it('only creates a new draft-state if necessary', async () => {
                const content = {
                    type: 'alarmGroup',
                    alarmGroupVehicles: {},
                    id: uuid(),
                    name: 'Test Alarm Group',
                    triggerCount: 0,
                    triggerLimit: null,
                } satisfies AlarmGroup;

                expect(collection.draftState).toBe(false);

                const firstElement =
                    await environment.collectionService.createExerciseObject(
                        collection.entityId,
                        content
                    );
                expect(firstElement.result).toBeDefined();
                expect(firstElement.newSetVersionId).not.toBe(
                    collection.versionId
                );

                const collection2 =
                    await environment.collectionService.getCollectionVersionById(
                        firstElement.newSetVersionId
                    );
                expect(collection2).toBeDefined();
                if (!collection2) return;
                expect(collection2.draftState).toBe(true);
                expect(collection2.versionId).not.toBe(collection.versionId);

                const secondElement = await environment.httpRequest(
                    'post',
                    ENDPOINT + `/${collection.entityId}/create`,
                    session,
                    Marketplace.Element.Create.requestSchema.encode({
                        data: content,
                    })
                );

                const parsedElementResponse2 =
                    Marketplace.Element.Create.responseSchema.parse(
                        secondElement.body
                    );
                expect(parsedElementResponse2.newSetVersionId).toBe(
                    firstElement.newSetVersionId
                );

                const collection3 =
                    await environment.collectionService.getCollectionVersionById(
                        firstElement.newSetVersionId
                    );
                expect(collection3).toBeDefined();
                if (!collection3) return;
                expect(collection3.draftState).toBe(true);
                expect(collection3.versionId).toBe(collection2.versionId);
            });

            test('new draft-states keep the previous elements', async () => {
                const content = {
                    type: 'alarmGroup',
                    alarmGroupVehicles: {},
                    id: uuid(),
                    name: 'Test Alarm Group',
                    triggerCount: 0,
                    triggerLimit: null,
                } satisfies AlarmGroup;

                expect(collection.draftState).toBe(false);

                const firstElement =
                    await environment.collectionService.createExerciseObject(
                        collection.entityId,
                        content
                    );
                expect(firstElement.result).toBeDefined();
                expect(firstElement.newSetVersionId).not.toBe(
                    collection.versionId
                );

                const saveDraftResult =
                    await environment.collectionService.saveDraftState(
                        collection.entityId
                    );
                expect(saveDraftResult.versionId).toBe(
                    firstElement.newSetVersionId
                );

                const secondElement =
                    await environment.collectionService.createExerciseObject(
                        collection.entityId,
                        content
                    );
                expect(secondElement.result).toBeDefined();
                expect(secondElement.newSetVersionId).not.toBe(
                    firstElement.newSetVersionId
                );

                const secondCollectionElements_includeDraft =
                    await environment.collectionService.getElementsOfCollectionVersion(
                        secondElement.newSetVersionId,
                        {
                            allowDraftState: true,
                            includeDependencies: false,
                        }
                    );
                expect(
                    secondCollectionElements_includeDraft.direct
                ).toHaveLength(2);
                expect(
                    secondCollectionElements_includeDraft.direct.findIndex(
                        (f) => f.entityId === firstElement.result.entityId
                    )
                ).not.toBe(-1);
                expect(
                    secondCollectionElements_includeDraft.direct.findIndex(
                        (f) => f.entityId === secondElement.result.entityId
                    )
                ).not.toBe(-1);

                expect(
                    async () =>
                        await environment.collectionService.getElementsOfCollectionVersion(
                            secondElement.newSetVersionId,
                            {
                                allowDraftState: false,
                                includeDependencies: false,
                            }
                        )
                ).rejects.toThrow();
            });

            it.each([
                ['set_version_mock-id', 404],
                ['completely_wrong', 400],
            ])(
                'fails for non-existing collection "%s" with %d',
                async (id, expectedStatus) => {
                    const content = {
                        type: 'alarmGroup',
                        alarmGroupVehicles: {},
                        id: uuid(),
                        name: 'Test Alarm Group',
                        triggerCount: 0,
                        triggerLimit: null,
                    } satisfies AlarmGroup;

                    const response = await environment.httpRequest(
                        'post',
                        ENDPOINT + `/${id}/create`,
                        session,
                        Marketplace.Element.Create.requestSchema.encode({
                            data: content,
                        })
                    );
                    expect(response.status).toBe(expectedStatus);
                }
            );
        });
        describe.only("HTTP /dependencies", () => {
            let collection2: CollectionDto;


            beforeEach(async () => {
                const data = await environment.collectionService.createExerciseSet(
                    'Test Collection 2',
                    userInfo.id
                );
                if (!data) {
                    throw new Error('Failed to create collection for testing');
                }
                collection2 = data;
            })

            describe("HTTP /:importCollectionVersionId", () => {
                describe('HTTP POST /', () => {
                    it('adds a new dependency to an existing collection', async () => {
                        const content = {
                            id: uuid(),
                            type: 'alarmGroup',
                            name: 'Test Alarm Group',
                            triggerCount: 0,
                            triggerLimit: null,
                            alarmGroupVehicles: {},
                        } satisfies AlarmGroup;
                        const createdElement = await environment.collectionService.createExerciseObject(
                            collection2.entityId,
                            content
                        );
                        const collection2_v2 = await environment.collectionService.saveDraftState(collection2.entityId);
                        expect(collection2_v2.draftState).toBe(false);
                        expect(collection2_v2.versionId).not.toBe(collection2.versionId);


                        const data = await environment.httpRequest("post",
                            ENDPOINT + `/${collection.entityId}/dependencies/${collection2_v2.versionId}`,
                            session,
                            undefined
                        );

                        const parsed = Marketplace.Set.Import.responseSchema.parse(data.body);
                        expect(parsed.importedSet.collection).toEqual(collection2_v2);
                        // does not contained elements from newer collection versions
                        expect(parsed.importedSet.elements).toEqual([createdElement.result]);
                    })
                    it("finds a compromise for attempted draft-state imports", async () => {
                        expect(collection2.draftState).toBe(false);
                        const content = {
                            id: uuid(),
                            type: 'alarmGroup',
                            name: 'Test Alarm Group in Draft State',
                            triggerCount: 0,
                            triggerLimit: null,
                            alarmGroupVehicles: {},
                        } satisfies AlarmGroup;
                        const createdElement = await environment.collectionService.createExerciseObject(
                            collection2.entityId,
                            content
                        );
                        const collection2After = await environment.collectionService.getCollectionVersionById(createdElement.newSetVersionId);
                        expect(collection2After).toBeDefined();
                        if (!collection2After) return;
                        expect(collection2After.draftState).toBe(true);
                        expect(collection2After.versionId).not.toBe(collection2.versionId);

                        const data = await environment.httpRequest("post",
                            ENDPOINT + `/${collection.entityId}/dependencies/${collection2After.versionId}`,
                            session,
                            undefined
                        );
                        const parsed = Marketplace.Set.Import.responseSchema.parse(data.body);
                        // does not contained elements from newer collection versions
                        expect(parsed.importedSet.elements).toEqual([]);
                        expect(parsed.importedSet.collection.draftState).toBe(false);
                        expect(parsed.importedSet.collection.entityId).toEqual(collection2.entityId);
                        expect(parsed.importedSet.collection.versionId).toEqual(collection2.versionId);
                    })
                })
            })
        });

        describe('HTTP POST /save', () => {
            it('saves the draft state', async () => {
                expect(collection.draftState).toBe(false);

                let currentCollectionState =
                    await environment.collectionService.getCollectionVersionById(
                        collection.versionId
                    );
                expect(currentCollectionState?.draftState).toBe(false);

                const createdElement =
                    await environment.collectionService.createExerciseObject(
                        collection.entityId,
                        {
                            type: 'alarmGroup',
                            id: uuid(),
                            alarmGroupVehicles: {},
                            name: 'Test Alarm Group',
                            triggerCount: 0,
                            triggerLimit: null,
                        }
                    );

                expect(currentCollectionState?.versionId).not.toBe(
                    createdElement.newSetVersionId
                );

                currentCollectionState =
                    await environment.collectionService.getCollectionVersionById(
                        createdElement.newSetVersionId
                    );
                expect(currentCollectionState?.draftState).toBe(true);

                const saveResult = await environment.httpRequest(
                    'post',
                    ENDPOINT + `/${collection.entityId}/save`,
                    session,
                    undefined
                );
                const parsedSaveResult =
                    Marketplace.Set.SaveDraftState.responseSchema.parse(
                        saveResult.body
                    );

                expect(parsedSaveResult.result?.versionId).toBe(
                    createdElement.newSetVersionId
                );
                expect(parsedSaveResult.result?.draftState).toBe(false);
                expect(parsedSaveResult.saved).toBe(true);
            });
            it('does not throw for already saved collections', async () => {
                expect(collection.draftState).toBe(false);

                let currentCollectionState =
                    await environment.collectionService.getCollectionVersionById(
                        collection.versionId
                    );
                expect(currentCollectionState?.draftState).toBe(false);

                const createdElement =
                    await environment.collectionService.createExerciseObject(
                        collection.entityId,
                        {
                            type: 'alarmGroup',
                            id: uuid(),
                            alarmGroupVehicles: {},
                            name: 'Test Alarm Group',
                            triggerCount: 0,
                            triggerLimit: null,
                        }
                    );

                expect(currentCollectionState?.versionId).not.toBe(
                    createdElement.newSetVersionId
                );

                currentCollectionState =
                    await environment.collectionService.getCollectionVersionById(
                        createdElement.newSetVersionId
                    );
                expect(currentCollectionState?.draftState).toBe(true);

                const saveResult = await environment.httpRequest(
                    'post',
                    ENDPOINT + `/${collection.entityId}/save`,
                    session,
                    undefined
                );
                const parsedSaveResult =
                    Marketplace.Set.SaveDraftState.responseSchema.parse(
                        saveResult.body
                    );

                expect(parsedSaveResult.result?.versionId).toBe(
                    createdElement.newSetVersionId
                );
                expect(parsedSaveResult.result?.draftState).toBe(false);

                const saveResult2 = await environment.httpRequest(
                    'post',
                    ENDPOINT + `/${collection.entityId}/save`,
                    session,
                    undefined
                );
                const parsedSaveResult2 =
                    Marketplace.Set.SaveDraftState.responseSchema.parse(
                        saveResult2.body
                    );

                expect(parsedSaveResult2.result).toBeNull();
                expect(parsedSaveResult2.saved).toBe(false);
            });
        });
        describe('HTTP /version/:collectionVersionId', () => {
            describe('HTTP POST /duplicate', () => {
                it('duplicates the collection and its elements', async () => {
                    const content = {
                        type: 'alarmGroup',
                        alarmGroupVehicles: {},
                        id: uuid(),
                        name: 'Test Alarm Group',
                        triggerCount: 0,
                        triggerLimit: null,
                    } satisfies AlarmGroup;

                    const elementCreationResult =
                        await environment.collectionService.createExerciseObject(
                            collection.entityId,
                            content
                        );

                    const duplicationResult = await environment.httpRequest(
                        'post',
                        ENDPOINT +
                        `/${collection.entityId}/version/${elementCreationResult.newSetVersionId}/duplicate`,
                        session,
                        undefined
                    );

                    const parsedDuplicationResult =
                        Marketplace.Set.Duplicate.responseSchema.parse(
                            duplicationResult.body
                        );

                    expect(
                        parsedDuplicationResult.createdSet.entityId
                    ).not.toBe(collection.entityId);
                    expect(
                        parsedDuplicationResult.createdSet.versionId
                    ).not.toBe(collection.versionId);

                    // we changed the title to indiciate that it's a copy
                    expect(parsedDuplicationResult.createdSet.title).not.toBe(
                        collection.title
                    );
                    expect(parsedDuplicationResult.createdSet.draftState).toBe(
                        true
                    );

                    const duplicatedElements =
                        await environment.collectionService.getElementsOfCollectionVersion(
                            parsedDuplicationResult.createdSet.versionId,
                            {
                                allowDraftState: true,
                                includeDependencies: true,
                            }
                        );

                    //TODO: @Quixelation, check if deps have been copied over;

                    expect(duplicatedElements.direct).toHaveLength(1);
                    expect(duplicatedElements.direct[0]?.content).toEqual(
                        content
                    );

                    const myCollections =
                        await environment.collectionService.getLatestExerciseElementSetsForUser(
                            userInfo.id,
                            { includeDraftState: true }
                        );
                    expect(myCollections).toHaveLength(2);
                    expect(
                        myCollections.find(
                            (f) => f.entityId === collection.entityId
                        )
                    ).toBeDefined();
                    expect(myCollections).toContainEqual(
                        parsedDuplicationResult.createdSet
                    );
                });

                it('does not copy over version history', () => {
                    expect(false).toBe(true);
                });
            });
        });
        describe('HTTP /element/:elementEntityId', () => {
            let element!: ElementDto;

            beforeEach(async () => {
                const content = {
                    type: 'vehicleTemplate',
                    id: uuid(),
                    image: {
                        aspectRatio: 1,
                        height: 100,
                        url: '',
                    },
                    personnelTemplateIds: [],
                    materialTemplateIds: [],
                    patientCapacity: 0,
                    name: 'Test Vehicle Template',
                    vehicleType: 'type',
                } satisfies VehicleTemplate;

                const elementCreationResult =
                    await environment.collectionService.createExerciseObject(
                        collection.entityId,
                        content
                    );

                element = elementCreationResult.result;
            });

            describe('HTTP DELETE /', () => {
                it('deletes the element and creates a new draft-state', async () => {
                    const deletionResult = await environment.httpRequest(
                        'delete',
                        ENDPOINT +
                        `/${collection.entityId}/element/${element.entityId}`,
                        session,
                        undefined
                    );

                    const parsedDeletionResult =
                        Marketplace.Element.Delete.responseSchema.parse(
                            deletionResult.body
                        );
                    expect(parsedDeletionResult.newSetVersionId).toBeDefined();
                    expect(parsedDeletionResult.requiresConfirmation).toEqual(
                        []
                    );
                    if (!parsedDeletionResult.newSetVersionId) return;

                    const collectionData =
                        await environment.collectionService.getCollectionVersionById(
                            parsedDeletionResult.newSetVersionId
                        );
                    expect(collectionData).toBeDefined();
                    if (!collectionData) return;
                    expect(collectionData.draftState).toBe(true);

                    const collectionElements =
                        await environment.collectionService.getElementsOfCollectionVersion(
                            collection.versionId,
                            {
                                allowDraftState: true,
                            }
                        );

                    expect(parsedDeletionResult.newSetVersionId).not.toBe(
                        collection.versionId
                    );
                    expect(
                        collectionElements.direct.find(
                            (f) => f.entityId === element.entityId
                        )
                    ).toBeUndefined();
                });
                describe('for depended-upon elements', () => {
                    let alarmGroupElement: ElementDto;
                    beforeEach(async () => {
                        const vehicleId = uuid();
                        const content = {
                            type: 'alarmGroup',
                            name: 'Test Alarm Group',
                            id: uuid(),
                            triggerCount: 0,
                            triggerLimit: null,
                            alarmGroupVehicles: {
                                [vehicleId]: {
                                    id: vehicleId,
                                    vehicleTemplateId: element.versionId,
                                    time: 0,
                                    name: element.content.name,
                                },
                            },
                        } satisfies AlarmGroup;

                        const elementCreationResult =
                            await environment.collectionService.createExerciseObject(
                                collection.entityId,
                                content
                            );

                        alarmGroupElement = elementCreationResult.result;
                    });

                    it('blocks deletion of elements which are being depended on', async () => {
                        const deletionResult = await environment.httpRequest(
                            'delete',
                            ENDPOINT +
                            `/${collection.entityId}/element/${element.entityId}`,
                            session,
                            undefined
                        );

                        const parsedDeletionResult =
                            Marketplace.Element.Delete.responseSchema.parse(
                                deletionResult.body
                            );

                        expect(parsedDeletionResult.newSetVersionId).toBeNull();
                        expect(
                            parsedDeletionResult.requiresConfirmation
                        ).toHaveLength(1);
                        expect(
                            parsedDeletionResult.requiresConfirmation[0]
                                ?.element.versionId
                        ).toBe(alarmGroupElement.versionId);
                    });
                });
            });

            describe('HTTP GET /versions', () => {
                it('returns the version history of the element', async () => {
                    for (let i = 0; i < 5; i++) {
                        const response = await environment.httpRequest(
                            'get',
                            ENDPOINT +
                            `/${collection.entityId}/element/${element.entityId}/versions`,
                            session
                        );
                        const parsedResponse =
                            Marketplace.Element.GetByEntityId.responseSchema.parse(
                                response.body
                            );

                        expect(parsedResponse.result).toHaveLength(1 + i);
                        expect(parsedResponse.result[i]?.entityId).toBe(
                            element.entityId
                        );
                        expect(parsedResponse.result[0]?.version).toBe(1 + i);
                        expect(parsedResponse.result[i]?.version).toBe(1);
                        expect(parsedResponse.result[i]?.content).toEqual(
                            element.content
                        );

                        await environment.collectionService.saveDraftState(
                            collection.entityId
                        );
                        await environment.collectionService.updateExerciseElementObject(
                            element.entityId,
                            element.content
                        );
                    }
                });
            });
        });
    });

    describe('elements', () => {
        describe('deletion', () => {
            it('works and can change draft-state', async () => {
                const content = {
                    type: 'alarmGroup',
                    alarmGroupVehicles: {},
                    id: uuid(),
                    name: 'Test Alarm Group',
                    triggerCount: 0,
                    triggerLimit: null,
                } satisfies AlarmGroup;

                const element =
                    await environment.collectionService.createExerciseObject(
                        collection.entityId,
                        content
                    );

                const content2 = {
                    ...content,
                    id: uuid(),
                    name: 'Test Alarm Group 2',
                };

                const element2 =
                    await environment.collectionService.createExerciseObject(
                        collection.entityId,
                        content2
                    );

                const deletionResult =
                    await environment.collectionService.deleteElementFromCollection(
                        element.result.entityId
                    );
                expect(deletionResult.versionId).not.toBe(collection.versionId);

                const deletionResult2 =
                    await environment.collectionService.deleteElementFromCollection(
                        element2.result.entityId
                    );
                expect(deletionResult2.versionId).toBe(
                    deletionResult.versionId
                );
            });
        });
    });
});
