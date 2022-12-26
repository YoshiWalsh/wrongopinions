import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Contracts } from 'wrongopinions-common';
import { PendingJobStatus } from 'wrongopinions-common/dist/contracts';
import { ApiService } from '../api.service';
import { AnimeListPanel } from '../panel-layout/panel-types/anime-list';
import { Panel } from '../panel-layout/panel-types/panel-type';
import { ScoreDifferencePanel } from '../panel-layout/panel-types/score-difference';
import { SeriesDirectionPanel } from '../panel-layout/panel-types/series-direction';
import { SpecialAwardPanel } from '../panel-layout/panel-types/special-award';
import { UnpopularScorePanel } from '../panel-layout/panel-types/unpopular-score';

export interface RankProperties {
    icon: string;
}

const bakaRanks: {[name: string]: RankProperties} = {
	"NPC": {
		icon: '/assets/rank-icons/aho.svg',
	},
	"Normie": {
		icon: '/assets/rank-icons/nendou.svg',
	},
	"Opinionated": {
		icon: '/assets/rank-icons/peace.svg',
	},
	"Contrarian": {
		icon: '/assets/rank-icons/chuuni.svg',
	},
	"Troll": {
		icon: '/assets/rank-icons/teehee.svg',
	},
	"IT'S OVER 9000!!!": {
		icon: '/assets/rank-icons/9000.svg',
	},
	"Cheater": {
		icon: '/assets/rank-icons/none.svg',
	},
};

@Component({
	selector: 'app-opinions',
	templateUrl: './opinions.component.html',
	styleUrls: ['./opinions.component.scss']
})
export class OpinionsComponent implements OnInit {

	username: string | null = null;

	loading: boolean = true;

	results: Contracts.Results | null = null;
	pendingJob: Contracts.PendingJobStatus | null = null;

	loadingIntervals: Array<number> = [];
	loadingProgress: number = 0;
	loadingMaximumProgress: number = 0;
	statusDescription: string = "";

	panels: Array<Panel> = [];

	constructor(
		private route: ActivatedRoute,
		private api: ApiService,
	) {}

	ngOnInit(): void {
		this.route.paramMap.subscribe(params => {
			this.username = params.get('username');

			this.initialiseOpinions();
		});
	}

	private initialiseOpinions() {
		if(!this.username) {
			return;
		}
		this.loading = true;

		const username = this.username;

		this.api.getFullStatus(username).then(status => {
			if(this.username != username) {
				return;
			}
			
			this.loading = false;

			if(status.results) {
				this.results = status.results;
				this.setUpPanels();
			}
			if(status.pending) {
				this.pendingJob = status.pending;
				this.processPendingStatus(this.username, Promise.resolve(this.pendingJob));
			}
			this.statusDescription = this.getStatusDescription();

			if(!status.results && !status.pending) {
				this.startJob();
			}
		});
	}

	public startJob() {
		if(!this.username) {
			return;
		}

		this.processPendingStatus(this.username, this.api.startJob(this.username));
	}

	private processPendingStatus(username: string, promise: Promise<PendingJobStatus>) {
		promise.then(status => {
			if(this.username != username) {
				return;
			}

			this.pendingJob = status;

			if(!status) {
				throw new Error("Not pending");
			}

			this.loadingIntervals = [
				status.created,
				status.initialised,
				status.queued,
				status.processingStarted,
				status.completed
			].map(s => (new Date(s)).getTime() / 1000);

			this.loadingProgress = (new Date(status.now)).getTime() / 1000;
			this.loadingMaximumProgress = this.loadingIntervals.find(i => i > this.loadingProgress) || this.loadingProgress;
			this.statusDescription = this.getStatusDescription();

			if(!status.failed) {
				const expectedTimeUntilStateChange = this.loadingMaximumProgress - this.loadingProgress;
				const minimumRefreshInterval = 1;
				const maximumRefreshInterval = 10;
				const timeUntilRefresh = Math.min(maximumRefreshInterval, Math.max(minimumRefreshInterval, expectedTimeUntilStateChange / 5));
				setTimeout(() => {
					this.processPendingStatus(username, this.api.getPendingJobStatus(username));
				}, timeUntilRefresh * 1000);
			}
		}).catch(ex => {
			if(this.username != username) {
				return;
			}

			this.pendingJob = null;
			this.statusDescription = this.getStatusDescription();

			this.api.getFullStatus(username).then(fullStatus => {
				this.results = fullStatus.results;
				this.setUpPanels();
			});
		});
	}

	private setUpPanels() {
		if(!this.results) {
			this.panels = [];
			return;
		}

		const animeListPanels = [
			new ScoreDifferencePanel(this.results.mostOverratedShows),
			new ScoreDifferencePanel(this.results.mostUnderratedShows),
			new UnpopularScorePanel(this.results.leastPopularScores),
		];
		AnimeListPanel.tournamentArc(animeListPanels);

		this.panels = [
			...animeListPanels,
			...this.results.specialAwards.map(a => new SpecialAwardPanel(a)),
			...this.results.seriesDirectionCorrelations.map(sd => new SeriesDirectionPanel(sd)),
		];
	}
	
	getBakaIcon() {
		return bakaRanks[this.results?.bakaRank?.name as string].icon;
	}

	getStatusDescription(): string {
		if(!this.pendingJob) {
			if(this.results) {
				return `Current as of ${(new Date(this.results.requested)).toLocaleString()}`;
			}
			return "";
		}

		if(this.pendingJob.failed) {
			return "Failed, please try again.";
		}

		if(this.pendingJob.now < this.pendingJob.initialised) {
			return "Initialising...";
		}

		if(this.pendingJob.now < this.pendingJob.queued) {
			return `Loading required anime... (${this.pendingJob.totalAnime - this.pendingJob.remainingAnime} / ${this.pendingJob.totalAnime})` +
			(
				this.pendingJob.now < this.pendingJob.queued ?
				` Your last required anime is #${this.pendingJob.animeQueuePosition} in the queue.` :
				''
			);
		}

		if(this.pendingJob.now < this.pendingJob.processingStarted) {
			return `All required anime loaded, queued for processing. Your job is #${this.pendingJob.jobQueuePosition} in the queue.`;
		}

		if(this.pendingJob.now < this.pendingJob.completed) {
			return "Crunching the numbers...";
		}
		
		return "Unknown";
	}
}
