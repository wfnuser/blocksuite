/* eslint-disable lit/binding-positions, lit/no-invalid-html */
import './note/edgeless-note.js';
import './image/edgeless-image.js';
import './frame/edgeless-frame.js';
import '../rects/edgeless-selected-rect.js';
import '../rects/edgeless-hover-rect.js';
import '../rects/edgeless-dragging-area-rect.js';
import '../note-status/index.js';
import '../../components/auto-connect/edgeless-index-label.js';
import '../../components/auto-connect/edgeless-auto-connect-line.js';

import { assertExists, throttle } from '@blocksuite/global/utils';
import { ShadowlessElement, WithDisposable } from '@blocksuite/lit';
import { nothing } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { html, literal, unsafeStatic } from 'lit/static-html.js';

import {
  EDGELESS_BLOCK_CHILD_BORDER_WIDTH,
  EDGELESS_BLOCK_CHILD_PADDING,
} from '../../../../_common/consts.js';
import { delayCallback } from '../../../../_common/utils/event.js';
import type { TopLevelBlockModel } from '../../../../_common/utils/types.js';
import { EdgelessBlockType } from '../../../../surface-block/edgeless-types.js';
import { almostEqual, Bound } from '../../../../surface-block/index.js';
import type { EdgelessPageBlockComponent } from '../../edgeless-page-block.js';
import { NoteResizeObserver } from '../../utils/note-resize-observer.js';
import { getBackgroundGrid, isNoteBlock } from '../../utils/query.js';

const { NOTE, IMAGE, FRAME } = EdgelessBlockType;

const portalMap = {
  [FRAME]: 'edgeless-block-portal-frame',
  [NOTE]: 'edgeless-block-portal-note',
  [IMAGE]: 'edgeless-block-portal-image',
};

@customElement('edgeless-block-portal-container')
export class EdgelessBlockPortalContainer extends WithDisposable(
  ShadowlessElement
) {
  @property({ attribute: false })
  edgeless!: EdgelessPageBlockComponent;

  @query('.affine-block-children-container.edgeless')
  container!: HTMLDivElement;

  @query('.affine-edgeless-layer')
  layer!: HTMLDivElement;

  @state()
  private _showAutoConnect = false;

  private _cancelRestoreWillchange: (() => void) | null = null;

  private _noteResizeObserver = new NoteResizeObserver();

  private _initNoteHeightUpdate() {
    const { page } = this.edgeless;
    assertExists(page.root);

    const resetNoteResizeObserver = throttle(
      () => {
        requestAnimationFrame(() => {
          this._noteResizeObserver.resetListener(page);
        });
      },
      16,
      { leading: true }
    );

    this._disposables.add(
      page.root.childrenUpdated.on(resetNoteResizeObserver)
    );
  }

  aboutToChangeViewport() {
    if (this._cancelRestoreWillchange) this._cancelRestoreWillchange();
    if (!this.layer.style.willChange)
      this.layer.style.setProperty('will-change', 'transform');

    this._cancelRestoreWillchange = delayCallback(() => {
      this.layer.style.removeProperty('will-change');
      this._cancelRestoreWillchange = null;
    }, 150);
  }

  refreshLayerViewport = () => {
    if (!this.isConnected || !this.edgeless || !this.edgeless.surface) return;

    const { surface } = this.edgeless;
    const { zoom, translateX, translateY } = surface.viewport;
    const { gap } = getBackgroundGrid(zoom, true);

    this.container.style.setProperty(
      'background-position',
      `${translateX}px ${translateY}px`
    );
    this.container.style.setProperty('background-size', `${gap}px ${gap}px`);
    this.layer.style.setProperty(
      'transform',
      `translate(${translateX}px, ${translateY}px) scale(${zoom})`
    );
  };

  override firstUpdated() {
    const { _disposables, edgeless } = this;
    const { page } = edgeless;

    this._initNoteHeightUpdate();

    requestAnimationFrame(() => {
      this._noteResizeObserver.resetListener(page);
    });

    _disposables.add(this._noteResizeObserver);

    _disposables.add(
      this._noteResizeObserver.slots.resize.on(resizedNotes => {
        resizedNotes.forEach(([domRect, prevDomRect], id) => {
          if (page.readonly) return;
          const model = page.getBlockById(id) as TopLevelBlockModel;
          const { xywh } = model;
          const { x, y, w, h } = Bound.deserialize(xywh);

          // ResizeObserver is not effected by CSS transform, so don't deal with viewport zoom.
          const newModelHeight =
            domRect.height +
            EDGELESS_BLOCK_CHILD_PADDING * 2 +
            EDGELESS_BLOCK_CHILD_BORDER_WIDTH * 2;

          if (!almostEqual(newModelHeight, h)) {
            const updateBlock = () => {
              page.updateBlock(model, {
                xywh: JSON.stringify([x, y, w, Math.round(newModelHeight)]),
              });
            };

            // Assume it's user-triggered resizing if both width and height change,
            // otherwise we don't add the size updating into history.
            // See https://github.com/toeverything/blocksuite/issues/3671
            const isResize =
              prevDomRect && !almostEqual(domRect.width, prevDomRect.width);
            if (isResize) {
              updateBlock();
            } else {
              page.withoutTransact(updateBlock);
            }
          }
        });

        edgeless.slots.selectedRectUpdated.emit({ type: 'resize' });
      })
    );

    let rAqId: number | null = null;
    _disposables.add(
      edgeless.slots.viewportUpdated.on(() => {
        this.aboutToChangeViewport();

        if (rAqId) return;

        rAqId = requestAnimationFrame(() => {
          this.refreshLayerViewport();
          rAqId = null;
        });
      })
    );

    _disposables.add(
      page.slots.historyUpdated.on(() => {
        this.requestUpdate();
      })
    );

    _disposables.add(
      edgeless.slots.readonlyUpdated.on(() => {
        this.requestUpdate();
      })
    );

    _disposables.add(
      edgeless.surface.model.childrenUpdated.on(() => {
        this.requestUpdate();
      })
    );

    _disposables.add(
      edgeless.selectionManager.slots.updated.on(() => {
        const { elements } = edgeless.selectionManager;
        if (
          !edgeless.selectionManager.editing &&
          elements.length === 1 &&
          isNoteBlock(elements[0])
        ) {
          this._showAutoConnect = true;
        } else {
          this._showAutoConnect = false;
        }
      })
    );
  }

  override render() {
    const { edgeless } = this;

    const { surface } = edgeless;
    if (!surface) return nothing;
    const notes = surface.getBlocks(NOTE);
    const images = surface.getBlocks(IMAGE);
    const blocks = [...notes, ...images].sort(surface.compare);

    const { readonly } = this.edgeless.page;
    const showedNotes = surface.getBlocks(NOTE).filter(note => !note.hidden);
    return html`
      <div class="affine-block-children-container edgeless">
        <edgeless-auto-connect-line
          .surface=${surface}
          .show=${this._showAutoConnect}
        >
        </edgeless-auto-connect-line>
        <div class="affine-edgeless-layer">
          <edgeless-frames-container .surface=${surface}>
          </edgeless-frames-container>
          ${readonly
            ? nothing
            : html`<affine-note-slicer
                .edgelessPage=${edgeless}
              ></affine-note-slicer>`}
          ${repeat(
            blocks,
            block => block.id,
            (block, index) => {
              const tag = literal`${unsafeStatic(
                portalMap[block.flavour as EdgelessBlockType]
              )}`;
              return html`<${tag}
                    .index=${index}
                    .model=${block}
                    .surface=${surface}
                  ></${tag}>`;
            }
          )}
        </div>
      </div>
      <edgeless-hover-rect .edgeless=${edgeless}></edgeless-hover-rect>
      <edgeless-dragging-area-rect
        .edgeless=${edgeless}
      ></edgeless-dragging-area-rect>
      <edgeless-selected-rect .edgeless=${edgeless}></edgeless-selected-rect>
      <edgeless-index-label
        .notes=${showedNotes}
        .surface=${surface}
        .show=${this._showAutoConnect}
      ></edgeless-index-label>
      <!-- <edgeless-note-status .edgeless=${edgeless}></edgeless-note-status> -->
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-block-portal-container': EdgelessBlockPortalContainer;
  }
}
