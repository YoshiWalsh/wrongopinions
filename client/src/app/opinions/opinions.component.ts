import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Contracts } from 'wrongopinions-common';
import { PendingJobStatus } from 'wrongopinions-common/dist/contracts';
import { ApiService } from '../api.service';

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
			});
		});
	}
}
