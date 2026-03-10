import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import {
    CollectionService,
    ExerciseElementSetSubscriptionData,
} from '../../../core/exercise-element.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Marketplace } from 'fuesim-digital-shared';
import { Subject, takeUntil } from 'rxjs';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ChangedVehicleTemplateValues } from '../../../shared/components/vehicle-template-form/vehicle-template-form.component';
import { vehicleTemplateSchema } from '../../../../../../shared/dist/models/vehicle-template';
import {
    CreatingVersionedElementModalData,
    EditingVersionedElementModalData,
    VersionedElementModalComponent,
} from '../editor-modals/versioned-element-modal/versioned-element-modal.component';

@Component({
    selector: 'app-marketplace-set-detail',
    standalone: false,
    templateUrl: './marketplace-set-detail.component.html',
    styleUrl: './marketplace-set-detail.component.scss',
})
export class MarketplaceSetDetailComponent implements OnDestroy {
    private readonly activatedRoute = inject(ActivatedRoute);
    private readonly collectionService = inject(CollectionService);
    private readonly ngbModalService = inject(NgbModal);
    private readonly router = inject(Router);

    public _setEntityId!: Marketplace.Set.EntityId;

    private readonly destroy$ = new Subject<void>();

    public selectedSetData = signal<ExerciseElementSetSubscriptionData | null>(
        null
    );

    public availableElements = computed(() => {
        const selectedSetData = this.selectedSetData();
        if (!selectedSetData) return [];

        return [
            ...selectedSetData.objects.direct,
            ...selectedSetData.objects.transitive.flatMap((d) => d.elements),
        ];
    });

    private subscription: (() => void) | null = null;

    constructor() {
        this.activatedRoute.paramMap
            .pipe(takeUntil(this.destroy$))
            .subscribe((params) => {
                this.subscription?.();
                const setEntityId = params.get('setEntityId') ?? '';

                if (!Marketplace.Set.isSetEntityId(setEntityId)) {
                    this.router.navigate(['/marketplace']);
                    return;
                }

                this._setEntityId = setEntityId;

                this.subscription =
                    this.collectionService.subscribeToCollection(
                        setEntityId,
                        (data) => {
                            console.log(
                                'Received data for set',
                                setEntityId,
                                data
                            );
                            this.selectedSetData.set(data);
                        }
                    );
            });
    }

    public availableCollections = this.collectionService.elementSets;

    public createNewAlarmgroup() {
        const selectedSetData = this.selectedSetData?.();
        if (!selectedSetData) {
            throw new Error('selectedSetData is null');
        }

        const modal = this.ngbModalService.open(
            VersionedElementModalComponent,
            {
                size: 'xl',
            }
        );
        modal.componentInstance.data = {
            type: 'alarmGroup',
            isEditMode: false,
            onSubmit: async (data: any) => {
                console.log('Creating new alarm group with data', data);
                await this.collectionService.createElement(
                    this._setEntityId,
                    data
                );
            },
            collectionVersionId: selectedSetData.collection.versionId,
            availableCollectionElements: this.availableElements(),
        } satisfies CreatingVersionedElementModalData<ChangedVehicleTemplateValues>;
    }

    public createNewVehicle() {
        const selectedSetData = this.selectedSetData?.();
        if (!selectedSetData) {
            throw new Error('selectedSetData is null');
        }

        const modal = this.ngbModalService.open(
            VersionedElementModalComponent,
            {
                size: 'xl',
            }
        );
        modal.componentInstance.data = {
            type: 'vehicleTemplate',
            isEditMode: false,
            onSubmit: async (vehicleTemplate) => {
                console.log(
                    'Creating new vehicle template with data',
                    vehicleTemplate
                );
                this.collectionService.createElement(
                    this._setEntityId,
                    vehicleTemplateSchema.parse(vehicleTemplate)
                );
            },
            collectionVersionId: selectedSetData.collection.versionId,
            availableCollectionElements: this.availableElements(),
        } satisfies CreatingVersionedElementModalData<ChangedVehicleTemplateValues>;
    }

    public editVehicle(entity: Marketplace.Element.Dto) {
        if (entity.content.type !== 'vehicleTemplate') {
            throw new Error('Entity is not a vehicleTemplate');
        }

        const selectedSetData = this.selectedSetData?.();
        if (!selectedSetData) {
            throw new Error('selectedSetData is null');
        }

        const modal = this.ngbModalService.open(
            VersionedElementModalComponent,
            {
                size: 'xl',
            }
        );
        modal.componentInstance.data = {
            isEditMode: true,
            type: 'vehicleTemplate',
            editableTemplateValues: {
                aspectRatio: 1,
                name: entity.content.name,
                url: entity.content.image.url,
                height: entity.content.image.height,
                materialTemplateIds: [], //TODO: @Quixelation
                personnelTemplateIds: [], //TODO: @Quixelation
                patientCapacity: entity.content.patientCapacity,
                type: entity.content.vehicleType,
            },
            onSubmit: async ({
                url,
                height,
                aspectRatio,
                name,
                materialTemplateIds,
                patientCapacity,
                personnelTemplateIds,
                type,
            }: ChangedVehicleTemplateValues) => {
                this.collectionService.updateElement(
                    entity.entityId,
                    vehicleTemplateSchema.parse({
                        id: entity.content.id,
                        type: 'vehicleTemplate',
                        image: {
                            url,
                            height,
                            aspectRatio,
                        },
                        name,
                        materialTemplateIds,
                        personnelTemplateIds,
                        patientCapacity,
                        vehicleType: type,
                    }),
                    this._setEntityId
                );
            },
            currentVersion: entity.version,
            collectionEntityId: this._setEntityId,
            elementEntityId: entity.entityId,
            collectionVersionId: selectedSetData.collection.versionId,
            availableCollectionElements: this.availableElements(),
        } satisfies EditingVersionedElementModalData<ChangedVehicleTemplateValues>;
    }

    public async deleteExerciseObject(entityId: Marketplace.Element.EntityId) {
        await this.collectionService.deleteElement(entityId, this._setEntityId);
    }

    public async makeSetPublic() {
        if (!this._setEntityId) return;

        await this.collectionService.makeCollectionPublic(this._setEntityId);
    }

    public async duplicateSet() {
        const selectedVersion = this.selectedSetData()?.collection.versionId;
        if (!selectedVersion) return;
        console.log('duplicateSet', this._setEntityId);

        await this.collectionService.duplicateCollection(
            this._setEntityId,
            selectedVersion
        );
    }

    public async importFromCollection(
        collectionVersionId: Marketplace.Set.VersionId
    ) {
        await this.collectionService.addCollectionDependency({
            importTo: this._setEntityId,
            importFrom: collectionVersionId,
        });
    }

    public async removeCollectionDependency(
        collectionVersionId: Marketplace.Set.VersionId
    ) {
        await this.collectionService.removeCollectionDependency({
            removeFrom: this._setEntityId,
            removeVersionId: collectionVersionId,
        });
    }

    public async deleteSet() {
        if (!this._setEntityId) return;

        await this.collectionService.deleteCollection(this._setEntityId);

        this.router.navigate(['/marketplace']);
    }

    public async saveDraftState() {
        await this.collectionService.saveDraftState(this._setEntityId);
    }

    ngOnDestroy(): void {
        this.destroy$.next();
    }
}
