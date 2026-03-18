import { JsonPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { Marketplace } from 'fuesim-digital-shared';

@Component({
    selector: 'app-element-card',
    imports: [JsonPipe],
    templateUrl: './element-card.component.html',
    styleUrl: './element-card.component.scss',
})
export class ElementCardComponent {
    public readonly element = input.required<Marketplace.Element.Dto>()
}
