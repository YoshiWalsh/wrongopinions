import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
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

export interface PositionedPanel<T extends Panel> {
	panel: T;
	position: PanelPosition;
	size: PossibleSize;
}

interface PotentialPanel<T extends Panel> {
	panel: T;
	possibleSizes: Array<PanelSize>;
	currentSizeIndex: number;
	currentSize: PanelSize;
}

@Component({
	selector: 'app-panel-layout',
	templateUrl: './panel-layout.component.html',
	styleUrls: ['./panel-layout.component.scss']
})
export class PanelLayoutComponent implements OnInit, OnChanges {

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
				possibleSizes: assessedSizes,
				currentSizeIndex: firstInterestingSizeIndex,
				currentSize: assessedSizes[firstInterestingSizeIndex],
			};
		});


		// Repeatedly shrink the panel that's offering the least interest per cell
		// until the panels fit within the available space. For users with lots of
		// panels, this might need to shrink the panels many times, so to maintain
		// performance we can't get too clever here.
		let layout: Array<PositionedPanel<Panel>>;
		while(true) {
			this.sortPanels(potentialPanels);
			const panelsToPlace = potentialPanels.filter(p => p.currentSize);
			layout = this.layoutPanels(panelsToPlace);
			
			if(layout.length < panelsToPlace.length) {
				this.shrinkPanels(potentialPanels);
			} else {
				break;
			}
		}
		// Due to the way panels within the layout interact, the changing sort order,
		// and the fact that the next smaller size might be several cells smaller,
		// the shrinking algorithm might shrink cells more than necessary and the
		// layout might have an unsightly gap at the bottom.

		// We will use a brute force tactic to try re-growing the panels into this space.
		// Even though this is expensive, at maximum we'll only have to run this as many
		// times as there are empty cells in the last row, so the amount of time this
		// can take is somewhat constrained.
		const endRow = this.getEndRow(layout);
		while(this.hasGaps(layout, endRow)) {
			const newLayout = this.growPanels(potentialPanels, endRow);

			if(!newLayout) {
				// If unable to grow any panels, give up
				break;
			} else {
				layout = newLayout;
			}
		}

		this.panelLayout = layout;
	}

	private sortPanels(potentialPanels: Array<PotentialPanel<Panel>>) {
		return potentialPanels.sort((a, b) =>
			(b.currentSize?.size?.baseInterest + b.currentSize?.size?.interest || 0) -
			(a.currentSize?.size?.baseInterest + a.currentSize?.size?.interest || 0)
		);
	}

	private sortGrowablePanels(growablePanels: Array<PotentialPanel<Panel>>) {
		return growablePanels.sort((a, b) => {
			const aGrownSize = a.possibleSizes[a.currentSizeIndex - 1];
			const bGrownSize = b.possibleSizes[b.currentSizeIndex - 1];
			// We add a very small amount to the additionalInterest values so that if there are
			// multiple growable panels with an additional interest of 0 then we will use whichever
			// one requires the smallest amount of additional area.
			const aRatio = (aGrownSize.additionalInterest + 0.001) / aGrownSize.additionalArea;
			const bRatio = (bGrownSize.additionalInterest + 0.001) / bGrownSize.additionalArea;
			return bRatio - aRatio;
		});
	}

	private shrinkPanels(potentialPanels: Array<PotentialPanel<Panel>>) {
		let worstPanelRatio = Infinity;
		let worstPanel!: PotentialPanel<Panel>;

		for(const panel of potentialPanels) {
			if(!panel.currentSize) {
				continue;
			}
			const ratio = panel.currentSize.additionalInterest / panel.currentSize.additionalArea;
			if(ratio < worstPanelRatio) {
				worstPanelRatio = ratio;
				worstPanel = panel;
			}
		}

		worstPanel.currentSizeIndex++;
		worstPanel.currentSize = worstPanel.possibleSizes[worstPanel.currentSizeIndex];
	}

	private growPanels(potentialPanels: Array<PotentialPanel<Panel>>, maximumEndRow: number): Array<PositionedPanel<Panel>> | null {
		const growablePanels = potentialPanels.filter(p => p.currentSizeIndex > 0);
		this.sortGrowablePanels(growablePanels);

		for(const growablePanel of growablePanels) {
			const initialSizeIndex = growablePanel.currentSizeIndex;

			while(growablePanel.currentSizeIndex > 0) {
				growablePanel.currentSizeIndex--;
				growablePanel.currentSize = growablePanel.possibleSizes[growablePanel.currentSizeIndex];

				this.sortPanels(potentialPanels);
				const panelsToPlace = potentialPanels.filter(p => p.currentSize);
				const newLayout = this.layoutPanels(panelsToPlace);

				if(newLayout.length >= panelsToPlace.length && this.getEndRow(newLayout) <= maximumEndRow) {
					// Grew a panel, return the new layout
					return newLayout;
				}
			}
			// Unable to grow this panel, shrink it back down and try another
			growablePanel.currentSizeIndex = initialSizeIndex;
			growablePanel.currentSize = growablePanel.possibleSizes[growablePanel.currentSizeIndex];
			continue;
		}

		// Wasn't able to grow any panels
		return null;
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
			const panelIndex = remainingPanels.findIndex(p => p.currentSize.size.columns <= maxWidth && p.currentSize.size.rows <= maxHeight);
			if(panelIndex !== -1) {
				const panel = remainingPanels.splice(panelIndex, 1)[0];
				const positionedPanel: PositionedPanel<Panel> = {
					panel: panel.panel,
					position: {
						startRow: currentRow,
						startColumn: currentColumn,
						endRow: currentRow + panel.currentSize.size.rows,
						endColumn: currentColumn + panel.currentSize.size.columns,
					},
					size: panel.currentSize.size,
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

	private getEndRow(layout: Array<PositionedPanel<Panel>>): number {
		return layout.reduce((acc, cur) => Math.max(acc, cur.position.endRow), 0);
	}

	private isRowFull(layout: Array<PositionedPanel<Panel>>, row: number) {
		const rowPanels = layout.filter(p => p.position.startRow <= row && p.position.endRow > row);

		for(let i = 0; i < this.columns; i++) {
			const panel = rowPanels.find(p => p.position.startColumn <= i && p.position.endColumn > i);
			if(!panel) {
				return false;
			}
		}
		return true;
	}

	private hasGaps(layout: Array<PositionedPanel<Panel>>, rows: number): boolean {
		for(let i = 0; i < rows; i++) {
			if(!this.isRowFull(layout, i)) {
				return true;
			}
		}
		return false;
	}

	ngOnInit(): void {
		this.initialisePanelLayout();
	}

	ngOnChanges(changes: SimpleChanges): void {
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
