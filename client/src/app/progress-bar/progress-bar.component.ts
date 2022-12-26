import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { Contracts } from 'wrongopinions-common';

export interface Segment {
	start: number;
	end: number;
}

@Component({
	selector: 'app-progress-bar',
	templateUrl: './progress-bar.component.html',
	styleUrls: ['./progress-bar.component.scss']
})
export class ProgressBarComponent implements OnInit, OnChanges {
	@Input()
	intervals!: Array<number>;

	@Input()
	progress!: number;

	segments: Array<Segment> = [];

	constructor() { }

	ngOnInit(): void {
	}

	ngOnChanges(changes: SimpleChanges): void {
		this.segments = this.intervals.slice(1).map((end, index) => ({
			start: this.intervals[index],
			end,
		}));
	}

	public clamp(x: number, min: number, max: number) {
		return Math.min(max, Math.max(min, x));
	}

	trackByIndex = (index: number): number => {
		return index;
	};

}
