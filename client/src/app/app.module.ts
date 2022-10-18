import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { DomImageComponent } from './dom-image/dom-image.component';
import { HomeComponent } from './home/home.component';
import { OpinionsComponent } from './opinions/opinions.component';
import { PanelLayoutComponent } from './panel-layout/panel-layout.component';
import { UnpopularScoreComponent } from './panels/unpopular-score/unpopular-score.component';

@NgModule({
	declarations: [
		AppComponent,
		DomImageComponent,
		HomeComponent,
		OpinionsComponent,
		PanelLayoutComponent,
		UnpopularScoreComponent,
	],
	imports: [
		CommonModule,
		BrowserModule,
		AppRoutingModule,
		FormsModule,
		HttpClientModule,
	],
	providers: [],
	bootstrap: [AppComponent]
})
export class AppModule { }
