import { Router } from 'express';
import { isAuthenticatedMiddleware } from '../utils/http-handlers.js';
import { Marketplace } from 'fuesim-digital-shared';
import { NotFoundError } from '../utils/http.js';
import { CollectionService } from '../database/services/collection-service.js';
import { CollectionEventSender } from '../collections/collection-event-sender.js';

export function createCollectionsRouter(collectionService: CollectionService) {
    const router = Router();

    router.use((req, res, next) => {
        console.log(
            '[CollectionsRouter] Request received:',
            req.method,
            req.path,
            'User:',
            req.session?.user.id
        );
        next();
    });
    router.use(isAuthenticatedMiddleware);

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
                result,
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
                result,
            })
        );
    });

    router.use('/:setEntityId', async (req, res, next) => {
        const exerciseElementSetId = req.params.setEntityId;
        console.log(
            '[CollectionsRouter] Middleware for /:setEntityId - setEntityId:',
            exerciseElementSetId
        );
        if (!Marketplace.Set.isSetEntityId(exerciseElementSetId)) {
            return res.status(400).send({ error: 'Invalid collection id' });
        }

        const collection = await collectionService.getLatestCollectionById(
            exerciseElementSetId,
            { draftState: true }
        );
        if (!collection) {
            return res.status(404).send({ error: 'Collection not found' });
        }

        //@ts-ignore
        req.collection = collection;
        next();
        return;
    })

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
                result,
            })
        );
    });

    /*
     * Create a new Collection-Element in the Collection
     */
    router.post('/:setEntityId/create', async (req, res) => {
        console.log("POST /:setEntityId/create CALLEEEEEEEEEEEEEEEEEEEEEED", req.params.setEntityId);
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
                result: data.result
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
                        collection: data.collection,
                        elements: data.elements
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
                    transitive: data.transitive ?? [],
                    direct: data.direct
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

        let newCollectionState: Awaited<ReturnType<typeof collectionService.saveDraftState>> | undefined;
        try {
            newCollectionState = await collectionService.saveDraftState(setEntityId);
        }
        catch (e) {
            res.send(
                Marketplace.Set.SaveDraftState.responseSchema.encode({
                    result: null,
                    saved: false,
                })
            )
        }

        if (!newCollectionState) {
            throw new Error('Failed to save exercise element set');
        }

        res.send(
            Marketplace.Set.SaveDraftState.responseSchema.encode({
                result: newCollectionState,
                saved: true

            })
        );
    });

    router.post('/:setEntityId/change-visibility', async (req, res) => {
        const { setEntityId } = req.params;

        if (!Marketplace.Set.isSetEntityId(setEntityId)) {
            throw new Error('Invalid exercise element set entity id');
        }

        const data = await collectionService.makeCollectionPublic(
            setEntityId,
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
                    req.session!.user.id
                );

            res.send(
                Marketplace.Set.Duplicate.responseSchema.encode({
                    createdSet,
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
                result: collection,
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
                        transitive: data.transitive ?? [],
                        direct: data.direct,
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
                result: data.newElement,
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
                result: data
            })
        );
    });

    return router;
}
