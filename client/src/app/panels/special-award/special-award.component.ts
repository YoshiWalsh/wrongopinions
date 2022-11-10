import { Component, Input } from '@angular/core';
import { AwardProperties, SpecialAwardPanel } from 'src/app/panel-layout/panel-types/special-award';
import { Anime } from 'wrongopinions-common/dist/contracts';

@Component({
	selector: 'app-special-award-panel',
	templateUrl: './special-award.component.html',
	styleUrls: ['./special-award.component.scss']
})
export class SpecialAwardComponent {
	@Input()
	panel!: SpecialAwardPanel;

	properties!: AwardProperties;
	contributingAnime!: Array<Anime>;

	constructor() {
	}

	ngOnInit(): void {
		this.properties = this.panel.getAwardProperties();
		this.contributingAnime = this.panel.award.contributingAnime.filter(a => a.thumbnailUrl).slice(0, 6);
	}
}
