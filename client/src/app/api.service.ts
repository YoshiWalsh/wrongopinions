import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Contracts } from 'wrongopinions-common';
import { environment } from '../environments/environment';
import { lastValueFrom, Observable } from 'rxjs';

export interface FullStatusWithResults extends Contracts.FullStatus {
	results: Contracts.Results | null;
}

@Injectable({
	providedIn: 'root'
})
export class ApiService {
	constructor(
		private http: HttpClient
	) { }

	private unwrapResponse<T>(request: Observable<Contracts.SuccessResponse<T>>): Promise<T> {
		return lastValueFrom(request).then(r => r.data);
	}

	async getFullStatus(username: string): Promise<FullStatusWithResults> {
		const fullStatus = await this.unwrapResponse(
			this.http.get<Contracts.SuccessResponse<Contracts.FullStatus>>(
				`${environment.apiUrl}/opinions/${encodeURIComponent(username)}`
			)
		);
		const results = await this.getResults(fullStatus);
		return {
			...fullStatus,
			results,
		};
	}

	private async getResults(fullStatus: Contracts.FullStatus): Promise<Contracts.Results | null> {
		if(!fullStatus.resultsUrl) {
			return null;
		}
		const response = await fetch(fullStatus.resultsUrl);
		const object = await response.json();
		return object;
	}

	getPendingJobStatus(username: string): Promise<Contracts.PendingJobStatus> {
		return this.unwrapResponse(
			this.http.get<Contracts.SuccessResponse<Contracts.PendingJobStatus>>(
				`${environment.apiUrl}/opinions/${encodeURIComponent(username)}/pending`
			)
		);
	}

	startJob(username: string): Promise<Contracts.PendingJobStatus> {
		return this.unwrapResponse(
			this.http.post<Contracts.SuccessResponse<Contracts.PendingJobStatus>>(
				`${environment.apiUrl}/opinions/${encodeURIComponent(username)}`,
				''
			)
		);
	}
}
