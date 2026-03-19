import { Component, computed, inject, input, signal } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import {
    ElementDto,
    Marketplace,
    VersionedCollectionPartial,
    VersionedElementContent,
} from 'fuesim-digital-shared';
import { CollectionService } from '../../../../core/exercise-element.service';
import { VehicleTemplateFormMarketplaceComponent } from '../vehicle-template-form/vehicle-template-form.component';
import { AlarmgroupElementModalComponent } from '../alarmgroup-element-modal/alarmgroup-element-modal.component';
import { LocaleDatePipe } from '../../../../shared/pipes/localeDate.pipe';

export interface SharedVersionedElementModalData<T> {
    onSubmit: (values: T) => void;
    type: VersionedElementContent['type'];
    collection: VersionedCollectionPartial;
    isEditMode: boolean;
    availableCollectionElements: ElementDto[];
}

export interface CreatingVersionedElementModalData<T>
    extends SharedVersionedElementModalData<T> {
    isEditMode: false;
}

export interface EditingVersionedElementModalData<T>
    extends SharedVersionedElementModalData<T> {
    isEditMode: true;
    element: ElementDto;
}

export type VersionedElementModalData<T> =
    | CreatingVersionedElementModalData<T>
    | EditingVersionedElementModalData<T>;

@Component({
    selector: 'app-versioned-element-modal',
    imports: [
        VehicleTemplateFormMarketplaceComponent,
        AlarmgroupElementModalComponent,
        LocaleDatePipe,
    ],
    templateUrl: './versioned-element-modal.component.html',
    styleUrl: './versioned-element-modal.component.scss',
})
export class VersionedElementModalComponent {
    private readonly collectionService = inject(CollectionService);
    private readonly activeModal = inject(NgbActiveModal);

    // This data must be provided when opening the modal via NgbModal.
    public data!: VersionedElementModalData<any>;

    public readonly selectedVersion = signal<number | null>(null);
    public readonly selectedVehicleVersionData = computed(() => {
        if (this.selectedVersion() === null) {
            return null;
        }
        return this.findVersionData(this.selectedVersion()!);
    });

    public readonly versionHistory = signal<ElementDto[] | null>(null);

    public async selectVersion(version: number) {
        this.selectedVersion.set(version);
    }

    public findVersionData(version: number) {
        const versionData = this.versionHistory()
            ? this.versionHistory()!.find((v) => v.version === version)
            : null;

        if (!versionData) {
            throw new Error('Version data not found for version ' + version);
        }

        return {};
    }

    public async ngOnInit() {
        if (this.data.isEditMode) {
            const versionData = await this.collectionService.getElementVersions(
                this.data.collection.entityId,
                this.data.element.entityId
            );
            this.versionHistory.set(versionData);

            if (
                this.selectedVersion() === null &&
                this.data.element.version !== null
            ) {
                this.selectedVersion.set(this.data.element.version);
            }
        }
    }

    public async submit(data: any) {
        this.data.onSubmit(data);
        this.close();
    }

    private close() {
        this.activeModal.close();
    }
}
