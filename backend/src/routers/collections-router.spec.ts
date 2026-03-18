import { AlarmGroup, Marketplace } from "fuesim-digital-shared";
import { createTestEnvironment, createTestUserSession } from "../test/utils.js";

const ENDPOINT = "/api/collections"

describe('Collection Router', () => {
    const environment = createTestEnvironment();
    let session: string;
    const userInfo = {
        id: "test-user",
        displayName: "Test User",
        username: "testuser",
    }
    beforeEach(async () => {
        session = await createTestUserSession(environment, {
            user: userInfo
        });
    });

    describe("HTTP GET /my", () => {
        it('returns user collections', async () => {
            const title = 'Test Collection';

            await environment.collectionService.createExerciseSet(title, userInfo.id);

            const collections = await environment.httpRequest("get", ENDPOINT + "/my", session);

            console.log(collections)
            const parsed = Marketplace.Set.LoadMy.responseSchema.parse(collections.body)

            expect(parsed.result).toHaveLength(1);
            expect(parsed.result[0]?.title).toBe(title);
            expect(parsed.result[0]?.owner).toBe(userInfo.id);
            expect(parsed.result[0]?.draftState).toBe(false);
        });
    })

    describe("HTTP POST /create", () => {
        it("creates a new collection", async () => {
            const title = 'Test Collection';

            const data = Marketplace.Set.Create.requestSchema.encode({
                title,
            })

            const response = await environment.httpRequest("post", ENDPOINT + "/create", session, data);
            const parsed = Marketplace.Set.Create.responseSchema.parse(response.body);

            expect(parsed.result.title).toBe(title);
            expect(parsed.result.draftState).toBe(false);
        })
    })

    describe('collections', () => {

        describe("visibility change", () => {
            it("works for existing collections", async () => {
                const title = 'Test Collection';

                const collection = await environment.collectionService.createExerciseSet(title, userInfo.id);
                if (!collection) return;

                const returnedCollection = await environment.collectionService.makeCollectionPublic(collection.entityId);
                expect(returnedCollection.versionId).toBe(collection.versionId);
                expect(returnedCollection.visibility).toBe("public");

                const fetchedCollection = await environment.collectionService.getLatestCollectionById(collection.entityId, { draftState: false })
                expect(fetchedCollection?.versionId).toBe(collection.versionId);
                expect(fetchedCollection?.visibility).toBe("public");
            })
            it("throws for non-existing collections", async () => {
                expect(async () => {
                    await environment.collectionService.makeCollectionPublic("non-existing-collection-id" as Marketplace.Set.EntityId)
                }).rejects.toThrow()
            })
        })
    });

    describe("HTTP /:collectionEntityId", () => {
        describe("HTTP POST /create", () => {
            it("creates a new exercise element", async () => {
                const title = 'Test Collection';
                const content = {
                    type: "alarmGroup",
                    alarmGroupVehicles: {},
                    id: "test-alarm-group-id",
                    name: "Test Alarm Group",
                    triggerCount: 0,
                    triggerLimit: null,
                } satisfies AlarmGroup;

                const collection = await environment.collectionService.createExerciseSet(title, userInfo.id);

                expect(collection).toBeDefined();
                if (!collection) return;


                const element = await environment.httpRequest("post", ENDPOINT + `/${collection.entityId}/create`, session,
                    Marketplace.Element.Create.requestSchema.encode({
                        data: content
                    })
                );

                console.log(element.body)
                const parsedElementResponse1 = Marketplace.Element.Create.responseSchema.parse(element.body);

                expect(parsedElementResponse1.result.title).toBe(content.name);
                expect(parsedElementResponse1.result.content).toEqual(content);
                expect(parsedElementResponse1.newSetVersionId).not.toBe(collection.versionId);


                const collectionData = await environment.collectionService.getCollectionVersionById(parsedElementResponse1.newSetVersionId);
                expect(collectionData?.draftState).toBe(true);
            })

            it("only creates a new draft-state if necessary", async () => {
                const title = 'Test Collection';
                const content = {
                    type: "alarmGroup",
                    alarmGroupVehicles: {},
                    id: "test-alarm-group-id",
                    name: "Test Alarm Group",
                    triggerCount: 0,
                    triggerLimit: null,
                } satisfies AlarmGroup;

                const collection = await environment.collectionService.createExerciseSet(title, userInfo.id);

                expect(collection).toBeDefined();
                if (!collection) return;
                expect(collection.draftState).toBe(false);

                const firstElement = await environment.collectionService.createExerciseObject(collection.entityId, content);
                expect(firstElement.result).toBeDefined();
                expect(firstElement.newSetVersionId).not.toBe(collection.versionId);

                const collection2 = await environment.collectionService.getCollectionVersionById(firstElement.newSetVersionId)
                expect(collection2).toBeDefined();
                if (!collection2) return;
                expect(collection2.draftState).toBe(true);
                expect(collection2.versionId).not.toBe(collection.versionId);

                const secondElement = await environment.httpRequest("post", ENDPOINT + `/${collection.entityId}/create`, session,
                    Marketplace.Element.Create.requestSchema.encode({
                        data: content
                    })
                );

                const parsedElementResponse2 = Marketplace.Element.Create.responseSchema.parse(secondElement.body);
                expect(parsedElementResponse2.newSetVersionId).toBe(firstElement.newSetVersionId);

                const collection3 = await environment.collectionService.getCollectionVersionById(firstElement.newSetVersionId)
                expect(collection3).toBeDefined();
                if (!collection3) return;
                expect(collection3.draftState).toBe(true);
                expect(collection3.versionId).toBe(collection2.versionId);
            })

            test("new draft-states keep the previous elements", async () => {
                const title = 'Test Collection';
                const content = {
                    type: "alarmGroup",
                    alarmGroupVehicles: {},
                    id: "test-alarm-group-id",
                    name: "Test Alarm Group",
                    triggerCount: 0,
                    triggerLimit: null,
                } satisfies AlarmGroup;

                const collection = await environment.collectionService.createExerciseSet(title, userInfo.id);

                expect(collection).toBeDefined();
                if (!collection) return;
                expect(collection.draftState).toBe(false);

                const firstElement = await environment.collectionService.createExerciseObject(collection.entityId, content);
                expect(firstElement.result).toBeDefined();
                expect(firstElement.newSetVersionId).not.toBe(collection.versionId);

                const saveDraftResult = await environment.collectionService.saveDraftState(collection.entityId)
                expect(saveDraftResult.versionId).toBe(firstElement.newSetVersionId);

                const secondElement = await environment.collectionService.createExerciseObject(collection.entityId, content);
                expect(secondElement.result).toBeDefined();
                expect(secondElement.newSetVersionId).not.toBe(firstElement.newSetVersionId);

                const secondCollectionElements_includeDraft =
                    await environment.collectionService.getElementsOfCollectionVersion(secondElement.newSetVersionId, {
                        allowDraftState: true,
                        includeDependencies: false
                    });
                expect(secondCollectionElements_includeDraft.direct).toHaveLength(2);
                expect(secondCollectionElements_includeDraft.direct.findIndex(f => f.entityId === firstElement.result.entityId)).not.toBe(-1);
                expect(secondCollectionElements_includeDraft.direct.findIndex(f => f.entityId === secondElement.result.entityId)).not.toBe(-1);


                expect(
                    async () => await environment.collectionService.getElementsOfCollectionVersion(secondElement.newSetVersionId, {
                        allowDraftState: false,
                        includeDependencies: false
                    })).rejects.toThrow();
            })

            it.each([["set_version_mock-id", 404], ["completely_wrong", 400]])('fails for non-existing collection "%s" with %d', async (id, expectedStatus) => {
                const content = {
                    type: "alarmGroup",
                    alarmGroupVehicles: {},
                    id: "test-alarm-group-id",
                    name: "Test Alarm Group",
                    triggerCount: 0,
                    triggerLimit: null,
                } satisfies AlarmGroup;

                const response = await environment.httpRequest("post", ENDPOINT + `/${id}/create`, session,
                    Marketplace.Element.Create.requestSchema.encode({
                        data: content
                    })
                )
                expect(response.status).toBe(expectedStatus);

            })
        })
        describe("HTTP POST /save", () => {
            it("saves the draft state", async () => {
                const title = 'Test Collection';

                const collection = await environment.collectionService.createExerciseSet(title, userInfo.id);
                if (!collection) return;

                expect(collection.draftState).toBe(false);

                let currentCollectionState = await environment.collectionService.getCollectionVersionById(collection.versionId);
                expect(currentCollectionState?.draftState).toBe(false);

                const createdElement = await environment.collectionService.createExerciseObject(
                    collection.entityId,
                    {
                        type: "alarmGroup",
                        id: "test-alarm-group-id",
                        alarmGroupVehicles: {},
                        name: "Test Alarm Group",
                        triggerCount: 0,
                        triggerLimit: null
                    }
                )

                expect(currentCollectionState?.versionId).not.toBe(createdElement.newSetVersionId);

                currentCollectionState = await environment.collectionService.getCollectionVersionById(createdElement.newSetVersionId);
                expect(currentCollectionState?.draftState).toBe(true);

                const saveResult = await environment.httpRequest("post", ENDPOINT + `/${collection.entityId}/save`, session, undefined);
                const parsedSaveResult = Marketplace.Set.SaveDraftState.responseSchema.parse(saveResult.body);

                expect(parsedSaveResult.result?.versionId).toBe(createdElement.newSetVersionId);
                expect(parsedSaveResult.result?.draftState).toBe(false);
                expect(parsedSaveResult.saved).toBe(true);
            })
            it("does not throw for already saved collections", async () => {
                const title = 'Test Collection';

                const collection = await environment.collectionService.createExerciseSet(title, userInfo.id);
                if (!collection) return;

                expect(collection.draftState).toBe(false);

                let currentCollectionState = await environment.collectionService.getCollectionVersionById(collection.versionId);
                expect(currentCollectionState?.draftState).toBe(false);

                const createdElement = await environment.collectionService.createExerciseObject(
                    collection.entityId,
                    {
                        type: "alarmGroup",
                        id: "test-alarm-group-id",
                        alarmGroupVehicles: {},
                        name: "Test Alarm Group",
                        triggerCount: 0,
                        triggerLimit: null
                    }
                )

                expect(currentCollectionState?.versionId).not.toBe(createdElement.newSetVersionId);

                currentCollectionState = await environment.collectionService.getCollectionVersionById(createdElement.newSetVersionId);
                expect(currentCollectionState?.draftState).toBe(true);

                const saveResult = await environment.httpRequest("post", ENDPOINT + `/${collection.entityId}/save`, session, undefined);
                const parsedSaveResult = Marketplace.Set.SaveDraftState.responseSchema.parse(saveResult.body);

                expect(parsedSaveResult.result?.versionId).toBe(createdElement.newSetVersionId);
                expect(parsedSaveResult.result?.draftState).toBe(false);


                const saveResult2 = await environment.httpRequest("post", ENDPOINT + `/${collection.entityId}/save`, session, undefined);
                console.log(saveResult2.body)
                const parsedSaveResult2 = Marketplace.Set.SaveDraftState.responseSchema.parse(saveResult2.body);

                expect(parsedSaveResult2.result).toBeNull();
                expect(parsedSaveResult2.saved).toBe(false);

            })
        })
        describe("HTTP /version/:collectionVersionId", () => {
            describe("HTTP POST /duplicate", () => {
                it("duplicates the collection and its elements", async () => {


                    const title = 'Test Collection';
                    const content = {
                        type: "alarmGroup",
                        alarmGroupVehicles: {},
                        id: "test-alarm-group-id",
                        name: "Test Alarm Group",
                        triggerCount: 0,
                        triggerLimit: null,
                    } satisfies AlarmGroup;

                    const collection = await environment.collectionService.createExerciseSet(title, userInfo.id);

                    expect(collection).toBeDefined();
                    if (!collection) return;

                    const elementCreationResult = await environment.collectionService.createExerciseObject(
                        collection.entityId,
                        content
                    )

                    const duplicationResult = await environment.httpRequest("post", ENDPOINT + `/${collection.entityId}/version/${elementCreationResult.newSetVersionId}/duplicate`, session, undefined);
                    console.log(duplicationResult)

                    const parsedDuplicationResult = Marketplace.Set.Duplicate.responseSchema.parse(duplicationResult.body);

                    expect(parsedDuplicationResult.createdSet.entityId).not.toBe(collection.entityId);
                    expect(parsedDuplicationResult.createdSet.versionId).not.toBe(collection.versionId);

                    // we changed the title to indiciate that it's a copy
                    expect(parsedDuplicationResult.createdSet.title).not.toBe(collection.title);
                    expect(parsedDuplicationResult.createdSet.draftState).toBe(true);

                    const duplicatedElements = await environment.collectionService.getElementsOfCollectionVersion(parsedDuplicationResult.createdSet.versionId, {
                        allowDraftState: true,
                        includeDependencies: true
                    });


                    console.log(parsedDuplicationResult.createdSet)

                    //TODO: @Quixelation, check if deps have been copied over;

                    expect(duplicatedElements.direct).toHaveLength(1);
                    expect(duplicatedElements.direct[0]?.content).toEqual(content);

                    const myCollections = await environment.collectionService.getLatestExerciseElementSetsForUser(userInfo.id, { includeDraftState: true });
                    expect(myCollections).toHaveLength(2);
                    expect(myCollections.find(f=> f.entityId === collection.entityId)).toBeDefined();
                    expect(myCollections).toContainEqual(parsedDuplicationResult.createdSet);
                })

                it("does not copy over version history", () => {
                    expect(false).toBe(true);
                })
            })
        })
    })

    describe('elements', () => {
        describe('deletion', () => {
            it("works and can change draft-state", async () => {
                const title = 'Test Collection';
                const content = {
                    type: "alarmGroup",
                    alarmGroupVehicles: {},
                    id: "test-alarm-group-id",
                    name: "Test Alarm Group",
                    triggerCount: 0,
                    triggerLimit: null,
                } satisfies AlarmGroup;

                const collection = await environment.collectionService.createExerciseSet(title, userInfo.id);

                expect(collection).toBeDefined();
                if (!collection) return;

                const element = await environment.collectionService.createExerciseObject(collection.entityId, content);

                const content2 = {
                    ...content,
                    id: "test-alarm-group-id-2",
                    name: "Test Alarm Group 2",
                }

                const element2 = await environment.collectionService.createExerciseObject(collection.entityId, content2);

                const deletionResult = await environment.collectionService.deleteExerciseElementObjectFromSet(element.result.entityId);
                expect(deletionResult.versionId).not.toBe(collection.versionId);


                const deletionResult2 = await environment.collectionService.deleteExerciseElementObjectFromSet(element2.result.entityId);
                expect(deletionResult2.versionId).toBe(deletionResult.versionId);

            })
        })
    });
});




































