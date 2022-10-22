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
			}

			if(!status.results && !status.pending) {
				this.startJob();
			}
		});
	}

	private startJob() {
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
		}).catch(ex => {
			if(this.username != username) {
				return;
			}

			this.pendingJob = null;

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
}
