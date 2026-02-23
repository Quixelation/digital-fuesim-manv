import { Router } from 'express';
import { isAuthenticatedMiddleware } from '../utils/http-handlers.js';
import { ExerciseElementSetService } from '../database/services/exercise-set-service.js';
import { Marketplace } from 'fuesim-digital-shared';
import { NotFoundError } from '../utils/http.js';
import { z } from 'zod';

export function createExerciseObjectsRouter(
    exerciseElementSetService: ExerciseElementSetService
) {
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

    router.get('/my', async (req, res) => {
        const result =
            await exerciseElementSetService.getLatestExerciseElementSetsForUser(
                req.session!.user.id
            );

        return res.send(
            Marketplace.Set.LoadMy.responseSchema.encode({
                result: result.map((setElement) => ({
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

    router.post('/create', async (req, res) => {
        const parsedBody = Marketplace.Set.Create.requestSchema.parse(req.body);

        const result = await exerciseElementSetService.createExerciseSet(
            parsedBody.title,
            req.session!.user.id
        );

        if (!result) {
            throw new Error('Failed to create exercise element set');
        }

        return res.send(
            Marketplace.Set.Create.responseSchema.encode({
                result: {
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

    router.get('/:exerciseElementSetId', async (req, res) => {
        const exerciseElementSetId = req.params.exerciseElementSetId;
        if (!Marketplace.Set.isSetEntityId(exerciseElementSetId)) {
            throw new Error('Invalid exercise element set version id');
        }

        const result =
            await exerciseElementSetService.getLatestExerciseElementSetById(
                exerciseElementSetId
            );
        if (!result) {
            throw new NotFoundError();
        }

        return res.send(
            Marketplace.Set.GetByVersionId.responseSchema.encode({
                result: {
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

    router.post('/:setEntityId/create', async (req, res) => {
        const { setEntityId } = req.params;
        if (!Marketplace.Set.isSetEntityId(setEntityId)) {
            throw new Error('Invalid exercise element set version id');
        }

        const parsedBody = Marketplace.Element.Create.requestSchema.parse(
            req.body
        );

        const data = await exerciseElementSetService.createExerciseObject(
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

    router.get('/:setEntityId/latest', async (req, res) => {
        const { setEntityId } = req.params;
        if (!Marketplace.Set.isSetEntityId(setEntityId)) {
            throw new Error('Invalid exercise element set entity id');
        }
        const data =
            await exerciseElementSetService.getLatestExerciseElementsForSet(
                setEntityId
            );

        return res.send(
            Marketplace.Set.GetLatestElementsBySetVersionId.responseSchema.encode(
                {
                    result: data.map((element) => ({
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

    router.post('/:setEntityId/change-visibility', async (req, res) => {
        const { setEntityId } = req.params;

        if (!Marketplace.Set.isSetEntityId(setEntityId)) {
            throw new Error('Invalid exercise element set entity id');
        }

        const parsedBody = Marketplace.Set.ChangeVisibility.requestSchema.parse(
            req.body
        );

        const data = await exerciseElementSetService.changeSetVisbility(
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
                await exerciseElementSetService.duplicateExerciseElementSetVersion(
                    setVersionId,
                    'test-owner'
                );

            res.send(
                Marketplace.Set.Duplicate.responseSchema.encode({
                    createdSet: {
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

    router.delete('/:setEntityId/entity', async (req, res) => {
        const setEntityId = req.params.setEntityId;
        if (!Marketplace.Set.isSetEntityId(setEntityId)) {
            throw new Error('Invalid exercise element set version id');
        }
        await exerciseElementSetService.deleteExerciseElementSet(setEntityId);
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

        const data =
            await exerciseElementSetService.updateExerciseElementObject(
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
            await exerciseElementSetService.deleteExerciseElementObjectFromSet(
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

        const data =
            await exerciseElementSetService.getExerciseElementObjectVersions(
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
