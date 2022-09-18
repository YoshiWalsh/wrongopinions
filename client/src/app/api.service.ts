import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Contracts } from 'wrongopinions-common';
import { environment } from '../environments/environment';
import { lastValueFrom, Observable } from 'rxjs';

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

	getFullStatus(username: string): Promise<Contracts.FullStatus> {
		return this.unwrapResponse(
			this.http.get<Contracts.SuccessResponse<Contracts.FullStatus>>(
				`${environment.apiUrl}/opinions/${encodeURIComponent(username)}`
			)
		);
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
