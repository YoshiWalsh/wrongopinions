import { Component, Input } from '@angular/core';
import { PossibleSize } from 'src/app/panel-layout/panel-types/panel-type';
import { ScoreDifferencePanel } from 'src/app/panel-layout/panel-types/score-difference';
import { AnimeTableComponent } from '../anime-table/anime-table.component';

@Component({
	selector: 'app-score-difference-panel',
	templateUrl: './score-difference.component.html',
	styleUrls: ['../anime-table/anime-table.component.scss', './score-difference.component.scss']
})
export class ScoreDifferenceComponent extends AnimeTableComponent<ScoreDifferencePanel> {
	@Input()
	override panel!: ScoreDifferencePanel;

	@Input()
	override size!: PossibleSize;

	constructor() {
		super();
	}
}
