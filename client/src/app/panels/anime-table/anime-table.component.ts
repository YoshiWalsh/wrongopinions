import { Injectable, Input, OnInit } from '@angular/core';
import { AnimeListPanel, ValuedAnime } from 'src/app/panel-layout/panel-types/anime-list';
import { PossibleSize } from 'src/app/panel-layout/panel-types/panel-type';
import { chunkArray } from 'src/app/utils';

@Injectable()
export abstract class AnimeTableComponent<T extends AnimeListPanel> implements OnInit {

	@Input()
	panel!: T;

	@Input()
	size!: PossibleSize;

	animeByColumns!: Array<Array<ValuedAnime>>;

	constructor() { }

	ngOnInit(): void {
		const animeCount = this.panel.getAnimeCountForSize(this.size);
		const animePerColumn = Math.ceil(animeCount / this.size.columns);
		this.animeByColumns = chunkArray(this.panel.valuedAnime.slice(0, animeCount), animePerColumn);
	}

}
