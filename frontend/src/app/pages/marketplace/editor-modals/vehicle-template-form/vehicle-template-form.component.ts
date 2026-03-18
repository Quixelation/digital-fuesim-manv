import type { OnChanges, OnInit } from '@angular/core';
import {
    Component,
    EventEmitter,
    Input,
    Output,
    effect,
    inject,
    input,
    output,
} from '@angular/core';
import { Store } from '@ngrx/store';
import {
    uuid,
    type MaterialTemplate,
    type PersonnelTemplate,
    type UUID,
    type VehicleTemplate,
} from 'fuesim-digital-shared';
import { cloneDeep } from 'lodash-es';
import { VersionedElementModalData } from '../versioned-element-modal/versioned-element-modal.component';
import { MessageService } from '../../../../core/messages/message.service';
import { getImageAspectRatio } from '../../../../shared/functions/get-image-aspect-ratio';
import { AppState } from '../../../../state/app.state';
import {
    selectMaterialTemplates,
    selectPersonnelTemplates,
} from '../../../../state/application/selectors/exercise.selectors';
import { WritableDraft } from 'immer';
import { DisplayValidationComponent } from '../../../../shared/validation/display-validation/display-validation.component';

@Component({
    selector: 'app-vehicle-template-form-marketplace',
    imports: [],
    templateUrl: './vehicle-template-form.component.html',
    styleUrls: ['./vehicle-template-form.component.scss'],
})
export class VehicleTemplateFormMarketplaceComponent {
    private readonly messageService = inject(MessageService);
    private readonly store = inject<Store<AppState>>(Store);

    public data = input.required<VersionedElementModalData<any>>();
    public values = input<WritableDraft<VehicleTemplate>>({
        type: 'vehicleTemplate',
        id: uuid(),
        image: {
            url: '',
            aspectRatio: 1,
            height: 100,
        },
        materialTemplateIds: [],
        personnelTemplateIds: [],
        name: '',
        patientCapacity: 0,
        vehicleType: '',
    });
    public btnText = input<string>('Änderungen speichern');
    public disabled = input<boolean>(false);

    public readonly submit = output<VehicleTemplate>();

    public materialTemplates$ = this.store.select(selectMaterialTemplates);
    public personnelTemplates$ = this.store.select(selectPersonnelTemplates);

    constructor() {}

    /**
     * Emits the changed values via submitVehicleTemplate
     * This method must only be called if all values are valid
     */
    public async submitData() {
        console.log(
            'Submitting vehicle template form with current values',
            this.values()
        );
        if (!this.values) {
            return;
        }
        console.log(
            'Submitting vehicle template form with current values',
            this.values()
        );
        const valuesOnSubmit = cloneDeep(this.values());
        const aspectRatio = await getImageAspectRatio(
            this.values()?.image.url!
        ).catch((error) => {
            this.messageService.postError({
                title: 'Ungültige URL',
                body: 'Bitte überprüfen Sie die Bildadresse.',
                error,
            });
        });

        console.log(
            'Submitting vehicle template with values',
            valuesOnSubmit,
            'and aspect ratio',
            aspectRatio
        );
        this.submit.emit({
            ...valuesOnSubmit,
            image: {
                ...valuesOnSubmit.image,
                aspectRatio: aspectRatio ?? valuesOnSubmit.image.aspectRatio,
            },
        });
    }

    public addPersonnel(personnelTemplate: PersonnelTemplate) {
        if (!this.values) {
            return;
        }
        this.values().personnelTemplateIds.push(personnelTemplate.id);
    }

    public removePersonnel(index: number) {
        if (!this.values) {
            return;
        }
        this.values().personnelTemplateIds.splice(index, 1);
    }

    public addMaterial(materialTemplate: MaterialTemplate) {
        if (!this.values) {
            return;
        }
        this.values().materialTemplateIds.push(materialTemplate.id);
    }

    public removeMaterial(index: number) {
        if (!this.values) {
            return;
        }
        this.values().materialTemplateIds.splice(index, 1);
    }
}
