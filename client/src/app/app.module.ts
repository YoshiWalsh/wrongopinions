import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { DomImageComponent } from './dom-image/dom-image.component';
import { HomeComponent } from './home/home.component';
import { OpinionsComponent } from './opinions/opinions.component';

@NgModule({
	declarations: [
		AppComponent,
		DomImageComponent,
		HomeComponent,
		OpinionsComponent,
	],
	imports: [
		BrowserModule,
		AppRoutingModule,
		FormsModule,
		HttpClientModule,
	],
	providers: [],
	bootstrap: [AppComponent]
})
export class AppModule { }
