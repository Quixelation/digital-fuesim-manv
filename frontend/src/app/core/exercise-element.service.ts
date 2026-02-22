import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import {
    ElementSetVisibility,
    ExerciseElementObjectDto,
    Marketplace,
    type ExerciseElementSetDto,
} from 'fuesim-digital-shared';
import { BehaviorSubject, lastValueFrom } from 'rxjs';
import { httpOrigin } from './api-origins';

export type ExerciseElementSetSubscriptionData = {
    setData: ExerciseElementSetDto;
    objects: ExerciseElementObjectDto[];
};

@Injectable({
    providedIn: 'root',
})
export class ExerciseElementService {
    public readonly ENDPOINT = httpOrigin + '/api/element-set';
    private _elementSets = signal<ExerciseElementSetDto[]>([]);
    private _elementSetSubscriptions = new Map<
        string,
        BehaviorSubject<ExerciseElementSetSubscriptionData>
    >();

    public get elementSets() {
        return this._elementSets.asReadonly();
    }

    constructor(private readonly httpClient: HttpClient) {}

    public async subscribeToElementSet(
        setVersionId: string,
        callback: (data: ExerciseElementSetSubscriptionData) => void
    ) {
        const [elementSet, setObjects] = await Promise.all([
            this.getElementSetByVersionId(setVersionId),
            this.getLatestElementSetObjectsBySetId(setVersionId),
        ]);

        this._elementSetSubscriptions.set(
            setVersionId,
            new BehaviorSubject({
                setData: elementSet,
                objects: setObjects,
            })
        );

        this._elementSetSubscriptions.get(setVersionId)!.subscribe((data) => {
            console.log(
                `Subscription for setVersionId ${setVersionId} received update:`,
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

    public async getElementSetByVersionId(versionId: string) {
        const data = await lastValueFrom(
            this.httpClient.get<typeof Marketplace.Set.GetByVersionId.Response>(
                `${this.ENDPOINT}/${versionId}`
            )
        );

        return data.result;
    }

    public async getLatestElementSetObjectsBySetId(setId: string) {
        const data = await lastValueFrom(
            this.httpClient.get<
                typeof Marketplace.Set.GetLatestElementsBySetVersionId.Response
            >(`${this.ENDPOINT}/${setId}/latest`)
        );

        console.log('Received latest element set objects:', data.result);

        return data.result;
    }

    public async deleteExerciseElementObject(entityId: string) {
        await lastValueFrom(
            this.httpClient.delete(`${this.ENDPOINT}/object/${entityId}`)
        );

        for (const subscription of this._elementSetSubscriptions.values()) {
            const value = subscription.getValue();
            const newValue = {
                ...value,
                objects: value.objects.filter(
                    (object) => object.entityId !== entityId
                ),
            };
            subscription.next(newValue);
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
        elementSetVersionId: string,
        content: object
    ) {
        const data = await lastValueFrom(
            this.httpClient.post<typeof Marketplace.Element.Create.Response>(
                `${this.ENDPOINT}/${elementSetVersionId}/create`,
                Marketplace.Element.Create.requestSchema.parse({
                    data: content,
                })
            )
        );

        for (const subscription of this._elementSetSubscriptions.entries()) {
            if (subscription[0] === elementSetVersionId) {
                const currentValue = subscription[1].getValue();
                const newValue = {
                    ...currentValue,
                    objects: [...currentValue.objects, data.result],
                };
                subscription[1].next(newValue);
            }
        }

        return data.result;
    }

    public async getElementObjectVersions(entityId: string) {
        const data = await lastValueFrom(
            this.httpClient.get<
                typeof Marketplace.Element.GetByEntityId.Response
            >(`${this.ENDPOINT}/object/${entityId}/versions`)
        );

        return data.result;
    }

    public async updateElementObject(entityId: string, content: object) {
        const data = await lastValueFrom(
            this.httpClient.put<typeof Marketplace.Element.Edit.Response>(
                `${this.ENDPOINT}/object/${entityId}`,
                Marketplace.Element.Edit.requestSchema.parse({
                    data: content,
                })
            )
        );

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

    public async makeSetPublic(setEntityId: string) {
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

    public async duplicateSet(setVersionId: string) {
        const data = await lastValueFrom(
            this.httpClient.post<typeof Marketplace.Set.Duplicate.Response>(
                `${this.ENDPOINT}/${setVersionId}/duplicate`,
                {}
            )
        );

        console.log({ data });

        this._elementSets.update((elementSets) => [
            ...elementSets,
            data.createdSet,
        ]);
    }
    public async deleteExerciseElementSet(versionId: string) {
        await lastValueFrom(
            this.httpClient.delete(`${this.ENDPOINT}/${versionId}/entity`)
        );

        this._elementSets.update((elementSets) =>
            elementSets.filter((set) => set.versionId !== versionId)
        );

        for (const subscription of this._elementSetSubscriptions.entries()) {
            if (subscription[0] === versionId) {
                subscription[1].complete();
                this._elementSetSubscriptions.delete(versionId);
            }
        }
    }
}
