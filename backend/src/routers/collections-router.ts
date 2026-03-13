import { Router } from 'express';
import { isAuthenticatedMiddleware } from '../utils/http-handlers.js';
import { Marketplace } from 'fuesim-digital-shared';
import { NotFoundError } from '../utils/http.js';
import { z } from 'zod';
import { CollectionService } from '../database/services/collection-service.js';
import { filter, Subject, takeUntil } from 'rxjs';
import { SSE } from '../sse.js';
import { CollectionEventSender } from '../collections/collection-event-sender.js';

export function createCollectionsRouter(collectionService: CollectionService) {
    const router = Router();

    router.use((req, res, next) => {
        console.log(
            '[ExerciseObjectsRouter] Request received:',
            req.method,
            req.path,
            'User:',
            req.session?.user.id
        );
        next();
    });
    router.use(isAuthenticatedMiddleware);

    router.get('/events', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const send = () => {
            const payload = JSON.stringify({ time: new Date().toISOString() });
            res.write(`data: ${payload}\n\n`);
        };

        send(); // Send initial data immediately
        const interval = setInterval(send, 5000);

        req.on('close', () => {
            clearInterval(interval);
            console.log('Cleanup: Client disconnected');
        });
    });

    router.get('/my', async (req, res) => {
        const includeDraftState = req.query['includeDraftState'] === 'true';

        console.log(
            '[CollectionsRouter] GET /my - includeDraftState:',
            includeDraftState
        );
        console.log(
            '[CollectionsRouter] GET /my - includeDraftState:',
            typeof includeDraftState
        );

        const result =
            await collectionService.getLatestExerciseElementSetsForUser(
                req.session!.user.id,
                { includeDraftState }
            );

        return res.send(
            Marketplace.Set.LoadMy.responseSchema.encode({
                result: result.map((setElement) => ({
                    draftState: setElement.draftState,
                    createdAt: setElement.createdAt.toISOString(),
                    entityId: setElement.entityId,
                    owner: setElement.owner,
                    stateVersion: setElement.stateVersion,
                    title: setElement.title,
                    version: setElement.version,
                    versionId: setElement.versionId,
                    visibility: setElement.visibility,
                })),
            })
        );
    });

    /*
     * Creates a new Collection
     */
    router.post('/create', async (req, res) => {
        const parsedBody = Marketplace.Set.Create.requestSchema.parse(req.body);

        const result = await collectionService.createExerciseSet(
            parsedBody.title,
            req.session!.user.id
        );

        if (!result) {
            throw new Error('Failed to create exercise element set');
        }

        return res.send(
            Marketplace.Set.Create.responseSchema.encode({
                result: {
                    draftState: result.draftState,
                    createdAt: result.createdAt.toISOString(),
                    entityId: result.entityId,
                    owner: result.owner,
                    stateVersion: result.stateVersion,
                    title: result.title,
                    version: result.version,
                    versionId: result.versionId,
                    visibility: result.visibility,
                },
            })
        );
    });

    /*
     * Get the metadata of the latest version of the collection
     */
    router.get('/:setEntityId', async (req, res) => {
        const exerciseElementSetId = req.params.setEntityId;
        if (!Marketplace.Set.isSetEntityId(exerciseElementSetId)) {
            throw new Error('Invalid exercise element set version id');
        }

        const result = await collectionService.getLatestCollectionById(
            exerciseElementSetId,
            { draftState: true }
        );
        if (!result) {
            throw new NotFoundError();
        }

        return res.send(
            Marketplace.Set.GetByEntityId.responseSchema.encode({
                result: {
                    draftState: result.draftState,
                    createdAt: result.createdAt.toISOString(),
                    entityId: result.entityId,
                    owner: result.owner,
                    stateVersion: result.stateVersion,
                    title: result.title,
                    version: result.version,
                    versionId: result.versionId,
                    visibility: result.visibility,
                },
            })
        );
    });

    /*
     * Create a new Collection-Element in the Collection
     */
    router.post('/:setEntityId/create', async (req, res) => {
        const { setEntityId } = req.params;
        if (!Marketplace.Set.isSetEntityId(setEntityId)) {
            throw new Error('Invalid exercise element set version id');
        }

        const parsedBody = Marketplace.Element.Create.requestSchema.parse(
            req.body
        );

        const data = await collectionService.createExerciseObject(
            setEntityId,
            parsedBody.data
        );

        if (!data) {
            throw new Error('Failed to create exercise element object');
        }

        res.send(
            Marketplace.Element.Create.responseSchema.encode({
                newSetVersionId: data.newSetVersionId,
                result: {
                    content: data.result.content,
                    createdAt: data.result.createdAt.toISOString(),
                    entityId: data.result.entityId,
                    stateVersion: data.result.stateVersion,
                    title: data.result.title,
                    version: data.result.version,
                    versionId: data.result.versionId,
                },
            })
        );
    });

    router.post(
        '/:setEntityId/dependencies/:importSetVersionId',
        async (req, res) => {
            const { setEntityId, importSetVersionId } = req.params;
            if (!Marketplace.Set.isSetEntityId(setEntityId)) {
                throw new Error('Invalid exercise element set version id');
            }
            if (!Marketplace.Set.isSetVersionId(importSetVersionId)) {
                throw new Error('Invalid exercise element set version id');
            }

            const data = await collectionService.addCollectionDependency(
                {
                    importTo: setEntityId,
                    importFrom: importSetVersionId,
                },
                { throwOnDraftState: false }
            );

            res.send(
                Marketplace.Set.Import.responseSchema.encode({
                    importedSet: {
                        collection: {
                            title: data.collection.title,
                            versionId: data.collection.versionId,
                            version: data.collection.version,
                            entityId: data.collection.entityId,
                            stateVersion: data.collection.stateVersion,
                            createdAt: data.collection.createdAt.toISOString(),
                            owner: data.collection.owner,
                            visibility: data.collection.visibility,
                            draftState: data.collection.draftState,
                        },
                        elements: data.elements.map((element) => ({
                            content: element.content,
                            createdAt: element.createdAt.toISOString(),
                            entityId: element.entityId,
                            stateVersion: element.stateVersion,
                            title: element.title,
                            version: element.version,
                            versionId: element.versionId,
                        })),
                    },
                })
            );
        }
    );

    router.delete(
        '/:setEntityId/dependencies/:importSetVersionId',
        async (req, res) => {
            const { setEntityId, importSetVersionId } = req.params;
            if (!Marketplace.Set.isSetEntityId(setEntityId)) {
                throw new Error('Invalid exercise element set version id');
            }
            if (!Marketplace.Set.isSetVersionId(importSetVersionId)) {
                throw new Error('Invalid exercise element set version id');
            }

            await collectionService.removeCollectionDependency({
                removeFrom: setEntityId,
                dependencyEntityId: importSetVersionId,
            });

            res.send({ status: 'success' });
        }
    );

    router.get('/:setEntityId/latest', async (req, res) => {
        const { setEntityId } = req.params;
        if (!Marketplace.Set.isSetEntityId(setEntityId)) {
            throw new Error('Invalid exercise element set entity id');
        }

        const data = await collectionService.getLatestDraftElementsOfCollection(
            setEntityId,
            { includeDependencies: true }
        );

        res.send(
            Marketplace.Set.GetLatestElementsBySetVersionId.responseSchema.encode(
                {
                    //TODO: @Quixelation
                    //@ts-expect-error - We need to check this in the service layer
                    transitive: data.transitive,
                    //TODO: @Quixelation
                    direct: data.direct.map((element) => ({
                        content: element.content,
                        createdAt: element.createdAt.toISOString(),
                        entityId: element.entityId,
                        stateVersion: element.stateVersion,
                        title: element.title,
                        version: element.version,
                        versionId: element.versionId,
                    })),
                }
            )
        );
    });

    router.get('/:setEntityId/events', async (req, res) => {
        const { setEntityId } = req.params;
        if (!Marketplace.Set.isSetEntityId(setEntityId)) {
            throw new Error('Invalid exercise element set entity id');
        }

        new CollectionEventSender(req, res, setEntityId, collectionService);
    });

    router.post('/:setEntityId/save', async (req, res) => {
        const { setEntityId } = req.params;
        if (!Marketplace.Set.isSetEntityId(setEntityId)) {
            throw new Error('Invalid exercise element set version id');
        }

        const newCollectionState =
            await collectionService.saveDraftState(setEntityId);

        if (!newCollectionState) {
            throw new Error('Failed to save exercise element set');
        }

        res.send(
            Marketplace.Set.SaveDraftState.responseSchema.encode({
                result: {
                    title: newCollectionState.title,
                    versionId: newCollectionState.versionId,
                    version: newCollectionState.version,
                    entityId: newCollectionState.entityId,
                    stateVersion: newCollectionState.stateVersion,
                    createdAt: newCollectionState.createdAt.toISOString(),
                    owner: newCollectionState.owner,
                    visibility: newCollectionState.visibility,
                    draftState: newCollectionState.draftState,
                },
            })
        );
    });

    router.post('/:setEntityId/change-visibility', async (req, res) => {
        const { setEntityId } = req.params;

        if (!Marketplace.Set.isSetEntityId(setEntityId)) {
            throw new Error('Invalid exercise element set entity id');
        }

        const parsedBody = Marketplace.Set.ChangeVisibility.requestSchema.parse(
            req.body
        );

        const data = await collectionService.makeCollectionPublic(
            setEntityId,
            parsedBody.visibility
        );

        res.send(
            Marketplace.Set.ChangeVisibility.responseSchema.encode({
                status: 'success',
            })
        );
    });

    router.post(
        '/:setEntityId/version/:setVersionId/duplicate',
        async (req, res) => {
            const { setVersionId } = req.params;
            if (!Marketplace.Set.isSetVersionId(setVersionId)) {
                throw new Error('Invalid exercise element set version id');
            }

            const createdSet =
                await collectionService.duplicateExerciseElementSetVersion(
                    setVersionId,
                    'test-owner'
                );

            res.send(
                Marketplace.Set.Duplicate.responseSchema.encode({
                    createdSet: {
                        draftState: createdSet.draftState,
                        versionId: createdSet.versionId,
                        version: createdSet.version,
                        entityId: createdSet.entityId,
                        stateVersion: createdSet.stateVersion,
                        createdAt: createdSet.createdAt.toISOString(),
                        title: createdSet.title,
                        owner: createdSet.owner,
                        visibility: createdSet.visibility,
                    },
                })
            );
        }
    );
    router.get('/:setEntityId/version/:setVersionId', async (req, res) => {
        const { setEntityId, setVersionId } = req.params;
        if (!Marketplace.Set.isSetEntityId(setEntityId)) {
            throw new Error('Invalid exercise element set entity id');
        }
        if (!Marketplace.Set.isSetVersionId(setVersionId)) {
            throw new Error('Invalid exercise element set version id');
        }

        const collection =
            await collectionService.getCollectionVersionById(setVersionId);
        if (!collection) {
            throw new NotFoundError();
        }

        res.send(
            Marketplace.Set.GetCollectionVersion.responseSchema.encode({
                result: {
                    draftState: collection.draftState,
                    versionId: collection.versionId,
                    version: collection.version,
                    entityId: collection.entityId,
                    stateVersion: collection.stateVersion,
                    createdAt: collection.createdAt.toISOString(),
                    title: collection.title,
                    owner: collection.owner,
                    visibility: collection.visibility,
                },
            })
        );
    });

    router.get(
        '/:setEntityId/version/:setVersionId/elements',
        async (req, res) => {
            const { setEntityId, setVersionId } = req.params;
            if (!Marketplace.Set.isSetEntityId(setEntityId)) {
                throw new Error('Invalid exercise element set entity id');
            }
            if (!Marketplace.Set.isSetVersionId(setVersionId)) {
                throw new Error('Invalid exercise element set version id');
            }

            const data = await collectionService.getElementsOfCollectionVersion(
                setVersionId,
                { includeDependencies: true, allowDraftState: false }
            );
            if (!data) {
                throw new NotFoundError();
            }

            res.send(
                Marketplace.Set.GetElementsOfCollectionVersion.responseSchema.encode(
                    {
                        //TODO: @Quixelation
                        //@ts-expect-error - We need to check this in the service layer
                        transitive: data.transitive,
                        //TODO: @Quixelation
                        direct: data.direct.map((element) => ({
                            content: element.content,
                            createdAt: element.createdAt.toISOString(),
                            entityId: element.entityId,
                            stateVersion: element.stateVersion,
                            title: element.title,
                            version: element.version,
                            versionId: element.versionId,
                        })),
                    }
                )
            );
        }
    );

    router.delete('/:setEntityId/entity', async (req, res) => {
        const setEntityId = req.params.setEntityId;
        if (!Marketplace.Set.isSetEntityId(setEntityId)) {
            throw new Error('Invalid exercise element set version id');
        }
        await collectionService.deleteExerciseElementSet(setEntityId);
        res.sendStatus(204);
    });

    router.put('/:setEntityId/entity/:elementEntityId', async (req, res) => {
        const { elementEntityId } = req.params;
        if (!Marketplace.Element.isEntityId(elementEntityId)) {
            throw new Error('Invalid exercise element object entity id');
        }

        const parsedBody = Marketplace.Element.Edit.requestSchema.parse(
            req.body
        );

        const data = await collectionService.updateExerciseElementObject(
            elementEntityId,
            parsedBody.data
        );

        if (!data) {
            throw new Error('Failed to update exercise element object');
        }

        res.send(
            Marketplace.Element.Edit.responseSchema.encode({
                newSetVersionId: data.newSetVersionId,
                result: {
                    entityId: data.newElement.entityId,
                    versionId: data.newElement.versionId,
                    version: data.newElement.version,
                    stateVersion: data.newElement.stateVersion,
                    createdAt: data.newElement.createdAt.toISOString(),
                    title: data.newElement.title,
                    content: data.newElement.content,
                },
            })
        );
    });

    router.delete('/:setEntityId/entity/:elementEntityId', async (req, res) => {
        const { setEntityId, elementEntityId } = req.params;
        if (!Marketplace.Element.isEntityId(elementEntityId)) {
            throw new Error('Invalid exercise element object entity id');
        }
        if (!Marketplace.Set.isSetEntityId(setEntityId)) {
            throw new Error('Invalid exercise element set entity id');
        }

        const newSetVersion =
            await collectionService.deleteExerciseElementObjectFromSet(
                elementEntityId
            );
        return res.send(
            Marketplace.Element.Delete.responseSchema.encode({
                newSetVersionId: newSetVersion.versionId,
            })
        );
    });

    router.get('/object/:entityId/versions', async (req, res) => {
        if (!Marketplace.Element.isEntityId(req.params.entityId)) {
            throw new Error('Invalid exercise element object entity id');
        }

        const data = await collectionService.getExerciseElementObjectVersions(
            req.params.entityId
        );

        return res.send(
            Marketplace.Element.GetByEntityId.responseSchema.encode({
                result: data.map((element) => ({
                    content: element.content,
                    createdAt: element.createdAt.toISOString(),
                    entityId: element.entityId,
                    stateVersion: element.stateVersion,
                    title: element.title,
                    version: element.version,
                    versionId: element.versionId,
                })),
            })
        );
    });

    return router;
}
