import { Component, ElementRef, Input, OnChanges, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { PositionedPanel } from '../panel-layout/panel-layout.component';
import { Panel } from '../panel-layout/panel-types/panel-type';
import { SVG, Svg, Element as SVGjsElement } from '@svgdotjs/svg.js';
import '@svgdotjs/svg.filter.js';
import { demand } from 'ts-demand';

interface Point {
	horizontalOffset: number;
	verticalOffset: number;
}

@Component({
	selector: 'app-panel-outlines',
	templateUrl: './panel-outlines.component.html',
	styleUrls: ['./panel-outlines.component.scss']
})
export class PanelOutlinesComponent implements OnInit, OnChanges {
	@Input()
	columns!: number;

	@Input()
	columnWidth!: number;

	@Input()
	rows!: number;

	@Input()
	rowHeight!: number;

	@Input()
	margins!: number;

	@Input()
	gaps!: number;

	@Input()
	panelLayout!: Array<PositionedPanel<Panel>>;

	@ViewChild('container')
	container!: ElementRef<HTMLDivElement>;

	svg!: Svg;

	constructor() { }

	ngOnInit(): void {
	}

	ngAfterViewInit() {
		this.svg = SVG().addTo(this.container.nativeElement as unknown as SVGjsElement);
		this.render();
	}

	ngOnChanges(changes: SimpleChanges): void {
		if(this.svg) {
			this.render();
		}
	}

	render() {
		this.svg.clear();
		this.svg.size(this.getColumnX(this.columns + 1) + this.margins * 0.5, this.getRowY(this.rows + 1) + this.margins * 0.5);

		// Adapted from https://observablehq.com/@oliviafvane/simple-pencil-ink-pen-effect-for-svg-path-using-filters
		const filter = this.svg.filter(filter => {
			const turb = filter.turbulence(0.067114093959731544, 5, 0, 'noStitch', 'turbulence');
			filter.displacementMap(filter.$source, turb, 1.5, 'A', 'A');
		}).attr({
			// Expand the drawn area for the filter to avoid our lines being cropped.
			'x': '-100%',
			'y': '-100%',
			'width': '300%',
			'height': '300%',
		});

		const panelsMap: Array<Array<PositionedPanel<Panel> | null>> = Array(this.columns).fill(null).map(() => Array(this.rows).fill(null));
		for (const panel of this.panelLayout) {
			for(let x = panel.position.startColumn; x < panel.position.endColumn; x++) {
				for(let y = panel.position.startRow; y < panel.position.endRow; y++) {
					panelsMap[x][y] = panel;
				}
			}
		}

		const points: Array<Array<Point>> = Array(this.columns + 1).fill(null).map(() => Array(this.rows + 1).fill(null).map(() => demand<Point>({
			horizontalOffset: 0,
			verticalOffset: 0,
		})));

		for (let i = 1; i < this.columns; i++) {
			let lineStartRow: number | null = null;
			for (let i2 = 0; i2 <= this.rows; i2++) {
				const leftPanel = panelsMap[i - 1][i2];
				const rightPanel = panelsMap[i][i2];
				const interferingPanel = leftPanel && leftPanel === rightPanel;
				if(!interferingPanel && lineStartRow === null) {
					lineStartRow = i2;
				}
				if((interferingPanel || i2 >= this.rows) && lineStartRow !== null) {
					const negativeInterest = (panelsMap[i - 1][lineStartRow]?.size?.interest ?? 0) + (panelsMap[i][i2]?.size?.interest ?? 0) * 0.6;
					const positiveInterest = (panelsMap[i][lineStartRow]?.size?.interest ?? 0) + (panelsMap[i - 1][i2]?.size?.interest ?? 0) * 0.6;
					const interestDifference = positiveInterest - negativeInterest;
					const slantAmount = Math.min(interestDifference * 2, 1) * this.gaps * 0.75;

					for(let y = lineStartRow; y <= i2; y++) {
						const slantFactor = (y - lineStartRow) / (i2 - lineStartRow) - 0.5;
						points[i][y].horizontalOffset = slantAmount * slantFactor;
					}

					console.log("Line in column", i, "from row", lineStartRow, "to row", i2);
					lineStartRow = null;
				}
			}
		}

		for (let i = 1; i < this.rows; i++) {
			let lineStartColumn: number | null = null;
			for (let i2 = 0; i2 <= this.columns; i2++) {
				const topPanel = panelsMap[i2]?.[i - 1];
				const bottomPanel = panelsMap[i2]?.[i];
				const interferingPanel = topPanel && topPanel === bottomPanel;
				if(!interferingPanel && lineStartColumn === null) {
					lineStartColumn = i2;
				}
				if((interferingPanel || i2 >= this.columns) && lineStartColumn !== null) {
					const negativeInterest = (panelsMap[lineStartColumn]?.[i - 1]?.size?.interest ?? 0) + (panelsMap[i2]?.[i]?.size?.interest ?? 0) * 0.6;
					const positiveInterest = (panelsMap[lineStartColumn]?.[i]?.size?.interest ?? 0) + (panelsMap[i2]?.[i - 1]?.size?.interest ?? 0) * 0.6;
					const interestDifference = positiveInterest - negativeInterest;
					const slantAmount = Math.max(-1, Math.min(interestDifference * 2, 1)) * this.gaps * 0.75;

					for(let x = lineStartColumn; x <= i2; x++) {
						const slantFactor = (x - lineStartColumn) / (i2 - lineStartColumn) - 0.5;
						points[x][i].verticalOffset = slantAmount * slantFactor;
					}
					
					console.log("Line in row", i, "from column", lineStartColumn, "to column", i2);
					lineStartColumn = null;
				}
			}
		}

		for (const panel of this.panelLayout) {
			const topLeft = points[panel.position.startColumn][panel.position.startRow];
			const topRight = points[panel.position.endColumn][panel.position.startRow];
			const bottomLeft = points[panel.position.startColumn][panel.position.endRow];
			const bottomRight = points[panel.position.endColumn][panel.position.endRow];

			const topY = this.getRowY(panel.position.startRow);
			const bottomY = this.getRowY(panel.position.endRow);
			const leftX = this.getColumnX(panel.position.startColumn);
			const rightX = this.getColumnX(panel.position.endColumn);

			const leftNeighbour = panelsMap[panel.position.startColumn - 1]?.[panel.position.startRow];
			const rightNeighbour = panelsMap[panel.position.endColumn]?.[panel.position.startRow];
			const upNeighbour = panelsMap[panel.position.startColumn]?.[panel.position.startRow - 1];
			const downNeighbour = panelsMap[panel.position.startColumn]?.[panel.position.endRow];

			const leftMerge = !leftNeighbour || (leftNeighbour.position.startRow == panel.position.startRow && leftNeighbour.size.rows == panel.size.rows && leftNeighbour.size.columns == panel.size.columns && leftNeighbour.panel.constructor === panel.panel.constructor);
			const rightMerge = !rightNeighbour || (rightNeighbour.position.startRow == panel.position.startRow && rightNeighbour.size.rows == panel.size.rows && rightNeighbour.size.columns == panel.size.columns && rightNeighbour.panel.constructor === panel.panel.constructor);
			const upMerge = !upNeighbour || (upNeighbour.position.startColumn == panel.position.startColumn && upNeighbour.size.rows == panel.size.rows && upNeighbour.size.columns == panel.size.columns && upNeighbour.panel.constructor === panel.panel.constructor);
			const downMerge = !downNeighbour || (downNeighbour.position.startColumn == panel.position.startColumn && downNeighbour.size.rows == panel.size.rows && downNeighbour.size.columns == panel.size.columns && downNeighbour.panel.constructor === panel.panel.constructor);

			const leftOffsetMultiplier = leftMerge ? 1 : 0.5;
			const rightOffsetMultiplier = rightMerge ? 1 : 0.5;
			const upOffsetMultiplier = upMerge ? 1 : 0.5;
			const downOffsetMultiplier = downMerge ? 1 : 0.5;

			const leftSeparation = leftMerge ? 0 : this.gaps / 2;
			const rightSeparation = rightMerge ? 0 : this.gaps / 2;
			const upSeparation = upMerge ? 0 : this.gaps / 2;
			const downSeparation = downMerge ? 0 : this.gaps / 2;

			this.svg.path([
				['M', leftX + topLeft.horizontalOffset * leftOffsetMultiplier + leftSeparation, topY + topLeft.verticalOffset * upOffsetMultiplier + upSeparation],
				['L', rightX + topRight.horizontalOffset * rightOffsetMultiplier - rightSeparation, topY + topRight.verticalOffset * upOffsetMultiplier + upSeparation],
				['L', rightX + bottomRight.horizontalOffset * rightOffsetMultiplier - rightSeparation, bottomY + bottomRight.verticalOffset * downOffsetMultiplier - downSeparation],
				['L', leftX + bottomLeft.horizontalOffset * leftOffsetMultiplier + leftSeparation, bottomY + bottomLeft.verticalOffset * downOffsetMultiplier - downSeparation],
				['L', leftX + topLeft.horizontalOffset * leftOffsetMultiplier + leftSeparation, topY + topLeft.verticalOffset * upOffsetMultiplier + upSeparation],
			]).stroke({ color: '#000', width: 4, linecap: 'round', linejoin: 'round' }).fill('none').filterWith(filter);
		}
	}

	private getColumnX(column: number) {
		if(column <= 0) {
			return this.margins * 0.5;
		}

		if(column <= this.columns) {
			return this.margins + this.columnWidth * column + this.gaps * (column - 1);
		}
		
		return this.margins * 1.5 + this.columnWidth * this.columns + this.gaps * (this.columns - 1);
	}

	private getRowY(row: number) {
		if(row <= 0) {
			return this.margins * 0.5;
		}

		if(row <= this.rows) {
			return this.margins + this.rowHeight * row + this.gaps * (row - 1);
		}
		
		return this.margins * 1.5 + this.rowHeight * this.rows + this.gaps * (this.rows - 1);
	}
}
