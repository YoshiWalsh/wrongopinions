import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';

import domtoimage from 'dom-to-image-more';

@Component({
	selector: 'app-dom-image',
	templateUrl: './dom-image.component.html',
	styleUrls: ['./dom-image.component.scss']
})
export class DomImageComponent implements OnInit {

	@ViewChild("canvas")
	canvasElm!: ElementRef<HTMLDivElement>;

	constructor() { }

	ngOnInit(): void {
	}

	public async renderImage(): Promise<string> {
		await delay(0);

		const bounding = this.canvasElm.nativeElement.getBoundingClientRect();

		try {
			const discard = await domtoimage.toPng(this.canvasElm.nativeElement as Element, {
				quality: 100,
				width: bounding.width,
				height: bounding.height,
			});
			// We render the image twice in order to work around a bug in Firefox. (webcompat/web-bugs#119834)
			// The second render seems to be quick anyway, so this is a small price to pay.
			const png = await domtoimage.toPng(this.canvasElm.nativeElement as Element, {
				quality: 100,
				width: bounding.width,
				height: bounding.height,
			});
			return png;
		} catch (ex) {
			console.error(ex);
			throw ex;
		}
	}
}

function delay(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
}