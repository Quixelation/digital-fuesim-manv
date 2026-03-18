import type { Marketplace } from 'fuesim-digital-shared';
import type { z } from 'zod';
import { Subject } from 'rxjs';
import type { CollectionRepository } from '../repositories/collection-repository.js';

export class CollectionService {
    public get events() {
        return this.eventSubject.asObservable();
    }

    private readonly eventSubject = new Subject<
        typeof Marketplace.Set.Events.Event.Type
    >();

    private readonly newDeferredEventBuffer = () => {
        // I opted against a ReplaySubject here to not worry about completing correctly if a functions throws
        // and doesnt complete this subject
        const subject: (typeof Marketplace.Set.Events.Event.Type)[] = [];

        return {
            next: (event: typeof Marketplace.Set.Events.Event.Type) => {
                subject.push(event);
            },
            flush: () => {
                const eventsToFlush = [...subject];
                subject.length = 0;
                for (const event of eventsToFlush) {
                    this.eventSubject.next(event);
                }
            },
        };
    };

    private exists<T>(
        elementName: string,
        element: T | null | undefined
    ): NonNullable<T> {
        if (!element) {
            throw new Error(`No ${elementName} found`);
        }
        return element;
    }

    constructor(private readonly collectionRepository: CollectionRepository) { }

    public async createExerciseSet(name: string, owner: string) {
        return this.collectionRepository.createFirstCollectionVersion(
            name,
            owner
        );
    }

    public async removeCollectionDependency(data: {
        removeFrom: Marketplace.Set.EntityId;
        dependencyEntityId: Marketplace.Set.VersionId;
    }) {
        return this.collectionRepository.transaction(async (tx) => {
            const [draftState, createdNewDraftState] =
                await tx.getOrCreateDraftState(data.removeFrom);

            await tx.removeCollectionVersionDependency(
                draftState.versionId,
                data.dependencyEntityId
            );

            if (createdNewDraftState) {
                this.eventSubject.next({
                    event: 'collection:update',
                    data: draftState,
                    collectionEntityId: data.removeFrom,
                });
            }

            return draftState;
        });
    }

    public async saveDraftState(collectionEntityId: Marketplace.Set.EntityId) {
        const data =
            await this.collectionRepository.saveDraftState(collectionEntityId);

        this.eventSubject.next({
            event: 'collection:update',
            data,
            collectionEntityId,
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
        return this.collectionRepository.transaction(async (tx) => {
            const eventBuffer = this.newDeferredEventBuffer();
            const [draftState, createdNewDraftState] = this.exists(
                'set version',
                await tx.getOrCreateDraftState(data.importTo)
            );

            eventBuffer.next({
                event: 'collection:update',
                data: draftState,
                collectionEntityId: data.importTo,
            });

            const existingDependencies =
                await tx.getCollectionVersionDependencies(draftState.versionId);

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

            if (importFromCollection.draftState) {
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
                draftState.versionId,
                data.importFrom
            );

            const importFromElements = this.exists(
                'elements from imported collection ',
                await tx.getElementsOfCollectionVersion(data.importFrom)
            );

            eventBuffer.next({
                event: 'dependency:add',
                data: data.importFrom,
                collectionEntityId: data.importTo,
            });

            eventBuffer.flush();

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
        return this.collectionRepository.transaction(async (tx) => {
            const eventBuffer = this.newDeferredEventBuffer();

            const result = this.exists(
                'new element',
                await tx.createElementVersion({
                    version: 1,
                    content,
                })
            );

            eventBuffer.next({
                event: 'element:create',
                data: result,
                collectionEntityId: setEntityId,
            });

            if (!result) {
                throw new Error('Failed to create exercise element object');
            }

            const [draftState, createdNewDraftState] =
                await tx.getOrCreateDraftState(setEntityId);
            if (createdNewDraftState) {
                eventBuffer.next({
                    event: 'collection:update',
                    data: draftState,
                    collectionEntityId: setEntityId,
                });
            }

            await tx.addElementToCollection(
                result.versionId,
                draftState.versionId
            );

            eventBuffer.flush();

            return {
                newSetVersionId: draftState.versionId,
                result,
            };
        });
    }

    public async getLatestExerciseElementSetsForUser(
        userId: string,
        opts: { includeDraftState: boolean }
    ) {
        return this.collectionRepository.getLatestCollectionForUser(userId, {
            allowDraftState: opts.includeDraftState,
        });
    }

    public async getLatestCollectionById(
        setEntityId: Marketplace.Set.EntityId,
        opts: { draftState: boolean }
    ): Promise<Marketplace.Set.Dto | null> {
        return this.collectionRepository.getLatestCollectionByEntityId(
            setEntityId,
            { allowDraftState: opts.draftState }
        );
    }

    public async getCollectionVersionById(
        collectionVersionId: Marketplace.Set.VersionId
    ) {
        return this.collectionRepository.getCollectionByVersionId(
            collectionVersionId
        );
    }

    public async getCollectionDependencies(
        collectionVersionId: Marketplace.Set.VersionId
    ) {
        return (
            await this.collectionRepository.getCollectionVersionDependencies(
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
            await this.collectionRepository.getLatestCollectionByEntityId(
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
            await this.collectionRepository.getCollectionVersionDependencies(
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
    ): Promise<{
        direct: Marketplace.Element.Dto[];
        transitive?: z.infer<
            typeof Marketplace.Set.transitiveCollectionSchema
        >[];
    }> {
        const { includeDependencies: Opt_includeDependencies } = opts || {
            includeDependencies: false,
        };

        const baseCollection = this.exists(
            'collection for version',
            await this.collectionRepository.getCollectionByVersionId(
                collectionVersionId
            )
        );

        if (baseCollection.draftState && !opts.allowDraftState) {
            throw new Error(
                'Collection version is in draft state and allowDraftState is set to false'
            );
        }

        const directCollectionElements =
            await this.collectionRepository.getElementsOfCollectionVersion(
                collectionVersionId
            );

        if (Opt_includeDependencies === false) {
            return { direct: directCollectionElements };
        }
        const dependentCollectionVersions =
            await this.getFullFlatDependencyTree(collectionVersionId);


        const dependentCollectionElements = await Promise.all(
            dependentCollectionVersions.map(async (dependency) =>
                Promise.all([
                    this.exists(
                        'collection for dependency',
                        this.getCollectionVersionById(
                            dependency.collectionVersionId
                        )
                    ),
                    this.exists(
                        'elements for collection-dependency',
                        this.collectionRepository.getElementsOfCollectionVersion(
                            dependency.collectionVersionId
                        )
                    ),
                ])
            )
        );

        const dependencies = dependentCollectionElements.map(
            ([collection, elements]) =>
                ({
                    collection: collection!,
                    elements,
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
    ): Promise<Marketplace.Set.Dto> {
        return this.collectionRepository.transaction(async (tx) => {
            const containingSet = this.exists(
                'containing set',
                await tx.getLatestCollectionOfElementEntity(elementEntityId)
            );

            const [draftState, createdNewDraftState] =
                await tx.getOrCreateDraftState(containingSet.entityId);

            await tx.unmapElementFromCollection(
                elementEntityId,
                draftState.versionId
            );

            if (createdNewDraftState) {
                this.eventSubject.next({
                    event: 'collection:update',
                    data: draftState,
                    collectionEntityId: containingSet.entityId,
                });
            }

            this.eventSubject.next({
                event: 'element:delete',
                data: {
                    entityId: elementEntityId,
                },
                collectionEntityId: containingSet.entityId,
            });

            return draftState;
        });
    }

    public async deleteExerciseElementSet(
        setEntityId: Marketplace.Set.EntityId
    ) {
        // TODO: @Quixelation - forbid, if set is public, and do some other checks
    }

    public async getExerciseElementObjectVersions(
        entityId: Marketplace.Element.EntityId
    ) {
        return this.collectionRepository.getElementVersions(entityId);
    }

    public async updateExerciseElementObject(
        entityId: Marketplace.Element.EntityId,
        content: Marketplace.ExerciseElementObjectUnion
    ) {
        return this.collectionRepository.transaction(async (tx) => {
            const eventBuffer = this.newDeferredEventBuffer();

            const latestContainingSet = this.exists(
                'element set',
                await tx.getLatestCollectionOfElementEntity(entityId)
            );
            const latestVersionOfContainingSet =
                await tx.getLatestCollectionByEntityId(
                    latestContainingSet.entityId,
                    { allowDraftState: true }
                );

            if (
                latestVersionOfContainingSet?.versionId !==
                latestContainingSet.versionId
            ) {
                throw new Error(
                    `Element with id ${entityId} does not exist in the latest version of the containing collection and can therefore not be updated.`
                );
            }

            const [draftState, createdNewDraftState] =
                await tx.getOrCreateDraftState(latestContainingSet.entityId);
            if (createdNewDraftState) {
                eventBuffer.next({
                    event: 'collection:update',
                    data: draftState,
                    collectionEntityId: latestContainingSet.entityId,
                });
            }

            const latestElementVersion = this.exists(
                'latest exercise element',
                await tx.getLatestElementVersion(entityId)
            );

            let newElementVersion: Marketplace.Element.Dto;

            const elementMapping = await tx.getElementCollectionMapping(
                latestElementVersion.versionId,
                latestContainingSet.versionId
            );
            if (elementMapping.isBaseReference === true) {
                // just overwrite the already mapped element
                newElementVersion = this.exists(
                    'updated element',
                    await this.collectionRepository.updateElementContent(
                        latestElementVersion.versionId,
                        content
                    )
                );
            } else {
                // we just have a secondary reference
                // we need to create a new copy of the element
                // and switch the reference from the old element to the new one in the collection mapping

                newElementVersion = this.exists(
                    'new exercise element',
                    await tx.createElementVersion({
                        content,
                        version: latestElementVersion.version + 1,
                        entityId,
                    })
                );

                // This function automatically unmaps the old reference
                // we dont need to care about removing the old element from the collection,
                // because it is not mapped as base reference and therefore
                // belongs to a different collection version
                await tx.addElementToCollection(
                    newElementVersion.versionId,
                    draftState.versionId
                );
            }

            eventBuffer.next({
                event: 'element:update',
                data: newElementVersion,
                collectionEntityId: latestContainingSet.entityId,
            });

            eventBuffer.flush();

            return {
                newSetVersionId: draftState.versionId,
                newElement: newElementVersion,
            };
        });
    }

    public async makeCollectionPublic(setEntityId: Marketplace.Set.EntityId) {
        const data = await this.collectionRepository.setCollectionVisibility(
            setEntityId,
            'public'
        );

        this.eventSubject.next({
            event: 'collection:update',
            data,
            collectionEntityId: setEntityId,
        });

        return data;
    }

    public async duplicateExerciseElementSetVersion(
        setVersionId: Marketplace.Set.VersionId,
        owner: string
    ) {
        console.log("Starting Duplic")
        const latestSetEntity =
            await this.collectionRepository.getCollectionByVersionId(
                setVersionId
            );

        if (!latestSetEntity) {
            throw new Error(
                `No exercise element set found with entityId ${setVersionId}`
            );
        }

        const newSet =
            await this.collectionRepository.createFirstCollectionVersion(
                // TODO: Quixelation : also duplicate description (visbility should stay private)
                `Kopie von ${latestSetEntity.title}`,
                owner,
                true
            );

        if (!newSet) {
            throw new Error('Failed to create new exercise element set');
        }

        await this.collectionRepository.copyElementsBetweenCollections({
            source: {
                versionId: setVersionId,
                entityId: latestSetEntity.entityId,
            },
            target: newSet
        });

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

        // TODO: Replace with groupBy once available with new tsconfig target
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
                // TODO: Return accepted
                return;
            }

            // Schauen, ob es eine gemeinsame kompatible Version gibt
            const allInterconnctedDependencies = await Promise.all(
                versions.map((version) => async () => {
                    const element = this.exists(
                        'dependency element',
                        await this.collectionRepository.getCollectionByVersionId(
                            version.collectionVersionId
                        )
                    );
                    const idsInContent =
                        this.findEntityVersionsInContent(element);
                })
            );
        }
    }

    private findEntityVersionsInContent(content: any[] | object): string[] {
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
