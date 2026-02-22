import { Component, inject } from '@angular/core';
import { ExerciseElementService } from '../../../core/exercise-element.service';

@Component({
    selector: 'app-marketplace-layout',
    standalone: false,
    templateUrl: './marketplace-layout.component.html',
    styleUrl: './marketplace-layout.component.scss',
})
export class MarketplaceLayoutComponent {
    private readonly exerciseElementService = inject(ExerciseElementService);

    public constructor() {
        this.exerciseElementService.loadElementSets();
    }

    public get elementSets() {
        return this.exerciseElementService.elementSets();
    }

    public async createNewExercise() {
        //TODO: @Quixelation
        const exerciseSetName = prompt('Name of the new exercise set');

        await this.exerciseElementService.createElementSet(
            exerciseSetName ?? 'New Exercise Set'
        );
    }
}
