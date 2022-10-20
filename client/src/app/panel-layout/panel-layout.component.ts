import { Component, Input, OnInit } from '@angular/core';
import { Panel, PossibleSize } from './panel-types/panel-type';
import { ScoreDifferencePanel } from './panel-types/score-difference';
import { SeriesDirectionPanel } from './panel-types/series-direction';
import { SpecialAwardPanel } from './panel-types/special-award';
import { UnpopularScorePanel } from './panel-types/unpopular-score';

interface PanelSize {
	size: PossibleSize;
	additionalInterest: number;
	additionalArea: number;
}

interface PanelPosition {
	startColumn: number;
	startRow: number;
	endColumn: number;
	endRow: number;
}

interface PositionedPanel<T extends Panel> {
	panel: T;
	position: PanelPosition;
	size: PossibleSize;
}

interface PotentialPanel<T extends Panel> {
	panel: T;
	possibleSizes: Array<PanelSize>;
}

@Component({
	selector: 'app-panel-layout',
	templateUrl: './panel-layout.component.html',
	styleUrls: ['./panel-layout.component.scss']
})
export class PanelLayoutComponent implements OnInit {

	@Input()
	panels!: Array<Panel>;

	@Input()
	columns!: number;

	@Input()
	rows!: number;

	panelLayout!: Array<PositionedPanel<Panel>>;

	constructor() {}

	private initialisePanelLayout() {
		const potentialPanels = this.panels.map<PotentialPanel<Panel>>(p => {
			const possibleSizes = p.getPossibleSizes();
			const assessedSizes = possibleSizes.map((possibleSize, index) => ({
				size: possibleSize,
				additionalInterest: possibleSize.interest - (possibleSizes[index - 1]?.interest ?? 0),
				additionalArea: (possibleSize.rows * possibleSize.columns) -
					((possibleSizes[index - 1]?.rows ?? 0) * (possibleSizes[index - 1]?.columns ?? 0)),
			})).reverse();
			const firstInterestingSizeIndex = assessedSizes.findIndex(s => s.additionalInterest > 0);
			return {
				panel: p,
				possibleSizes: firstInterestingSizeIndex !== -1 ? assessedSizes.slice(firstInterestingSizeIndex) : [],
			};
		});


		let panelsToPlace = [...potentialPanels];
		let layout: Array<PositionedPanel<Panel>>;
		while(true) {
			panelsToPlace = this.trimPanels(panelsToPlace);
			panelsToPlace = this.sortPanels(panelsToPlace);
			layout = this.layoutPanels(panelsToPlace);
			
			if(layout.length < panelsToPlace.length) {
				this.shrinkPanels(panelsToPlace);
			} else {
				break;
			}
		}

		this.panelLayout = layout;
	}

	private trimPanels(potentialPanels: Array<PotentialPanel<Panel>>) {
		return potentialPanels.filter(p => p.possibleSizes.length > 0);
	}

	private sortPanels(potentialPanels: Array<PotentialPanel<Panel>>) {
		return potentialPanels.sort((a, b) =>
			(b.possibleSizes[0].size.baseInterest + b.possibleSizes[0].size.interest) -
			(a.possibleSizes[0].size.baseInterest + a.possibleSizes[0].size.interest)
		);
	}

	private shrinkPanels(potentialPanels: Array<PotentialPanel<Panel>>) {
		let worstPanelRatio = Infinity;
		let worstPanel!: PotentialPanel<Panel>;

		for(const panel of potentialPanels) {
			const ratio = panel.possibleSizes[0].additionalInterest / panel.possibleSizes[0].additionalArea;
			if(ratio < worstPanelRatio) {
				worstPanelRatio = ratio;
				worstPanel = panel;
			}
		}

		worstPanel.possibleSizes.shift();
	}

	private layoutPanels(potentialPanels: Array<PotentialPanel<Panel>>) {
		const layout: Array<PositionedPanel<Panel>> = [];
		const remainingPanels = [...potentialPanels];

		let currentRow = 0;
		let currentColumn = 0;

		// `workingLayout` is similar to `layout`, except panels will be evicted once we
		// pass their last row and they can no longer interfere with newly placed panels.
		let workingLayout: Array<PositionedPanel<Panel>> = [];
		while(true) {
			const interferingPanels = workingLayout.filter(p => p.position.endColumn > currentColumn);
			const lastPossibleColumn = interferingPanels.length > 0 ? Math.min(...interferingPanels.map(p => p.position.startColumn)) : this.columns;
			const maxWidth = lastPossibleColumn - currentColumn;
			const maxHeight = this.rows - currentRow;
			const panelIndex = remainingPanels.findIndex(p => p.possibleSizes[0].size.columns <= maxWidth && p.possibleSizes[0].size.rows <= maxHeight);
			if(panelIndex !== -1) {
				const panel = remainingPanels.splice(panelIndex, 1)[0];
				const positionedPanel: PositionedPanel<Panel> = {
					panel: panel.panel,
					position: {
						startRow: currentRow,
						startColumn: currentColumn,
						endRow: currentRow + panel.possibleSizes[0].size.rows,
						endColumn: currentColumn + panel.possibleSizes[0].size.columns,
					},
					size: panel.possibleSizes[0].size,
				};
				layout.push(positionedPanel);
				workingLayout.push(positionedPanel);
				currentColumn = positionedPanel.position.endColumn;
			} else {
				if(interferingPanels) {
					currentRow++;
					currentColumn = 0;
					workingLayout = workingLayout.filter(p => p.position.endRow > currentRow);
				} else {
					break;
				}
			}

			if(currentRow >= this.rows) {
				break;
			}

			while (true) {
				const interferingPanels = workingLayout.filter(p => p.position.startColumn <= currentColumn && p.position.endColumn > currentColumn);
				if(interferingPanels.length > 0) {
					let earliestPossibleColumn = Math.max(...interferingPanels.map(p => p.position.endColumn));
					currentColumn = earliestPossibleColumn;
				} else {
					break;
				}

			}
		}

		return layout;
	}

	ngOnInit(): void {
		this.initialisePanelLayout();
	}

	getPanelType(panel: PositionedPanel<Panel>): string {
		if(panel.panel instanceof ScoreDifferencePanel) {
			return "score-difference";
		}
		if(panel.panel instanceof UnpopularScorePanel) {
			return "unpopular-score";
		}
		if(panel.panel instanceof SpecialAwardPanel) {
			return "special-award";
		}
		if(panel.panel instanceof SeriesDirectionPanel) {
			return "series-direction";
		}
		return "";
	}

}
