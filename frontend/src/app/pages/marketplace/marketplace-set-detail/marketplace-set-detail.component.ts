import { Component, inject, OnDestroy, Signal, signal } from '@angular/core';
import {
    ExerciseElementService,
    ExerciseElementSetSubscriptionData,
} from '../../../core/exercise-element.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Marketplace, uuid } from 'fuesim-digital-shared';
import { Subject, takeUntil } from 'rxjs';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { VehicleElementModalComponent } from '../vehicle-element-modal/vehicle-element-modal.component';
import {
    ChangedVehicleTemplateValues,
    EditableVehicleTemplateValues,
} from '../../../shared/components/vehicle-template-form/vehicle-template-form.component';
import { vehicleTemplateSchema } from '../../../../../../shared/dist/models/vehicle-template';

@Component({
    selector: 'app-marketplace-set-detail',
    standalone: false,
    templateUrl: './marketplace-set-detail.component.html',
    styleUrl: './marketplace-set-detail.component.scss',
})
export class MarketplaceSetDetailComponent implements OnDestroy {
    private readonly activatedRoute = inject(ActivatedRoute);
    private readonly exerciseElementSetService = inject(ExerciseElementService);
    private readonly ngbModalService = inject(NgbModal);
    private readonly router = inject(Router);

    private _setEntityId!: Marketplace.Set.EntityId;

    private readonly destroy$ = new Subject<void>();

    public selectedSetData = signal<ExerciseElementSetSubscriptionData | null>(
        null
    );

    constructor() {
        this.activatedRoute.paramMap
            .pipe(takeUntil(this.destroy$))
            .subscribe((params) => {
                const setEntityId = params.get('setEntityId') ?? '';

                if (!Marketplace.Set.isSetEntityId(setEntityId)) {
                    this.router.navigate(['/marketplace']);
                    return;
                }

                this._setEntityId = setEntityId;

                this.exerciseElementSetService.subscribeToElementSet(
                    setEntityId,
                    (data) => {
                        this.selectedSetData.set(data);
                    }
                );
            });
    }

    public createNewVehicle() {
        const selectedSetData = this.selectedSetData?.();
        if (!selectedSetData) {
            throw new Error('selectedSetData is null');
        }
        const elementSetId = selectedSetData.setData.entityId;

        const modal = this.ngbModalService.open(VehicleElementModalComponent, {
            size: 'xl',
        });
        modal.componentInstance.elementSetId = elementSetId;
        modal.componentInstance.onSubmit = async ({
            url,
            height,
            aspectRatio,
            name,
            materialTemplateIds,
            patientCapacity,
            personnelTemplateIds,
            type,
        }: ChangedVehicleTemplateValues) => {
            this.exerciseElementSetService.createElementObject(
                elementSetId,
                vehicleTemplateSchema.parse({
                    id: uuid(),
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
                })
            );
        };
    }

    public editVehicle(entity: Marketplace.Element.Dto) {
        if (entity.content.type !== 'vehicleTemplate') {
            throw new Error('Entity is not a vehicleTemplate');
        }

        const selectedSetData = this.selectedSetData?.();
        if (!selectedSetData) {
            throw new Error('selectedSetData is null');
        }

        const modal = this.ngbModalService.open(VehicleElementModalComponent, {
            size: 'xl',
        });
        modal.componentInstance.elementSetId =
            selectedSetData.setData.versionId;
        modal.componentInstance.isEditMode = true;
        modal.componentInstance.entityId = entity.entityId;
        modal.componentInstance.currentVersion = entity.version;
        modal.componentInstance.editableVehicleTemplateValues = {
            name: entity.content.name,
            url: entity.content.image.url,
            height: entity.content.image.height,
            materialTemplates: [], //TODO: @Quixelation
            personnelTemplates: [], //TODO: @Quixelation
            patientCapacity: entity.content.patientCapacity,
            type: entity.content.vehicleType,
        } satisfies EditableVehicleTemplateValues;
        modal.componentInstance.onSubmit = async ({
            url,
            height,
            aspectRatio,
            name,
            materialTemplateIds,
            patientCapacity,
            personnelTemplateIds,
            type,
        }: ChangedVehicleTemplateValues) => {
            this.exerciseElementSetService.updateElementObject(
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
        };
    }

    public async deleteExerciseObject(entityId: Marketplace.Element.EntityId) {
        await this.exerciseElementSetService.deleteExerciseElementObject(
            entityId,
            this._setEntityId
        );
    }

    public async makeSetPublic() {
        if (!this._setEntityId) return;

        await this.exerciseElementSetService.makeSetPublic(this._setEntityId);
    }

    public async duplicateSet() {
        const selectedVersion = this.selectedSetData()?.setData.versionId;
        if (!selectedVersion) return;
        console.log('duplicateSet', this._setEntityId);

        await this.exerciseElementSetService.duplicateSet(
            this._setEntityId,
            selectedVersion
        );
    }

    public async deleteSet() {
        if (!this._setEntityId) return;

        await this.exerciseElementSetService.deleteExerciseElementSet(
            this._setEntityId
        );

        this.router.navigate(['/marketplace']);
    }

    ngOnDestroy(): void {
        this.destroy$.next();
    }
}
