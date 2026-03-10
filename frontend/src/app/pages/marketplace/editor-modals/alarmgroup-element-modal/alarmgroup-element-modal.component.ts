import { Component, computed, input, output, signal } from '@angular/core';
import { VersionedElementModalData } from '../versioned-element-modal/versioned-element-modal.component';
import {
    AlarmGroup,
    AlarmGroupVehicle,
    Marketplace,
    uuid,
    VehicleTemplate,
} from 'fuesim-digital-shared';

interface EditableAlarmgroupTemplateValues {
    name: string;
    limit: number | null;
}

@Component({
    selector: 'app-alarmgroup-element-modal',
    standalone: false,
    templateUrl: './alarmgroup-element-modal.component.html',
    styleUrl: './alarmgroup-element-modal.component.scss',
})
export class AlarmgroupElementModalComponent {
    public data = input.required<VersionedElementModalData<any>>();

    public availableVehicles = computed(() => {
        const vehicles = this.data().availableCollectionElements;
        return vehicles.filter((v) => v.content.type === 'vehicleTemplate');
    });

    public disabled = input<boolean>(false);

    public submit = output<AlarmGroup>();

    public values: EditableAlarmgroupTemplateValues = { name: '', limit: null };

    public selectedVehicles = signal<
        Marketplace.Element.TypedDto<VehicleTemplate>[]
    >([]);

    public addVehicle(vehicle: Marketplace.Element.TypedDto<any>) {
        this.selectedVehicles.update((vehicles) => [...vehicles, vehicle]);
    }

    public removeVehicle(index: number) {
        console.log('Removing vehicle at index', index);
        this.selectedVehicles.update((vehicles) =>
            vehicles.filter((_, i) => i !== index)
        );
    }

    public submitData() {
        const dataToSubmit: AlarmGroup = {
            id: uuid(),
            type: 'alarmGroup',
            name: this.values.name,
            triggerLimit: this.values.limit,
            alarmGroupVehicles: this.selectedVehicles().reduce(
                (acc, vehicle) => {
                    const id = uuid();
                    const alarmGroupVehicle: AlarmGroupVehicle = {
                        id,
                        name: vehicle.content.name,
                        vehicleTemplateId: vehicle.versionId,
                        time: 0, //TODO
                    };
                    acc[id] = alarmGroupVehicle;
                    return acc;
                },
                {} as { [key: string]: AlarmGroupVehicle }
            ),
            triggerCount: 0,
        };

        this.submit.emit(dataToSubmit);
    }
}
