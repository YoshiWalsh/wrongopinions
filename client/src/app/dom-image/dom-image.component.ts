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

  png?: string;

  private observer!: MutationObserver;

  constructor() { }

  ngOnInit(): void {
  }

  ngAfterViewInit() {
    this.observer = new MutationObserver(mutations => {
      this.renderImage();
    });

    this.observer.observe(this.canvasElm.nativeElement, { attributes: true, childList: true, characterData: true });

    this.renderImage();
  }

  private renderImage() {
    const bounding = this.canvasElm.nativeElement.getBoundingClientRect();
    domtoimage.toPng(this.canvasElm.nativeElement as Element, {
      quality: 100,
      width: bounding.width,
      height: bounding.height,
    }).then((res) => {
      this.png = res;
    });
  }

  ngOnDestroy() {
    this.observer.disconnect();
  }
}
