import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Marketplace } from 'fuesim-digital-shared';
import { BehaviorSubject, lastValueFrom } from 'rxjs';
import { httpOrigin } from './api-origins';

export type ExerciseElementSetSubscriptionData = {
    setData: Marketplace.Set.Dto;
    objects: Marketplace.Element.Dto[];
};

@Injectable({
    providedIn: 'root',
})
export class ExerciseElementService {
    public readonly ENDPOINT = httpOrigin + '/api/element-set';
    private _elementSets = signal<Marketplace.Set.Dto[]>([]);
    private _elementSetSubscriptions = new Map<
        Marketplace.Set.EntityId,
        BehaviorSubject<ExerciseElementSetSubscriptionData>
    >();

    public get elementSets() {
        return this._elementSets.asReadonly();
    }

    constructor(private readonly httpClient: HttpClient) {}

    private updateElementSetVersion(
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

    public async subscribeToElementSet(
        setEntityId: Marketplace.Set.EntityId,
        callback: (data: ExerciseElementSetSubscriptionData) => void
    ) {
        const [elementSet, setObjects] = await Promise.all([
            this.getElementSetByEntityId(setEntityId),
            this.getLatestElementSetObjectsBySetId(setEntityId),
        ]);

        this._elementSetSubscriptions.set(
            setEntityId,
            new BehaviorSubject({
                setData: elementSet,
                objects: setObjects,
            })
        );

        this._elementSetSubscriptions.get(setEntityId)!.subscribe((data) => {
            console.log(
                `Subscription for setVersionId ${setEntityId} received update:`,
                data
            );
            callback(data);
        });
    }

    public async loadElementSets() {
        const data = await lastValueFrom(
            this.httpClient.get<typeof Marketplace.Set.LoadMy.Response>(
                `${this.ENDPOINT}/my`
            )
        );

        this._elementSets.set(data.result);
    }

    public async getElementSetByEntityId(entityId: Marketplace.Set.EntityId) {
        const data = await lastValueFrom(
            this.httpClient.get<typeof Marketplace.Set.GetByVersionId.Response>(
                `${this.ENDPOINT}/${entityId}`
            )
        );

        return data.result;
    }

    public async getLatestElementSetObjectsBySetId(
        setId: Marketplace.Set.EntityId
    ) {
        const data = await lastValueFrom(
            this.httpClient.get<
                typeof Marketplace.Set.GetLatestElementsBySetVersionId.Response
            >(`${this.ENDPOINT}/${setId}/latest`)
        );

        console.log('Received latest element set objects:', data.result);

        return data.result;
    }

    public async deleteExerciseElementObject(
        elementEntityId: Marketplace.Element.EntityId,
        setEntityId: Marketplace.Set.EntityId
    ) {
        const result = await lastValueFrom(
            this.httpClient.delete<typeof Marketplace.Element.Delete.Response>(
                `${this.ENDPOINT}/${setEntityId}/entity/${elementEntityId}`
            )
        );

        this.updateElementSetVersion(setEntityId, result.newSetVersionId);

        for (const subscription of this._elementSetSubscriptions.entries()) {
            if (subscription[0] !== setEntityId) continue;

            const value = subscription[1].getValue();
            const newValue = {
                ...value,
                objects: value.objects.filter(
                    (object) => object.entityId !== elementEntityId
                ),
            };
            subscription[1].next(newValue);
        }
    }

    public async createElementSet(title: string) {
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

    public async createElementObject(
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

        this.updateElementSetVersion(setEntityId, data.newSetVersionId);

        for (const subscription of this._elementSetSubscriptions.entries()) {
            if (subscription[0] !== setEntityId) continue;

            const value = subscription[1].getValue();
            subscription[1].next({
                ...value,
                objects: [...value.objects, data.result],
            });
        }

        return data.result;
    }

    public async getElementObjectVersions(
        entityId: Marketplace.Element.EntityId
    ) {
        const data = await lastValueFrom(
            this.httpClient.get<
                typeof Marketplace.Element.GetByEntityId.Response
            >(`${this.ENDPOINT}/object/${entityId}/versions`)
        );

        return data.result;
    }

    public async updateElementObject(
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

        this.updateElementSetVersion(setEntityId, data.newSetVersionId);

        for (const subscription of this._elementSetSubscriptions.values()) {
            const currentValue = subscription.getValue();
            const newValue = {
                ...currentValue,
                objects: currentValue.objects.map((object) =>
                    object.entityId === entityId ? data.result : object
                ),
            };
            subscription.next(newValue);
        }

        return data.result;
    }

    public async makeSetPublic(setEntityId: Marketplace.Set.EntityId) {
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

            for (const subscription of this._elementSetSubscriptions.values()) {
                const currentValue = subscription.getValue();
                if (currentValue.setData.entityId === setEntityId) {
                    currentValue.setData.visibility = 'public';
                    subscription.next(currentValue);
                }
            }
        }
    }

    public async duplicateSet(
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
    public async deleteExerciseElementSet(
        setEntityId: Marketplace.Set.EntityId
    ) {
        await lastValueFrom(
            this.httpClient.delete(`${this.ENDPOINT}/${setEntityId}/entity`)
        );

        this._elementSets.update((val) =>
            val.filter((f) => f.entityId !== setEntityId)
        );
    }
}
