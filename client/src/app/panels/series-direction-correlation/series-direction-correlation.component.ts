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

	ngAfterViewInit(): void {
		new Chart(this.canvasElm.nativeElement, {
			type: 'line',
			data: {
				labels: this.panel.seriesDirection.sequence.map(a => this.panel.abbreviateInstalmentName(this.seriesName, a.anime.defaultTitle)),
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
						}
					}
				},
			}
		});
	}

}
