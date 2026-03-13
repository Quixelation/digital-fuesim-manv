import { Marketplace } from 'fuesim-digital-shared';
import { DatabaseConnection } from './database-service.js';
import { ExerciseRepository } from '../repositories/exercise-repository.js';
import { CollectionRepository } from '../repositories/collection-repository.js';
import { z } from 'zod';
import { Subject } from 'rxjs';

export class CollectionService {
    public get events() {
        return this.eventSubject.asObservable();
    }

    private eventSubject = new Subject<
        typeof Marketplace.Set.Events.Event.Type
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

            this.eventSubject.next({
                event: 'version:switch',
                data: {
                    newVersionId: draftState.versionId,
                },
                collectionEntityId: data.removeFrom,
            });

            return draftState;
        });
    }

    public async saveDraftState(collectionEntityId: Marketplace.Set.EntityId) {
        const data =
            await this.exerciseElementSetRepository.saveDraftState(
                collectionEntityId
            );

        this.eventSubject.next({
            event: 'collection:update',
            data: {
                entityId: data.entityId,
                versionId: data.versionId,
                version: data.version,
                title: data.title,
                owner: data.owner,
                createdAt: data.createdAt.toISOString(),
                stateVersion: data.stateVersion,
                visibility: data.visibility,
                draftState: data.draftState,
            },
            collectionEntityId: collectionEntityId,
        });

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

            this.eventSubject.next({
                event: 'version:switch',
                data: {
                    newVersionId: latestDependentCollectionVersion.versionId,
                },
                collectionEntityId: data.importTo,
            });

            this.eventSubject.next({
                event: 'dependency:add',
                data: data.importFrom,
                collectionEntityId: data.importTo,
            });

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

            this.eventSubject.next({
                event: 'version:switch',
                data: {
                    newVersionId: newSetVersion.versionId,
                },
                collectionEntityId: setEntityId,
            });

            this.eventSubject.next({
                event: 'element:create',
                data: {
                    versionId: result.versionId,
                    entityId: result.entityId,
                    version: result.version,
                    content: result.content,
                    stateVersion: result.stateVersion,
                    createdAt: result.createdAt.toISOString(),
                    title: result.title,
                },
                collectionEntityId: setEntityId,
            });

            return {
                newSetVersionId: newSetVersion.versionId,
                result,
            };
        });
    }

    public async getLatestExerciseElementSetsForUser(
        userId: string,
        opts: { includeDraftState: boolean }
    ) {
        return this.exerciseElementSetRepository.getLatestCollectionForUser(
            userId,
            { allowDraftState: opts.includeDraftState }
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

    public async getCollectionVersionById(
        collectionVersionId: Marketplace.Set.VersionId
    ) {
        return this.exerciseElementSetRepository.getCollectionByVersionId(
            collectionVersionId
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

    public async getLatestDraftElementsOfCollection(
        entity: Marketplace.Set.EntityId,
        opts: { includeDependencies: boolean }
    ) {
        const latestConnection = this.exists(
            'latestCollection',
            await this.exerciseElementSetRepository.getLatestCollectionByEntityId(
                entity,
                { allowDraftState: true }
            )
        );

        const elements = await this.getElementsOfCollectionVersion(
            latestConnection.versionId,
            {
                includeDependencies: opts.includeDependencies,
                allowDraftState: true,
            }
        );

        return elements;
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

    public async getElementsOfCollectionVersion(
        collectionVersionId: Marketplace.Set.VersionId,
        opts: {
            includeDependencies?: boolean;
            allowDraftState: boolean;
        }
    ) {
        const { includeDependencies: Opt_includeDependencies } = opts || {
            includeDependencies: false,
        };

        const baseCollection = this.exists(
            'collection for version',
            await this.exerciseElementSetRepository.getCollectionByVersionId(
                collectionVersionId
            )
        )

        if(baseCollection.draftState === true && opts.allowDraftState === false) {
            throw new Error('Collection version is in draft state and allowDraftState is set to false');
        }

        console.log(opts);
        const directCollectionElements =
            await this.exerciseElementSetRepository.getElementsOfCollectionVersion(
                collectionVersionId
            );

        if (Opt_includeDependencies === false) {
            return { direct: directCollectionElements };
        }
        console.log('latestSetVersion', collectionVersionId);
        const dependentCollectionVersions =
            await this.getFullFlatDependencyTree(collectionVersionId);

        console.log('dependentCollectionVersions', dependentCollectionVersions);

        const dependentCollectionElements = await Promise.all(
            dependentCollectionVersions.map((dependency) =>
                Promise.all([
                    this.exists(
                        'collection for dependency',
                        this.getCollectionVersionById(
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

                this.eventSubject.next({
                    event: 'version:switch',
                    data: {
                        newVersionId: newSet.versionId,
                    },
                    collectionEntityId: containingSet.entityId,
                });

                this.eventSubject.next({
                    event: 'element:delete',
                    data: {
                        entityId: elementEntityId,
                    },
                    collectionEntityId: containingSet.entityId,
                });

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

            this.eventSubject.next({
                event: 'version:switch',
                data: {
                    newVersionId: newSetVersion.versionId,
                },
                collectionEntityId: latestContainingSet.entityId,
            });

            this.eventSubject.next({
                event: 'element:update',
                data: {
                    entityId: entityId,
                    versionId: newElementVersion.versionId,
                    version: newElementVersion.version,
                    content:
                        newElementVersion.content as Marketplace.ExerciseElementObjectUnion,
                    stateVersion: newElementVersion.stateVersion,
                    createdAt: newElementVersion.createdAt.toISOString(),
                    title: newElementVersion.title,
                },
                collectionEntityId: latestContainingSet.entityId,
            });

            return {
                newSetVersionId: newSetVersion.versionId,
                newElement: newElementVersion,
            };
        });
    }

    public async makeCollectionPublic(
        setEntityId: Marketplace.Set.EntityId,
    ) {
        const data =
            await this.exerciseElementSetRepository.setCollectionVisibility(
                setEntityId,
                "public"
            );

        this.eventSubject.next({
            event: 'collection:update',
            data: {
                entityId: data.entityId,
                versionId: data.versionId,
                version: data.version,
                title: data.title,
                owner: data.owner,
                createdAt: data.createdAt.toISOString(),
                stateVersion: data.stateVersion,
                visibility: data.visibility,
                draftState: data.draftState,
            },
            collectionEntityId: setEntityId,
        });

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
