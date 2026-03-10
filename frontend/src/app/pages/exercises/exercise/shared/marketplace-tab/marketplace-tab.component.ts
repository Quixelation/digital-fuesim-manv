import { Component, inject, signal } from '@angular/core';
import { Marketplace } from 'fuesim-digital-shared';
import { CollectionService } from 'src/app/core/exercise-element.service';
import { DragElementService } from '../core/drag-element.service';

@Component({
    selector: 'app-marketplace-tab',
    standalone: false,
    templateUrl: './marketplace-tab.component.html',
    styleUrl: './marketplace-tab.component.scss',
})
export class MarketplaceTabComponent {
    public readonly dragElementService = inject(DragElementService);
    private readonly collectionService = inject(CollectionService);
    public availableCollections = this.collectionService.elementSets;

    constructor() {
        this.collectionService.loadCollections();
    }

    public selectedCollection = signal<Marketplace.Set.Dto | null>(null);
    public elementsOfSelectedCollection = signal<Marketplace.Element.Dto[]>([]);
    public collectionSubscription: (() => void) | null = null;

    public selectCollection(collection: Marketplace.Set.Dto): void {
        this.selectedCollection.set(collection);
        this.collectionSubscription?.();
        this.collectionSubscription =
            this.collectionService.subscribeToCollection(
                collection.entityId,
                (elements) => {
                    //TODO: @Quixelation: direct does not yet include 1st level dependencies
                    this.elementsOfSelectedCollection.set(
                        elements.objects.direct
                    );
                }
            );
    }
}
