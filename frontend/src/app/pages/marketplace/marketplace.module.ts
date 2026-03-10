import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedModule } from 'src/app/shared/shared.module';
import { MarketplaceComponent } from './marketplace/marketplace.component';
import {
    NgbDropdown,
    NgbDropdownButtonItem,
    NgbDropdownItem,
    NgbDropdownMenu,
    NgbDropdownToggle,
    NgbNavModule,
    NgbTooltip,
} from '@ng-bootstrap/ng-bootstrap';
import { MarketplaceLayoutComponent } from './marketplace-layout/marketplace-layout.component';
import { MarketplaceRoutingModule } from './marketplace-routing.module';
import { MarketplaceSetDetailComponent } from './marketplace-set-detail/marketplace-set-detail.component';
import { AlarmgroupElementModalComponent } from './editor-modals/alarmgroup-element-modal/alarmgroup-element-modal.component';
import { VersionedElementModalComponent } from './editor-modals/versioned-element-modal/versioned-element-modal.component';
import { DependingObjectModalComponent } from './editor-modals/depending-object-modal/depending-object-modal.component';
import { VehicleTemplateFormMarketplaceComponent } from './editor-modals/vehicle-template-form/vehicle-template-form.component';

@NgModule({
    declarations: [
        MarketplaceComponent,
        MarketplaceLayoutComponent,
        MarketplaceSetDetailComponent,
        AlarmgroupElementModalComponent,
        VersionedElementModalComponent,
        DependingObjectModalComponent,
        VehicleTemplateFormMarketplaceComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        SharedModule,
        NgbNavModule,
        MarketplaceRoutingModule,
        NgbDropdown,
        NgbDropdownToggle,
        NgbDropdownMenu,
        NgbDropdownItem,
        NgbDropdownButtonItem,
        NgbTooltip,
    ],
    exports: [MarketplaceLayoutComponent],
})
export class MarketplaceModule {}
