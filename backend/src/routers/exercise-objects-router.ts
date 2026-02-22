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
            await exerciseElementSetService.getExerciseElementSetsForUser(
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
        if (!Marketplace.Set.isSetVersionId(exerciseElementSetId)) {
            throw new Error('Invalid exercise element set version id');
        }

        const result =
            await exerciseElementSetService.getExerciseElementSetByVersionId(
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

    router.post('/:exerciseElementSetId/create', async (req, res) => {
        console.log(req.body);
        console.log(req.params.exerciseElementSetId);

        const parsedBody = Marketplace.Element.Create.requestSchema.parse(
            req.body
        );

        if (!Marketplace.Set.isSetVersionId(req.params.exerciseElementSetId)) {
            throw new Error('Invalid exercise element set version id');
        }

        const data = await exerciseElementSetService.createExerciseObject(
            req.params.exerciseElementSetId,
            parsedBody.data
        );

        if (!data) {
            throw new Error('Failed to create exercise element object');
        }

        res.send(
            Marketplace.Element.Create.responseSchema.encode({
                result: {
                    content: data.content,
                    createdAt: data.createdAt.toISOString(),
                    entityId: data?.entityId,
                    stateVersion: data?.stateVersion,
                    title: data?.title,
                    version: data.version,
                    versionId: data?.versionId,
                },
            })
        );
    });

    router.get('/:exerciseElementSetId/latest', async (req, res) => {
        if (!Marketplace.Set.isSetVersionId(req.params.exerciseElementSetId)) {
            throw new Error('Invalid exercise element set version id');
        }
        const data =
            await exerciseElementSetService.getLatestExerciseElementsForSet(
                req.params.exerciseElementSetId
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

    router.post(
        '/:exerciseElementSetId/change-visibility',
        async (req, res) => {
            if (
                !Marketplace.Set.isSetVersionId(req.params.exerciseElementSetId)
            ) {
                throw new Error('Invalid exercise element set version id');
            }

            const parsedBody =
                Marketplace.Set.ChangeVisibility.requestSchema.parse(req.body);

            const data = await exerciseElementSetService.changeSetVisbility(
                req.params.exerciseElementSetId,
                parsedBody.visibility
            );

            res.send(
                Marketplace.Set.ChangeVisibility.responseSchema.encode({
                    status: 'success',
                })
            );
        }
    );

    router.post('/:exerciseElementSetId/duplicate', async (req, res) => {
        if (!Marketplace.Set.isSetVersionId(req.params.exerciseElementSetId)) {
            throw new Error('Invalid exercise element set version id');
        }

        const createdSet =
            await exerciseElementSetService.duplicateExerciseElementSet(
                req.params.exerciseElementSetId,
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
    });

    router.delete('/:exerciseElementSetId/entity', async (req, res) => {
        if (!Marketplace.Set.isSetVersionId(req.params.exerciseElementSetId)) {
            throw new Error('Invalid exercise element set version id');
        }
        await exerciseElementSetService.deleteExerciseElementSet(req.params.exerciseElementSetId);
        res.sendStatus(204);
    })

    router.delete('/object/:entityId', async (req, res) => {
        if (!Marketplace.Element.isEntityId(req.params.entityId)) {
            throw new Error('Invalid exercise element object entity id');
        }

        await exerciseElementSetService.deleteExerciseElementObject(
            req.params.entityId
        );
        return res.sendStatus(204);
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

    router.put('/object/:entityId', async (req, res) => {
        if (!Marketplace.Element.isEntityId(req.params.entityId)) {
            throw new Error('Invalid exercise element object entity id');
        }
        const parsedBody = Marketplace.Element.Edit.requestSchema.parse(
            req.body
        );
        const data =
            await exerciseElementSetService.updateExerciseElementObject(
                req.params.entityId,
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

    return router;
}
