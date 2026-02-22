import {
    Component,
    computed,
    inject,
    input,
    OnInit,
    signal,
} from '@angular/core';
import { ExerciseElementObjectDto, uuid } from 'fuesim-digital-shared';
import {
    ChangedVehicleTemplateValues,
    EditableVehicleTemplateValues,
} from 'src/app/shared/components/vehicle-template-form/vehicle-template-form.component';
import { ExerciseElementService } from '../../../core/exercise-element.service';
import { vehicleTemplateSchema } from '../../../../../../shared/dist/models/vehicle-template';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
    selector: 'app-vehicle-element-modal',
    standalone: false,
    templateUrl: './vehicle-element-modal.component.html',
    styleUrl: './vehicle-element-modal.component.scss',
})
export class VehicleElementModalComponent implements OnInit {
    private readonly exerciseService = inject(ExerciseElementService);
    private readonly activeModal = inject(NgbActiveModal);

    public readonly elementSetId: string = '';
    public readonly isEditMode = false;
    public readonly entityId: string | null = null;
    public readonly currentVersion: number | null = null;
    public readonly selectedVersion = signal<number | null>(null);
    public readonly selectedVehicleVersionData = computed(() => {
        if (this.selectedVersion() === null) {
            return null;
        }
        return this.findVersionData(this.selectedVersion()!);
    });

    public readonly onSubmit:
        | ((values: ChangedVehicleTemplateValues) => Promise<void>)
        | null = null;

    public readonly versionHistory = signal<ExerciseElementObjectDto[] | null>(
        null
    );

    public async ngOnInit() {
        console.log(this.entityId);
        if (this.isEditMode && this.entityId) {
            const versionData =
                await this.exerciseService.getElementObjectVersions(
                    this.entityId
                );
            this.versionHistory.set(versionData);

            if (
                this.selectedVersion() === null &&
                this.currentVersion !== null
            ) {
                this.selectedVersion.set(this.currentVersion);
            }
        }
    }

    public readonly editableVehicleTemplateValues: EditableVehicleTemplateValues =
        {
            url: null,
            height: 100,
            name: null,
            patientCapacity: 1,
            type: null,
            materialTemplates: [],
            personnelTemplates: [],
        };

    public async selectVersion(version: number) {
        this.selectedVersion.set(version);
    }

    public findVersionData(version: number) {
        console.log('Finding version data for version', version);
        const versionData = this.versionHistory()
            ? this.versionHistory()!.find((v) => v.version === version)
            : null;
        if (!versionData) {
            throw new Error('Version data not found for version ' + version);
        }
        return {
            name: versionData.title,
            url: versionData.content.image.url,
            height: versionData.content.image.height,
            patientCapacity: versionData.content.patientCapacity,
            type: versionData.content.vehicleType,
            materialTemplates: [], //TODO: @Quixelation
            personnelTemplates: [], //TODO: @Quixelation
        } satisfies EditableVehicleTemplateValues;
    }

    public async submitVehicleTemplate(
        changedValues: ChangedVehicleTemplateValues
    ) {
        if (this.elementSetId === '') {
            throw new Error('elementSetId is null');
        }
        await this.onSubmit?.(changedValues);
        this.close();
    }

    private close() {
        this.activeModal.close();
    }
}
