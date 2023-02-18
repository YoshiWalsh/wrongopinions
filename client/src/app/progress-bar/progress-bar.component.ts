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
	intervals?: Array<number>;

	@Input()
	progress!: number;

	Infinity = Infinity;

	segments?: Array<Segment> = [];

	constructor() { }

	ngOnInit(): void {
	}

	ngOnChanges(changes: SimpleChanges): void {
		const intervals = this.intervals;
		if(intervals !== undefined) {
			this.segments = intervals.slice(1).map((end, index) => ({
				start: intervals[index],
				end,
			}));
		} else {
			this.segments = undefined;
		}
	}

	public clamp(x: number, min: number, max: number) {
		return Math.min(max, Math.max(min, x));
	}

	trackByIndex = (index: number): number => {
		return index;
	};

	public get start(): number {
		return this.intervals?.[0] ?? 0;
	}

	public get end(): number {
		return this.intervals?.[this.intervals.length - 1] ?? 1;
	}

}
