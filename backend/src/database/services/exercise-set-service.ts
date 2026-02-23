import { Marketplace } from 'fuesim-digital-shared';
import { ExerciseElementSetRepository } from '../repositories/exercise-element-set-repository.js';
import { DatabaseConnection } from './database-service.js';
import { ExerciseRepository } from '../repositories/exercise-repository.js';

export class ExerciseElementSetService {
    private exists<T>(elementName: string, element: T | undefined | null): T {
        if (!element) {
            throw new Error(`No ${elementName} found`);
        }
        return element;
    }

    constructor(
        private exerciseElementSetRepository: ExerciseElementSetRepository
    ) {}

    public async createExerciseSet(name: string, owner: string) {
        return this.exerciseElementSetRepository.createExerciseSet(name, owner);
    }

    public async createExerciseObject(
        setEntityId: Marketplace.Set.EntityId,
        content: Marketplace.ExerciseElementObjectUnion
    ) {
        return this.exerciseElementSetRepository.transaction(async (tx) => {
            const result = await tx.createExerciseObjectVersion({
                version: 1,
                content,
            });

            if (!result) {
                throw new Error('Failed to create exercise element object');
            }

            const latestSetVersion = this.exists(
                'set version',
                await tx.getLatestSetByEntityId(setEntityId)
            );

            const newSetVersion = await this.createNewSetVersion(
                latestSetVersion,
                tx
            );

            await tx.addExerciseObjectToSet(
                result.versionId,
                newSetVersion.versionId
            );

            return {
                newSetVersionId: newSetVersion.versionId,
                result,
            };
        });
    }

    public async getLatestExerciseElementSetsForUser(userId: string) {
        return this.exerciseElementSetRepository.getLatestExerciseElementSetsForUser(
            userId
        );
    }

    public async getLatestExerciseElementSetById(
        setEntityId: Marketplace.Set.EntityId
    ) {
        return this.exerciseElementSetRepository.getLatestSetByEntityId(
            setEntityId
        );
    }

    public async getLatestExerciseElementsForSet(
        setEntityId: Marketplace.Set.EntityId
    ) {
        const latestSetVersion = this.exists(
            'latest set version',
            await this.getLatestExerciseElementSetById(setEntityId)
        );
        return this.exerciseElementSetRepository.getExerciseElementsOfSetVersion(
            latestSetVersion.versionId
        );
    }

    public async deleteExerciseElementObjectFromSet(
        elementEntityId: Marketplace.Element.EntityId
    ) {
        return await this.exerciseElementSetRepository.transaction(
            async (tx) => {
                const containingSet = this.exists(
                    'containing set',
                    await tx.getLatestSetOfElementEntity(elementEntityId)
                );

                const newSet = await this.createNewSetVersion(
                    containingSet,
                    tx
                );

                await tx.removeExerciseObjectFromSet(
                    elementEntityId,
                    newSet.versionId
                );

                return newSet;
            }
        );
    }

    public async deleteExerciseElementSet(
        setEntityId: Marketplace.Set.EntityId
    ) {
        //TODO: @Quixelation - forbid, if set is public, and do some other checks
        return;
    }

    public async getExerciseElementObjectVersions(
        entityId: Marketplace.Element.EntityId
    ) {
        return this.exerciseElementSetRepository.getExerciseElementObjectVersions(
            entityId
        );
    }

    private async createNewSetVersion(
        oldSet: {
            entityId: Marketplace.Set.EntityId;
            versionId: Marketplace.Set.VersionId;
        },
        tx?: ExerciseElementSetRepository
    ) {
        if (!tx) {
            tx = this.exerciseElementSetRepository;
        }

        const newSetVersion = this.exists(
            'new set',
            await tx.createExerciseSetVersion(oldSet.entityId)
        );

        await tx.copyReferencesBetweenSets(
            oldSet.versionId,
            newSetVersion.versionId
        );

        return newSetVersion;
    }

    public async updateExerciseElementObject(
        entityId: Marketplace.Element.EntityId,
        content: Marketplace.ExerciseElementObjectUnion
    ) {
        return this.exerciseElementSetRepository.transaction(async (tx) => {
            const latestObject = this.exists(
                'latest exercise element',
                await tx.getLatestExerciseElementObjectVersion(entityId)
            );

            const latestContainingSet = this.exists(
                'element set',
                await tx.getLatestSetOfElementEntity(entityId)
            );

            const newElementVersion = this.exists(
                'new exercise element',
                await tx.createExerciseObjectVersion({
                    content,
                    version: latestObject.version + 1,
                    entityId,
                })
            );

            const newSetVersion = await this.createNewSetVersion(
                latestContainingSet,
                tx
            );

            await tx.addExerciseObjectToSet(
                newElementVersion.versionId,
                newSetVersion.versionId
            );

            return {
                newSetVersionId: newSetVersion.versionId,
                newElement: newElementVersion,
            };
        });
    }

    public async changeSetVisbility(
        setEntityId: Marketplace.Set.EntityId,
        visibility: Marketplace.ElementSetVisibility
    ) {
        if (visibility === 'private') {
            throw new Error('private visibility can not be set afterwards');
        }

        return this.exerciseElementSetRepository.setExerciseElementSetVisibility(
            setEntityId,
            visibility
        );
    }

    public async duplicateExerciseElementSetVersion(
        setVersionId: Marketplace.Set.VersionId,
        owner: string
    ) {
        const latestSetEntity =
            await this.exerciseElementSetRepository.getExerciseElementSetByVersionId(
                setVersionId
            );

        if (!latestSetEntity) {
            throw new Error(
                `No exercise element set found with entityId ${setVersionId}`
            );
        }

        const newSet =
            await this.exerciseElementSetRepository.createExerciseSet(
                //TODO: Quixelation : also duplicate description (visbility should stay private)
                'Kopie von ' + latestSetEntity.title,
                owner
            );

        if (!newSet) {
            throw new Error('Failed to create new exercise element set');
        }

        await this.exerciseElementSetRepository.copyElementsBetweenSets(
            {
                versionId: setVersionId,
                entityId: latestSetEntity.entityId,
            },
            newSet
        );

        return newSet;
    }
}
