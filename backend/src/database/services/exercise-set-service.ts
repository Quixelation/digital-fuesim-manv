import {
    ElementSetVisibility,
    ExerciseElementObjectUnion,
    Marketplace,
} from 'fuesim-digital-shared';
import { ExerciseElementSetRepository } from '../repositories/exercise-element-set-repository.js';

export class ExerciseElementSetService {
    private exists<T>(elementName: string, element: T | undefined | null): T {
        if (!element) {
            throw new Error(`No ${elementName} found`);
        }
        return element;
    }

    constructor(
        private exerciseElementSetRepository: ExerciseElementSetRepository
    ) { }

    public async createExerciseSet(name: string, owner: string) {
        return this.exerciseElementSetRepository.createExerciseSet(name, owner);
    }

    public async createExerciseObject(
        exerciseElementSetVersionId: Marketplace.Set.VersionId,
        content: ExerciseElementObjectUnion
    ) {
        const result = await this.exerciseElementSetRepository.createExerciseObjectVersion(
            {
                version: 1,
                content,
            }
        );

        if (!result) {
            throw new Error('Failed to create exercise element object');
        }

        await this.exerciseElementSetRepository.addExerciseObjectToSet(
            result.versionId,
            exerciseElementSetVersionId,
        );

        return result;
    }

    public async getExerciseElementSetsForUser(userId: string) {
        return this.exerciseElementSetRepository.getExerciseElementSetsForUser(
            userId
        );
    }

    public async getExerciseElementSetByVersionId(
        exerciseElementSetVersionId: Marketplace.Set.VersionId
    ) {
        return this.exerciseElementSetRepository.getExerciseElementSetByVersionId(
            exerciseElementSetVersionId
        );
    }

    public async getLatestExerciseElementsForSet(
        elementSetId: Marketplace.Set.VersionId
    ) {
        return this.exerciseElementSetRepository.getLatestExerciseElementsForSet(
            elementSetId
        );
    }

    public async deleteExerciseElementObject(
        entityId: Marketplace.Element.EntityId
    ) {
        return this.exerciseElementSetRepository.deleteExerciseElementObjectByEntityId(
            entityId
        );
    }

    public async deleteExerciseElementSet(setVersionId: Marketplace.Set.VersionId) {
        const entity = this.exists(
            "exercise element set",
            await this.getExerciseElementSetByVersionId(setVersionId));

        return this.exerciseElementSetRepository.deleteExerciseElementSet(entity.entityId);
    }

    public async getExerciseElementObjectVersions(
        entityId: Marketplace.Element.EntityId
    ) {
        return this.exerciseElementSetRepository.getExerciseElementObjectVersions(
            entityId
        );
    }

    public async updateExerciseElementObject(
        entityId: Marketplace.Element.EntityId,
        content: ExerciseElementObjectUnion
    ) {
        return this.exerciseElementSetRepository.transaction(async (tx) => {
            const latestObject =
                this.exists(
                    "latest exercise element",
                    await tx.getLatestExerciseElementObjectVersion(
                        entityId
                    ));

            const oldLatestContainingSet =
                this.exists("element set",
                    await tx.getLatestSetByElementVersionId(
                        latestObject.versionId))


            const newElementVersion = this.exists(
                "new exercise element",
                await tx.createExerciseObjectVersion(
                    {
                        content,
                        version: latestObject.version + 1,
                        entityId
                    }
                ))


            const newSetVersion = this.exists("new set", await tx.createExerciseSetVersion(oldLatestContainingSet.entityId))

            await tx.copyReferencesBetweenSets(
                oldLatestContainingSet.versionId,
                newSetVersion.versionId
            );

            await tx.addExerciseObjectToSet(
                newElementVersion.versionId,
                newSetVersion.versionId
            );

            return {
                newSetVersionId: newSetVersion.versionId,
                newElement: newElementVersion,
            }
        })
    }

    public async changeSetVisbility(
        setVersionId: Marketplace.Set.VersionId,
        visibility: ElementSetVisibility
    ) {
        if (visibility === 'private') {
            throw new Error('private visibility can not be set afterwards');
        }

        const entity =
            await this.getExerciseElementSetByVersionId(setVersionId);

        if (!entity) {
            throw new Error(
                `No exercise element set found with entityId ${setVersionId}`
            );
        }

        return this.exerciseElementSetRepository.setExerciseElementSetVisibility(
            entity.entityId,
            visibility
        );
    }

    public async duplicateExerciseElementSet(
        setVersionId: Marketplace.Set.VersionId,
        owner: string
    ) {
        const entity =
            await this.getExerciseElementSetByVersionId(setVersionId);

        if (!entity) {
            throw new Error(
                `No exercise element set found with entityId ${setVersionId}`
            );
        }

        const newSet =
            await this.exerciseElementSetRepository.createExerciseSet(
                //TODO: Quixelation : also duplicate description (visbility should stay private)
                "Kopie von " + entity.title,
                owner
            );

        if (!newSet) {
            throw new Error('Failed to create new exercise element set');
        }

        await this.exerciseElementSetRepository.copyElementsBetweenSets(
            setVersionId,
            newSet.versionId
        );

        return newSet;
    }
}
