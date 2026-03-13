import { AlarmGroup, Marketplace } from "fuesim-digital-shared";
import { createTestEnvironment } from "../../test/utils.js";

describe('collection service', () => {
    const environment = createTestEnvironment();

    describe('collections', () => {
        it('can be created', async () => {
            const title = 'Test Collection';
            const owner = 'test-owner';

            await environment.collectionService.createExerciseSet(title, owner);

            const collections = await environment.collectionService.getLatestExerciseElementSetsForUser(
                owner, { includeDraftState: true }
            );

            expect(collections).toHaveLength(1);
            expect(collections[0]?.title).toBe(title);
            expect(collections[0]?.owner).toBe(owner);
            expect(collections[0]?.draftState).toBe(false);

            console.log(collections);
        });

        describe("visibility change", () => {
            it("works for existing collections", async () => {
                const title = 'Test Collection';
                const owner = 'test-owner';

                const collection = await environment.collectionService.createExerciseSet(title, owner);
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

        describe("deletion", () => {

        })
    });

    describe('elements', () => {
        describe('creation', () => {
            it("works and can change draft-state", async () => {
                const title = 'Test Collection';
                const owner = 'test-owner';
                const content = {
                    type: "alarmGroup",
                    alarmGroupVehicles: {},
                    id: "test-alarm-group-id",
                    name: "Test Alarm Group",
                    triggerCount: 0,
                    triggerLimit: null,
                } satisfies AlarmGroup;

                const collection = await environment.collectionService.createExerciseSet(title, owner);

                expect(collection).toBeDefined();
                if (!collection) return;

                const element = await environment.collectionService.createExerciseObject(collection.entityId, content);

                expect(element.result.title).toBe(content.name);
                expect(element.result.content).toEqual(content);
                expect(element.newSetVersionId).not.toBe(collection.versionId);


                const collectionData = await environment.collectionService.getCollectionVersionById(element.newSetVersionId);
                expect(collectionData?.draftState).toBe(true);

                const content2 = {
                    ...content,
                    id: "test-alarm-group-id-2",
                    name: "Test Alarm Group 2",
                }

                const element2 = await environment.collectionService.createExerciseObject(collection.entityId, content2);

                expect(element2.result.title).toBe(content2.name);
                expect(element2.result.content).toEqual(content2);

                expect(element2.newSetVersionId).not.toBe(collection.versionId);
                expect(element2.newSetVersionId).toBe(element.newSetVersionId);


                const elements = await environment.collectionService.getElementsOfCollectionVersion(element.newSetVersionId, { allowDraftState: true });

                expect(elements.direct).toEqual([element.result, element2.result])
                expect(elements.transitive).toEqual([])
            });

            it("does not work for non-existing collections", async () => {
                const content = {
                    type: "alarmGroup",
                    alarmGroupVehicles: {},
                    id: "test-alarm-group-id",
                    name: "Test Alarm Group",
                    triggerCount: 0,
                    triggerLimit: null,
                } satisfies AlarmGroup;

                expect(async () => {
                    await environment.collectionService.createExerciseObject("non-existing-collection-id" as Marketplace.Set.EntityId, content)
                }).rejects.toThrow()
            })
        })

        describe('deletion', () => {
            it("works and can change draft-state", async () => {
                const title = 'Test Collection';
                const owner = 'test-owner';
                const content = {
                    type: "alarmGroup",
                    alarmGroupVehicles: {},
                    id: "test-alarm-group-id",
                    name: "Test Alarm Group",
                    triggerCount: 0,
                    triggerLimit: null,
                } satisfies AlarmGroup;

                const collection = await environment.collectionService.createExerciseSet(title, owner);

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




































