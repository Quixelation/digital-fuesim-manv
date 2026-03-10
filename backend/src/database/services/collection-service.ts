import { Marketplace } from 'fuesim-digital-shared';
import { DatabaseConnection } from './database-service.js';
import { ExerciseRepository } from '../repositories/exercise-repository.js';
import { CollectionRepository } from '../repositories/collection-repository.js';
import { z } from 'zod';
import { Subject } from 'rxjs';

abstract class CollectionsEvent {
    public type!: string;
    public payload!: object;
    public collectionId!: Marketplace.Set.EntityId;
}

export class ElementCreateEvent implements CollectionsEvent {
    public type = 'element:create' as const;

    constructor(
        public collectionId: Marketplace.Set.EntityId,
        public payload: Marketplace.Element.Dto
    ) {}
}

export class ElementUpdateEvent implements CollectionsEvent {
    public type = 'element:update' as const;

    constructor(
        public collectionId: Marketplace.Set.EntityId,
        public payload: Marketplace.Element.Dto
    ) {}
}

export class ElementDeleteEvent implements CollectionsEvent {
    public type = 'element:delete' as const;

    constructor(
        public collectionId: Marketplace.Set.EntityId,
        public payload: {
            entityId: Marketplace.Element.EntityId;
        }
    ) {}
}

export class CollectionUpdateEvent implements CollectionsEvent {
    public type = 'collection:update' as const;

    constructor(
        public collectionId: Marketplace.Set.EntityId,
        public payload: Marketplace.Set.Dto
    ) {}
}

export class AddDependencyEvent implements CollectionsEvent {
    public type = 'dependency:add' as const;

    constructor(
        public collectionId: Marketplace.Set.EntityId,
        public payload: {
            dependencyEntityId: Marketplace.Set.VersionId;
        }
    ) {}
}

export class SwitchVersionEvent implements CollectionsEvent {
    public type = 'version:switch' as const;

    constructor(
        public collectionId: Marketplace.Set.EntityId,
        public payload: {
            versionId: Marketplace.Set.VersionId;
        }
    ) {}
}

export class CollectionService {
    public get events() {
        return this.eventSubject.asObservable();
    }

    private eventSubject = new Subject<
        | ElementCreateEvent
        | ElementUpdateEvent
        | ElementDeleteEvent
        | AddDependencyEvent
        | CollectionUpdateEvent
        | SwitchVersionEvent
    >();

    private exists<T>(
        elementName: string,
        element: T | undefined | null
    ): NonNullable<T> {
        if (!element) {
            throw new Error(`No ${elementName} found`);
        }
        return element;
    }

    constructor(private exerciseElementSetRepository: CollectionRepository) {}

    public async createExerciseSet(name: string, owner: string) {
        return this.exerciseElementSetRepository.createFirstCollectionVersion(
            name,
            owner
        );
    }

    public async removeCollectionDependency(data: {
        removeFrom: Marketplace.Set.EntityId;
        dependencyEntityId: Marketplace.Set.VersionId;
    }) {
        return this.exerciseElementSetRepository.transaction(async (tx) => {
            const draftState = await tx.getOrCreateDraftState(data.removeFrom);

            await tx.removeCollectionVersionDependency(
                draftState.versionId,
                data.dependencyEntityId
            );

            this.eventSubject.next(
                new SwitchVersionEvent(data.removeFrom, {
                    versionId: draftState.versionId,
                })
            );

            return draftState;
        });
    }

    public async saveDraftState(collectionEntityId: Marketplace.Set.EntityId) {
        const data =
            await this.exerciseElementSetRepository.saveDraftState(
                collectionEntityId
            );

        this.eventSubject.next(
            new CollectionUpdateEvent(collectionEntityId, {
                entityId: data.entityId,
                versionId: data.versionId,
                version: data.version,
                title: data.title,
                owner: data.owner,
                createdAt: data.createdAt.toISOString(),
                stateVersion: data.stateVersion,
                visibility: data.visibility,
                draftState: data.draftState,
            })
        );

        return data;
    }

    public async addCollectionDependency(
        data: {
            importTo: Marketplace.Set.EntityId;
            importFrom: Marketplace.Set.VersionId;
        },
        opts: { throwOnDraftState: boolean }
    ) {
        const { throwOnDraftState } = opts;
        return this.exerciseElementSetRepository.transaction(async (tx) => {
            const latestDependentCollectionVersion = this.exists(
                'set version',
                await tx.getOrCreateDraftState(data.importTo)
            );

            const existingDependencies =
                await tx.getCollectionVersionDependencies(
                    latestDependentCollectionVersion.versionId
                );

            if (existingDependencies.length > 1) {
                console.error(
                    'Importing collection version with multiple dependencies is not supported yet'
                );
                throw new Error(
                    'Importing collection version with multiple dependencies is not supported yet'
                );
            }

            let importFromCollection = await tx.getCollectionByVersionId(
                data.importFrom
            );

            if (!importFromCollection) {
                throw new Error(
                    `Collection version with id ${data.importFrom} not found`
                );
            }

            if (importFromCollection.draftState === true) {
                if (throwOnDraftState) {
                    throw new Error(
                        `Collection version with id ${data.importFrom} is in draft state and can not be imported`
                    );
                } else {
                    const nonDraftStateCollection =
                        await tx.getLatestCollectionByEntityId(
                            importFromCollection.entityId,
                            { allowDraftState: false }
                        );
                    if (nonDraftStateCollection === null) {
                        throw new Error(
                            `Collection with id ${importFromCollection.entityId} has no non-draft version and can not be imported`
                        );
                    }
                    importFromCollection = nonDraftStateCollection;
                }
            }

            await tx.addCollectionVersionDependency(
                latestDependentCollectionVersion.versionId,
                data.importFrom
            );

            const importFromElements = this.exists(
                'elements from imported collection ',
                await tx.getElementsOfCollectionVersion(data.importFrom)
            );

            this.eventSubject.next(
                new SwitchVersionEvent(data.importTo, {
                    versionId: latestDependentCollectionVersion.versionId,
                })
            );

            this.eventSubject.next(
                new AddDependencyEvent(data.importTo, {
                    dependencyEntityId: data.importFrom,
                })
            );

            return {
                collection: importFromCollection,
                elements: importFromElements,
            };
        });
    }

    public async createExerciseObject(
        setEntityId: Marketplace.Set.EntityId,
        content: Marketplace.ExerciseElementObjectUnion
    ) {
        return this.exerciseElementSetRepository.transaction(async (tx) => {
            const result = await tx.createElementVersion({
                version: 1,
                content,
            });

            if (!result) {
                throw new Error('Failed to create exercise element object');
            }

            const newSetVersion = await tx.getOrCreateDraftState(setEntityId);

            await tx.addElementToCollection(
                result.versionId,
                newSetVersion.versionId
            );

            this.eventSubject.next(
                new SwitchVersionEvent(setEntityId, {
                    versionId: newSetVersion.versionId,
                })
            );

            this.eventSubject.next(
                new ElementCreateEvent(setEntityId, {
                    versionId: result.versionId,
                    entityId: result.entityId,
                    version: result.version,
                    content: result.content,
                    stateVersion: result.stateVersion,
                    createdAt: result.createdAt.toISOString(),
                    title: result.title,
                })
            );

            return {
                newSetVersionId: newSetVersion.versionId,
                result,
            };
        });
    }

    public async getLatestExerciseElementSetsForUser(userId: string) {
        return this.exerciseElementSetRepository.getLatestCollectionForUser(
            userId
        );
    }

    public async getLatestCollectionById(
        setEntityId: Marketplace.Set.EntityId,
        opts: { draftState: boolean }
    ) {
        console.log(opts);
        return this.exerciseElementSetRepository.getLatestCollectionByEntityId(
            setEntityId,
            { allowDraftState: opts.draftState }
        );
    }

    public async getCollectionDependencies(
        collectionVersionId: Marketplace.Set.VersionId
    ) {
        return (
            await this.exerciseElementSetRepository.getCollectionVersionDependencies(
                collectionVersionId
            )
        ).map((dependency) => ({
            entityId: dependency.collectionEntityId,
            versionId: dependency.collectionVersionId,
        }));
    }

    private async getFullFlatDependencyTree(
        collectionVersionId: Marketplace.Set.VersionId,
        visited: Set<Marketplace.Set.VersionId> = new Set()
    ) {
        if (visited.has(collectionVersionId)) {
            console.warn(
                `Circular dependency detected for collection version ${collectionVersionId}`
            );
            return [];
        }

        visited.add(collectionVersionId);

        const deps =
            await this.exerciseElementSetRepository.getCollectionVersionDependencies(
                collectionVersionId
            );

        const allDeps = [...deps];

        for (const dep of deps) {
            const subDeps = await this.getFullFlatDependencyTree(
                dep.collectionVersionId,
                visited
            );
            allDeps.push(...subDeps);
        }

        return allDeps;
    }

    public async getLatestElementsOfCollection(
        collectionEntityId: Marketplace.Set.EntityId,
        opts: {
            includeDependencies?: boolean;
            allowDraftState: boolean;
        }
    ) {
        const { includeDependencies: Opt_includeDependencies } = opts || {
            includeDependencies: false,
        };
        console.log(opts);
        const latestSetVersion = this.exists(
            'latest set version',
            await this.getLatestCollectionById(collectionEntityId, {
                draftState: opts.allowDraftState,
            })
        );
        const directCollectionElements =
            await this.exerciseElementSetRepository.getElementsOfCollectionVersion(
                latestSetVersion.versionId
            );

        if (Opt_includeDependencies === false) {
            return { direct: directCollectionElements };
        }
        console.log('latestSetVersion', latestSetVersion.versionId);
        const dependentCollectionVersions =
            await this.getFullFlatDependencyTree(latestSetVersion.versionId);

        console.log('dependentCollectionVersions', dependentCollectionVersions);

        const dependentCollectionElements = await Promise.all(
            dependentCollectionVersions.map((dependency) =>
                Promise.all([
                    this.exists(
                        'collection for dependency',
                        this.exerciseElementSetRepository.getCollectionByVersionId(
                            dependency.collectionVersionId
                        )
                    ),
                    this.exists(
                        'elements for collection-dependency',
                        this.exerciseElementSetRepository.getElementsOfCollectionVersion(
                            dependency.collectionVersionId
                        )
                    ),
                ])
            )
        );

        const dependencies = dependentCollectionElements.map(
            ([collection, elements]) =>
                ({
                    collection: {
                        draftState: collection!.draftState,
                        title: collection!.title,
                        entityId: collection!.entityId,
                        createdAt: collection!.createdAt.toISOString(),
                        owner: collection!.owner,
                        stateVersion: collection!.stateVersion,
                        version: collection!.version,
                        versionId: collection!.versionId,
                        visibility: collection!.visibility,
                    },
                    elements: elements.map((element) => ({
                        versionId: element.versionId,
                        entityId: element.entityId,
                        version: element.version,
                        content:
                            element.content as Marketplace.ExerciseElementObjectUnion,
                        stateVersion: element.stateVersion,
                        createdAt: element.createdAt.toISOString(),
                        title: element.title,
                    })),
                }) satisfies z.infer<
                    typeof Marketplace.Set.GetLatestElementsBySetVersionId.responseSchema.shape.transitive.element
                >
        );

        return {
            direct: directCollectionElements,
            transitive: dependencies,
        };
    }

    public async deleteExerciseElementObjectFromSet(
        elementEntityId: Marketplace.Element.EntityId
    ) {
        return await this.exerciseElementSetRepository.transaction(
            async (tx) => {
                const containingSet = this.exists(
                    'containing set',
                    await tx.getLatestCollectionOfElementEntity(elementEntityId)
                );

                const newSet = await tx.getOrCreateDraftState(
                    containingSet.entityId
                );

                await tx.removeElementFromCollection(
                    elementEntityId,
                    newSet.versionId
                );

                this.eventSubject.next(
                    new SwitchVersionEvent(containingSet.entityId, {
                        versionId: newSet.versionId,
                    })
                );

                this.eventSubject.next(
                    new ElementDeleteEvent(containingSet.entityId, {
                        entityId: elementEntityId,
                    })
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
        return this.exerciseElementSetRepository.getElementVersions(entityId);
    }

    public async updateExerciseElementObject(
        entityId: Marketplace.Element.EntityId,
        content: Marketplace.ExerciseElementObjectUnion
    ) {
        return this.exerciseElementSetRepository.transaction(async (tx) => {
            const latestObject = this.exists(
                'latest exercise element',
                await tx.getLatestElementVersion(entityId)
            );

            const latestContainingSet = this.exists(
                'element set',
                await tx.getLatestCollectionOfElementEntity(entityId)
            );

            const newElementVersion = this.exists(
                'new exercise element',
                await tx.createElementVersion({
                    content,
                    version: latestObject.version + 1,
                    entityId,
                })
            );

            const newSetVersion = await tx.getOrCreateDraftState(
                latestContainingSet.entityId
            );

            await tx.addElementToCollection(
                newElementVersion.versionId,
                newSetVersion.versionId
            );

            this.eventSubject.next(
                new SwitchVersionEvent(latestContainingSet.entityId, {
                    versionId: newSetVersion.versionId,
                })
            );

            this.eventSubject.next(
                new ElementUpdateEvent(latestContainingSet.entityId, {
                    entityId: entityId,
                    versionId: newElementVersion.versionId,
                    version: newElementVersion.version,
                    content:
                        newElementVersion.content as Marketplace.ExerciseElementObjectUnion,
                    stateVersion: newElementVersion.stateVersion,
                    createdAt: newElementVersion.createdAt.toISOString(),
                    title: newElementVersion.title,
                })
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
        //TODO: @Quixelation - rework this and do checks like create new version etc
        if (visibility === 'private') {
            throw new Error('private visibility can not be set afterwards');
        }

        const data =
            await this.exerciseElementSetRepository.setCollectionVisibility(
                setEntityId,
                visibility
            );

        this.eventSubject.next(
            new CollectionUpdateEvent(setEntityId, {
                entityId: data.entityId,
                versionId: data.versionId,
                version: data.version,
                title: data.title,
                owner: data.owner,
                createdAt: data.createdAt.toISOString(),
                stateVersion: data.stateVersion,
                visibility: data.visibility,
                draftState: data.draftState,
            })
        );

        return data;
    }

    public async duplicateExerciseElementSetVersion(
        setVersionId: Marketplace.Set.VersionId,
        owner: string
    ) {
        const latestSetEntity =
            await this.exerciseElementSetRepository.getCollectionByVersionId(
                setVersionId
            );

        if (!latestSetEntity) {
            throw new Error(
                `No exercise element set found with entityId ${setVersionId}`
            );
        }

        const newSet =
            await this.exerciseElementSetRepository.createFirstCollectionVersion(
                //TODO: Quixelation : also duplicate description (visbility should stay private)
                'Kopie von ' + latestSetEntity.title,
                owner
            );

        if (!newSet) {
            throw new Error('Failed to create new exercise element set');
        }

        await this.exerciseElementSetRepository.copyElementsBetweenCollections(
            {
                versionId: setVersionId,
                entityId: latestSetEntity.entityId,
            },
            newSet
        );

        return newSet;
    }

    /**
     * do not use yet - impl. not finished
     */
    public async checkIfDependencyCanBeAdded(data: {
        importTo: Marketplace.Set.VersionId;
        dependencyVersionId: Marketplace.Set.VersionId;
    }) {
        const baseCollectionDependencies = await this.getFullFlatDependencyTree(
            data.importTo
        );
        const importingDependencyTree = await this.getFullFlatDependencyTree(
            data.dependencyVersionId
        );

        // Check if the importing dependency *ENTITIY* is already in the dependency tree of the base collection
        const overlappingDependencies = baseCollectionDependencies.filter(
            (baseDependency) =>
                importingDependencyTree.some(
                    (importingDependency) =>
                        importingDependency.collectionEntityId ===
                        baseDependency.collectionEntityId
                )
        );

        //TODO: Replace with groupBy once available with new tsconfig target
        const overlappingDependencyEntities = overlappingDependencies.reduce<
            Record<
                Marketplace.Set.EntityId,
                Awaited<
                    ReturnType<
                        typeof CollectionService.prototype.getFullFlatDependencyTree
                    >
                >
            >
        >((acc, dependency) => {
            if (acc[dependency.collectionEntityId] === undefined) {
                acc[dependency.collectionEntityId] = [];
            }
            acc[dependency.collectionEntityId]?.push(dependency);
            return acc;
        }, {});

        for (const overlappingDependency of Object.entries(
            overlappingDependencyEntities
        )) {
            const [entityId, versions] = overlappingDependency;
            if (versions.length === 0) {
                // This should not happen, but i included it for safer assertions
                continue;
            }
            // Alle VersionsIDs sind gleich
            if (
                versions.every(
                    (version) =>
                        version.collectionVersionId ===
                        versions[0]!.collectionVersionId
                )
            ) {
                //TODO: Return accepted
                return;
            }

            // Schauen, ob es eine gemeinsame kompatible Version gibt
            const allInterconnctedDependencies = await Promise.all(
                versions.map((version) => async () => {
                    const element = this.exists(
                        'dependency element',
                        await this.exerciseElementSetRepository.getCollectionByVersionId(
                            version.collectionVersionId
                        )
                    );
                    const idsInContent =
                        this.findEntityVersionsInContent(element);
                })
            );
        }
    }

    private findEntityVersionsInContent(content: object | any[]): string[] {
        const elementEntityVersionId = new RegExp(
            /^element_version_[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/iu
        );

        if (content === null || content === undefined) {
            return [];
        }

        if (typeof content === 'string') {
            if (elementEntityVersionId.test(content)) {
                return [content];
            }
        }

        if (Array.isArray(content)) {
            const foundDependencies: string[] = [];
            for (const item of content) {
                const subDependencies = this.findEntityVersionsInContent(item);
                foundDependencies.push(...subDependencies);
            }
            return foundDependencies;
        }

        if (typeof content === 'object') {
            const foundDependencies: string[] = [];
            for (const value of Object.values(content)) {
                const subDependencies = this.findEntityVersionsInContent(value);
                foundDependencies.push(...subDependencies);
            }
            return foundDependencies;
        }

        return [];
    }
}
