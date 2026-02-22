import type { PipeTransform } from '@angular/core';
import { Pipe } from '@angular/core';

@Pipe({
    name: 'localeDate',
    standalone: false,
})
export class LocaleDatePipe implements PipeTransform {
    transform(date: string | Date): string {
        if (typeof date === 'string') {
            date = new Date(date);
        }
        return date.toLocaleDateString('de-DE');
    }
}
