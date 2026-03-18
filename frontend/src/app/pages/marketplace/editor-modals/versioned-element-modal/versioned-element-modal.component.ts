import { Component, computed, inject, input, signal } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Marketplace } from 'fuesim-digital-shared';
import { CollectionService } from '../../../../core/exercise-element.service';

export interface SharedVersionedElementModalData<T> {
    onSubmit: (values: T) => void;
    type: Marketplace.ExerciseElementObjectUnion['type'];
    collectionVersionId: Marketplace.Set.VersionId;
    isEditMode: boolean;
    availableCollectionElements: Marketplace.Element.Dto[];
}

export interface CreatingVersionedElementModalData<T>
    extends SharedVersionedElementModalData<T> {
    isEditMode: false;
}

export interface EditingVersionedElementModalData<T>
    extends SharedVersionedElementModalData<T> {
    collectionEntityId: Marketplace.Set.EntityId;
    isEditMode: true;
    elementEntityId: Marketplace.Element.EntityId;
    currentVersion: number;
    editableTemplateValues: T;
}

export type VersionedElementModalData<T> =
    | CreatingVersionedElementModalData<T>
    | EditingVersionedElementModalData<T>;

@Component({
    selector: 'app-versioned-element-modal',
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

    public readonly versionHistory = signal<Marketplace.Element.Dto[] | null>(
        null
    );

    public async selectVersion(version: number) {
        this.selectedVersion.set(version);
    }

    public editableValues = signal<any>(null);

    public findVersionData(version: number) {
        console.log('Finding version data for version', version);
        const versionData = this.versionHistory()
            ? this.versionHistory()!.find((v) => v.version === version)
            : null;
        if (!versionData) {
            throw new Error('Version data not found for version ' + version);
        }

        console.log('versionData', versionData);
        return {};
    }

    public async ngOnInit() {
        if (this.data.isEditMode !== true) {
            return;
        }

        this.editableValues.set(this.data.editableTemplateValues);

        if (Marketplace.Element.isEntityId(this.data.elementEntityId)) {
            console.error('Invalid entityId', this.data.elementEntityId);
            this.close();
            return;
        }

        const versionData = await this.collectionService.getElementVersions(
            this.data.elementEntityId
        );
        this.versionHistory.set(versionData);

        if (
            this.selectedVersion() === null &&
            this.data.currentVersion !== null
        ) {
            this.selectedVersion.set(this.data.currentVersion);
        }
    }

    public async submit(data: any) {
        console.log('Submitting data', data);
        this.data.onSubmit(data);
    }

    private close() {
        this.activeModal.close();
    }
}
