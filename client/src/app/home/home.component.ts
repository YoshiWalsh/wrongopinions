import { Component, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';

@Component({
	selector: 'app-home',
	templateUrl: './home.component.html',
	styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

	username: string = "";

	constructor(private router: Router, title: Title) {
		title.setTitle("WrongOpinions.moe");
	}

	ngOnInit(): void {
	}

	go(): void {
		this.router.navigate(['opinions', this.username]);
	}

}
