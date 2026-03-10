import { Component, input, output } from '@angular/core';
import { Marketplace } from 'fuesim-digital-shared';

@Component({
    selector: 'app-depending-object-modal',
    standalone: false,
    templateUrl: './depending-object-modal.component.html',
    styleUrl: './depending-object-modal.component.scss',
})
export class DependingObjectModalComponent {
    public collectionVersionId = input.required<Marketplace.Set.VersionId>();

    public submit = output<void>();
}
