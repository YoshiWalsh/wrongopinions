import { Component, Input } from '@angular/core';
import { PossibleSize } from 'src/app/panel-layout/panel-types/panel-type';
import { UnpopularScorePanel } from 'src/app/panel-layout/panel-types/unpopular-score';
import { AnimeTableComponent } from '../anime-table/anime-table.component';

@Component({
	selector: 'app-unpopular-score-panel',
	templateUrl: './unpopular-score.component.html',
	styleUrls: ['../anime-table/anime-table.component.scss', './unpopular-score.component.scss']
})
export class UnpopularScoreComponent extends AnimeTableComponent<UnpopularScorePanel> {
	@Input()
	override panel!: UnpopularScorePanel;

	@Input()
	override size!: PossibleSize;

	constructor() {
		super();
	}

	formatPercentage(percentage: number): string {
		if(percentage >= 10) {
			return percentage.toFixed(0);
		}
		if(percentage >= 1) {
			return percentage.toFixed(1);
		}
		return percentage.toFixed(2);
	}
}
