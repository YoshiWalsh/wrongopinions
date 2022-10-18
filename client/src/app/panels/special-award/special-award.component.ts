import { Component, Input } from '@angular/core';
import { SpecialAwardPanel } from 'src/app/panel-layout/panel-types/special-award';

@Component({
	selector: 'app-special-award-panel',
	templateUrl: './special-award.component.html',
	styleUrls: ['./special-award.component.scss']
})
export class SpecialAwardComponent {
	@Input()
	panel!: SpecialAwardPanel;

	constructor() {
	}
}
