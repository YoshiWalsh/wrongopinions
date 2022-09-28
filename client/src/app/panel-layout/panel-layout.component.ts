import { Component, Input, OnInit } from '@angular/core';
import { Panel, PossibleSize } from './panel-types/panel-type';

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

interface PositionedPanel {
	panel: Panel;
	position: PanelPosition;
}

interface PotentialPanel {
	panel: Panel;
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

	panelLayout!: Array<PositionedPanel>;

	constructor() {}

	private initialisePanelLayout() {
		const potentialPanels = this.panels.map<PotentialPanel>(p => {
			const possibleSizes = p.getPossibleSizes();
			return {
				panel: p,
				possibleSizes: possibleSizes.map((possibleSize, index) => ({
					size: possibleSize,
					additionalInterest: possibleSize.interest - (possibleSizes[index - 1]?.interest ?? 0),
					additionalArea: (possibleSize.rows * possibleSize.columns) -
						((possibleSizes[index - 1]?.rows ?? 0) * (possibleSizes[index - 1]?.columns ?? 0)),
				})).reverse(),
			};
		});

		const sortedPotentialPanels = this.sortPanels(potentialPanels);

		const layout = this.layoutPanels(sortedPotentialPanels);

		this.panelLayout = layout;
	}

	private sortPanels(potentialPanels: Array<PotentialPanel>) {
		return potentialPanels.sort((a, b) =>
			b.possibleSizes[b.possibleSizes.length - 1].size.baseInterest -
			a.possibleSizes[a.possibleSizes.length - 1].size.baseInterest
		);
	}

	private layoutPanels(potentialPanels: Array<PotentialPanel>) {
		const layout: Array<PositionedPanel> = [];
		const remainingPanels = potentialPanels;

		let currentRow = 0;
		let currentColumn = 0;

		// `workingLayout` is similar to `layout`, except panels will be evicted once we
		// pass their last row and they can no longer interfere with newly placed panels.
		let workingLayout: Array<PositionedPanel> = [];
		while(true) {
			const interferingPanels = workingLayout.filter(p => p.position.endColumn > currentColumn);
			const lastPossibleColumn = interferingPanels.length > 0 ? Math.min(...interferingPanels.map(p => p.position.startColumn)) : this.columns;
			const maxWidth = lastPossibleColumn - currentColumn;
			const maxHeight = this.rows - currentRow;
			const panelIndex = remainingPanels.findIndex(p => p.possibleSizes[0].size.columns <= maxWidth && p.possibleSizes[0].size.rows <= maxHeight);
			if(panelIndex !== -1) {
				const panel = remainingPanels.splice(panelIndex, 1)[0];
				const positionedPanel: PositionedPanel = {
					panel: panel.panel,
					position: {
						startRow: currentRow,
						startColumn: currentColumn,
						endRow: currentRow + panel.possibleSizes[0].size.rows,
						endColumn: currentColumn + panel.possibleSizes[0].size.columns,
					},
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

}
