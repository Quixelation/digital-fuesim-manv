import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Marketplace } from 'fuesim-digital-shared';
import { BehaviorSubject, lastValueFrom } from 'rxjs';
import { httpOrigin } from './api-origins';

export type ExerciseElementSetSubscriptionData = {
    collection: Marketplace.Set.Dto;
    objects: typeof Marketplace.Set.GetLatestElementsBySetVersionId.Response;
};

@Injectable({
    providedIn: 'root',
})
export class CollectionService {
    private readonly httpClient = inject(HttpClient);

    public readonly ENDPOINT = httpOrigin + '/api/collections';
    private _elementSets = signal<Marketplace.Set.Dto[]>([]);
    private _elementSetSubscriptions = new Map<
        Marketplace.Set.EntityId,
        BehaviorSubject<ExerciseElementSetSubscriptionData | null>
    >();

    public get elementSets() {
        return this._elementSets.asReadonly();
    }

    private updateCollectionVersion(
        setEntityId: Marketplace.Set.EntityId,
        newSetVersionId: Marketplace.Set.VersionId
    ) {
        this._elementSets.update((val) =>
            val.map((m) =>
                m.entityId === setEntityId
                    ? {
                          ...m,
                          versionId: newSetVersionId,
                      }
                    : m
            )
        );
    }

    public subscribeToCollection(
        setEntityId: Marketplace.Set.EntityId,
        callback: (data: ExerciseElementSetSubscriptionData) => void
    ): () => void {
        const collectionEventSource = new EventSource(
            `${this.ENDPOINT}/${setEntityId}/events`,
            { withCredentials: true }
        );

        this._elementSetSubscriptions.set(
            setEntityId,
            new BehaviorSubject<ExerciseElementSetSubscriptionData | null>(null)
        );

        collectionEventSource.addEventListener('initialData', (event) => {
            console.log(
                `Received initialData event for setEntityId ${setEntityId}:`,
                event
            );
            const parsedData = JSON.parse(
                (event as MessageEvent).data
            ) as Marketplace.Set.Events.InitialData;
            this._elementSetSubscriptions.get(setEntityId)?.next({
                collection: parsedData.data.collection,
                objects: parsedData.data.elements,
            });
        });

        collectionEventSource.addEventListener('element:create', (event) => {
            console.log(
                `Received initialData event for setEntityId ${setEntityId}:`,
                event
            );
            const parsedData = JSON.parse(
                (event as MessageEvent).data
            ) as Marketplace.Set.Events.ElementCreate;
            const currentValue = this._elementSetSubscriptions
                .get(setEntityId)
                ?.getValue();
            if (!currentValue) return;
            const newValue = {
                ...currentValue,
                objects: {
                    ...currentValue.objects,
                    direct: [...currentValue.objects.direct, parsedData.data],
                },
            };
            this._elementSetSubscriptions.get(setEntityId)?.next(newValue);
        });

        collectionEventSource.addEventListener('element:update', (event) => {
            console.log(
                `Received element:update event for setEntityId ${setEntityId}:`,
                event
            );
            const parsedData = JSON.parse(
                (event as MessageEvent).data
            ) as Marketplace.Set.Events.ElementUpdate;
            const currentValue = this._elementSetSubscriptions
                .get(setEntityId)
                ?.getValue();
            if (!currentValue) return;
            const newValue = {
                ...currentValue,
                objects: {
                    ...currentValue.objects,
                    direct: currentValue.objects.direct.map((object) =>
                        object.entityId === parsedData.data.entityId
                            ? parsedData.data
                            : object
                    ),
                },
            };
            this._elementSetSubscriptions.get(setEntityId)?.next(newValue);
        });

        collectionEventSource.addEventListener('dependency:add', (event) => {
            console.log(
                `Received dependency:add event for setEntityId ${setEntityId}:`,
                event
            );
            const parsedData = JSON.parse(
                (event as MessageEvent).data
            ) as Marketplace.Set.Events.DependencyAdd;
            const currentValue = this._elementSetSubscriptions
                .get(setEntityId)
                ?.getValue();
            if (!currentValue) return;
            const newValue = {
                ...currentValue,
                objects: {
                    direct: currentValue.objects.direct,
                    transitive: parsedData.data,
                },
            };
            this._elementSetSubscriptions.get(setEntityId)?.next(newValue);
        });

        collectionEventSource.addEventListener('version:switch', (event) => {
            console.log(
                `Received version:switch event for setEntityId ${setEntityId}:`,
                event
            );
            const parsedData = JSON.parse(
                (event as MessageEvent).data
            ) as Marketplace.Set.Events.VersionSwitch;
            const currentValue = this._elementSetSubscriptions
                .get(setEntityId)
                ?.getValue();
            if (!currentValue) return;
            const newValue = {
                ...currentValue,
                collection: {
                    ...currentValue.collection,
                    versionId: parsedData.data.newVersionId,
                },
            };
            this._elementSetSubscriptions.get(setEntityId)?.next(newValue);
        });

        collectionEventSource.addEventListener('collection:update', (event) => {
            const parsedData = JSON.parse(
                (event as MessageEvent).data
            ) as Marketplace.Set.Events.CollectionUpdate;
            const currentValue = this._elementSetSubscriptions
                .get(setEntityId)
                ?.getValue();
            if (!currentValue) return;
            const newValue = {
                ...currentValue,
                collection: parsedData.data,
            };
            this._elementSetSubscriptions.get(setEntityId)?.next(newValue);
        });

        const firstValue = this._elementSetSubscriptions.get(setEntityId)?.getValue();
        if (firstValue) {
            callback(firstValue);
        }
        this._elementSetSubscriptions.get(setEntityId)!.subscribe((data) => {
            console.log(
                `Subscription for setVersionId ${setEntityId} received update:`,
                data
            );
            if (!data) return;
            callback(data);
        });

        return () => {
            collectionEventSource.close();
            this._elementSetSubscriptions.get(setEntityId)?.complete();
            this._elementSetSubscriptions.delete(setEntityId);
            console.log(`Closing ${setEntityId}`);
        };
    }

    public async loadCollections() {
        const data = await lastValueFrom(
            this.httpClient.get<typeof Marketplace.Set.LoadMy.Response>(
                `${this.ENDPOINT}/my`
            )
        );

        this._elementSets.set(data.result);
    }

    public async getCollectionByEntityId(entityId: Marketplace.Set.EntityId) {
        const data = await lastValueFrom(
            this.httpClient.get<typeof Marketplace.Set.GetByVersionId.Response>(
                `${this.ENDPOINT}/${entityId}`
            )
        );

        return data.result;
    }

    public async getLatestElementsByCollectionId(
        setId: Marketplace.Set.EntityId
    ) {
        const data = await lastValueFrom(
            this.httpClient.get<
                typeof Marketplace.Set.GetLatestElementsBySetVersionId.Response
            >(`${this.ENDPOINT}/${setId}/latest`)
        );

        console.log('Received latest element set objects:', data);

        return data;
    }

    public async deleteElement(
        elementEntityId: Marketplace.Element.EntityId,
        setEntityId: Marketplace.Set.EntityId
    ) {
        const result = await lastValueFrom(
            this.httpClient.delete<typeof Marketplace.Element.Delete.Response>(
                `${this.ENDPOINT}/${setEntityId}/entity/${elementEntityId}`
            )
        );

        this.updateCollectionVersion(setEntityId, result.newSetVersionId);
    }

    public async createColletion(title: string) {
        const data = await lastValueFrom(
            this.httpClient.post<typeof Marketplace.Set.Create.Response>(
                `${this.ENDPOINT}/create`,
                {
                    title,
                } satisfies typeof Marketplace.Set.Create.Request
            )
        );

        this._elementSets.update((elementSets) => [
            ...elementSets,
            data.result,
        ]);
    }

    public async createElement(
        setEntityId: Marketplace.Set.EntityId,
        content: object
    ) {
        const data = await lastValueFrom(
            this.httpClient.post<typeof Marketplace.Element.Create.Response>(
                `${this.ENDPOINT}/${setEntityId}/create`,
                Marketplace.Element.Create.requestSchema.parse({
                    data: content,
                })
            )
        );

        return data.result;
    }

    public async getElementVersions(entityId: Marketplace.Element.EntityId) {
        const data = await lastValueFrom(
            this.httpClient.get<
                typeof Marketplace.Element.GetByEntityId.Response
            >(`${this.ENDPOINT}/object/${entityId}/versions`)
        );

        return data.result;
    }

    public async updateElement(
        entityId: Marketplace.Element.EntityId,
        content: object,
        setEntityId: Marketplace.Set.EntityId
    ) {
        const data = await lastValueFrom(
            this.httpClient.put<typeof Marketplace.Element.Edit.Response>(
                `${this.ENDPOINT}/${setEntityId}/entity/${entityId}`,
                Marketplace.Element.Edit.requestSchema.parse({
                    data: content,
                })
            )
        );

        return data.result;
    }

    public async makeCollectionPublic(setEntityId: Marketplace.Set.EntityId) {
        const data = await lastValueFrom(
            this.httpClient.post<
                typeof Marketplace.Set.ChangeVisibility.Response
            >(
                `${this.ENDPOINT}/${setEntityId}/change-visibility`,
                Marketplace.Set.ChangeVisibility.requestSchema.parse({
                    visibility: 'public',
                })
            )
        );

        if (data.status === 'success') {
            this._elementSets.update((elementSets) =>
                elementSets.map((set) =>
                    set.entityId === setEntityId
                        ? { ...set, visibility: 'public' }
                        : set
                )
            );
        }
    }

    public async duplicateCollection(
        setVersionId: Marketplace.Set.EntityId,
        specificSetVersionId: Marketplace.Set.VersionId
    ) {
        const data = await lastValueFrom(
            this.httpClient.post<typeof Marketplace.Set.Duplicate.Response>(
                `${this.ENDPOINT}/${setVersionId}/version/${specificSetVersionId}/duplicate`,
                {}
            )
        );

        this._elementSets.update((elementSets) => [
            ...elementSets,
            data.createdSet,
        ]);
    }
    public async deleteCollection(setEntityId: Marketplace.Set.EntityId) {
        await lastValueFrom(
            this.httpClient.delete(`${this.ENDPOINT}/${setEntityId}/entity`)
        );

        this._elementSets.update((val) =>
            val.filter((f) => f.entityId !== setEntityId)
        );
    }

    public async addCollectionDependency(opts: {
        importTo: Marketplace.Set.EntityId;
        importFrom: Marketplace.Set.VersionId;
    }) {
        const data = await lastValueFrom(
            this.httpClient.post<typeof Marketplace.Set.Import.Response>(
                `${this.ENDPOINT}/${opts.importTo}/dependencies/${opts.importFrom}`,
                {}
            )
        );
    }

    public async removeCollectionDependency(opts: {
        removeFrom: Marketplace.Set.EntityId;
        removeVersionId: Marketplace.Set.VersionId;
    }) {
        await lastValueFrom(
            this.httpClient.delete(
                `${this.ENDPOINT}/${opts.removeFrom}/dependencies/${opts.removeVersionId}`
            )
        );
    }

    public async saveDraftState(collectionEntityId: Marketplace.Set.EntityId) {
        const data = await lastValueFrom(
            this.httpClient.post<
                typeof Marketplace.Set.SaveDraftState.Response
            >(`${this.ENDPOINT}/${collectionEntityId}/save`, {})
        );

        this._elementSets.update((elementSets) =>
            elementSets.map((set) =>
                set.entityId === collectionEntityId
                    ? { ...set, draftState: data.result.draftState }
                    : set
            )
        );
    }
}
