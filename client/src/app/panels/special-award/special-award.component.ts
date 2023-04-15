import { Component, Input } from '@angular/core';
import { AwardProperties, SpecialAwardPanel } from 'src/app/panel-layout/panel-types/special-award';
import { PossibleSize } from 'src/app/panel-layout/panel-types/panel-type';
import { Anime } from 'wrongopinions-common/dist/contracts';

@Component({
	selector: 'app-special-award-panel',
	templateUrl: './special-award.component.html',
	styleUrls: ['./special-award.component.scss']
})
export class SpecialAwardComponent {
	@Input()
	panel!: SpecialAwardPanel;

	@Input()
	size!: PossibleSize;

	properties!: AwardProperties;
	contributingAnime!: Array<Anime>;

	constructor() {
	}

	ngOnInit(): void {
		this.properties = this.panel.getAwardProperties();
		
		switch(this.size.columns) {
			case 1:
			default:
				this.contributingAnime = this.panel.award.contributingAnime.filter(a => a.thumbnailUrl).slice(0, 6);
				break;
			case 2:
				this.contributingAnime = this.panel.award.contributingAnime.filter(a => a.thumbnailUrl).slice(0, 14);
				break;
		}
	}
}
