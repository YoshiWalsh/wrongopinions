import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { SeriesDirectionPanel } from 'src/app/panel-layout/panel-types/series-direction';
import { Chart, LineElement, LineController, CategoryScale, LinearScale, PointElement, Title, Legend } from 'chart.js';

Chart.register(
	LineElement,
	LineController,
	CategoryScale,
	LinearScale,
	PointElement,
	Title,
	Legend,
);

interface Substitution {
	old: string;
	new: string;
}

interface BreakStringGroup {
	substitutions: Array<Substitution>; // The strings to search for as break points. Will be searched for in order.
	priority: number; // Higher priority = more likely to be chosen as the break point. 
}

const DESIRED_TITLE_LINE_WIDTH = 18;
const BREAK_STRING_GROUPS: Array<BreakStringGroup> = [
	{
		substitutions: [
			{
				old: ' - ',
				new: ' -\n',
			},
			{
				old: ': ',
				new: ':\n',
			},
			{
				old: ' "',
				new: '\n"',
			},
			{
				old: '" ',
				new: '"\n',
			},
			{
				old: '. ',
				new: '.\n',
			},
			{
				old: ' [',
				new: '\n[',
			},
			{
				old: '] ',
				new: ']\n',
			},
		],
		priority: 12,
	},
	{
		substitutions: [
			{
				old: ' ',
				new: '\n',
			}
		],
		priority: 8,
	},
	{
		substitutions: [
			{
				old: '-',
				new: '-\n',
			},
			{
				old: ':',
				new: ':\n',
			},
			{
				old: '.',
				new: '.\n',
			}
		],
		priority: 0,
	}
]

interface PotentialSubstituion {
	startIndex: number;
	length: number;
	new: string;
}

@Component({
	selector: 'app-series-direction-correlation-panel',
	templateUrl: './series-direction-correlation.component.html',
	styleUrls: ['./series-direction-correlation.component.scss']
})
export class SeriesDirectionCorrelationComponent {
	@ViewChild("canvas")
	canvasElm!: ElementRef<HTMLCanvasElement>;

	@Input()
	panel!: SeriesDirectionPanel;

	seriesName!: string;

	constructor() {}

	ngOnInit(): void {
		this.seriesName = this.panel.getSeriesName();
	}

	private findAllOccurencesInString(string: string, substring: string): Array<number> {
		const occurrences: Array<number> = [];

		let occurrence = 0;
		while((occurrence = string.indexOf(substring, occurrence + 1)) !== -1) {
			occurrences.push(occurrence);
		}
		return occurrences;
	}

	
	private findClosestSubstitution(string: string, targetIndex: number): PotentialSubstituion | null {
		let bestSubstitution: PotentialSubstituion | null = null;
		let bestSubstitutionDistance = Infinity;

		for(const breakStringGroup of BREAK_STRING_GROUPS) {
			for(const substitution of breakStringGroup.substitutions) {
				const occurrences = this.findAllOccurencesInString(string, substitution.old);

				for(const occurrence of occurrences) {
					const centreOfOccurrence = occurrence + substitution.old.length;
					const occurrenceDistance = Math.abs(centreOfOccurrence - targetIndex) - breakStringGroup.priority;
					if(occurrenceDistance < bestSubstitutionDistance) {
						bestSubstitutionDistance = occurrenceDistance;
						bestSubstitution = {
							startIndex: occurrence,
							length: substitution.old.length,
							new: substitution.new,
						};
					}
				}
			}
		}
		return bestSubstitution;
	}

	private formatLabel(title: string): string {
		const desiredSegments = Math.floor(title.length / DESIRED_TITLE_LINE_WIDTH);
		if(desiredSegments < 2) {
			return title;
		}

		const targetIndex = title.length * (Math.floor(desiredSegments / 2) / desiredSegments);
		const substitution = this.findClosestSubstitution(title, targetIndex);

		if(!substitution) {
			return title;
		}

		const left = this.formatLabel(title.substring(0, substitution.startIndex));
		const right = this.formatLabel(title.substring(substitution.startIndex + substitution.length));
		return left + substitution.new + right;
	}

	ngAfterViewInit(): void {
		new Chart(this.canvasElm.nativeElement, {
			type: 'line',
			data: {
				labels: this.panel.seriesDirection.sequence.map(a => this.formatLabel(this.panel.abbreviateInstalmentName(this.seriesName, a.anime.defaultTitle)).split('\n')),
				datasets: [
					{
						label: 'Your scores',
						data: this.panel.seriesDirection.sequence.map(a => a.userScore),
						borderColor: 'rgba(255, 0, 0, 1)',
					},
					{
						label: 'Global scores',
						data: this.panel.seriesDirection.sequence.map(a => a.globalScore),
						borderColor: 'rgba(0, 255, 0, 1)',
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: false,
				scales: {
					x: {
						offset: true,
					},
				},
				plugins: {
					title: {
						display: false,
						fullSize: false,
						text: this.seriesName,
					},
					legend: {
						display: true,
						align: 'end',
						fullSize: false,
						labels: {
							usePointStyle: true,
							pointStyle: 'line',
							textAlign: 'center',
						}
					}
				},
			}
		});
	}

}
