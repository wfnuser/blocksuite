import { WithDisposable } from '@blocksuite/lit';
import { css, LitElement, nothing, svg } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { EdgelessBlockType } from '../../../../surface-block/edgeless-types.js';
import { Bound, type IVec, Vec } from '../../../../surface-block/index.js';
import type { SurfaceBlockComponent } from '../../../../surface-block/surface-block.js';
import { isNoteBlock } from '../../utils/query.js';

const EXPAND_OFFSET = 20;
const { NOTE } = EdgelessBlockType;

@customElement('edgeless-auto-connect-line')
export class EdgelessAutoConnectLine extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
    }
  `;
  @property({ attribute: false })
  surface!: SurfaceBlockComponent;

  @property({ attribute: false })
  show = false;

  protected override firstUpdated(): void {
    const { _disposables, surface } = this;
    _disposables.add(
      surface.viewport.slots.viewportUpdated.on(() => {
        this.requestUpdate();
      })
    );

    _disposables.add(
      surface.page.slots.blockUpdated.on(({ type, id }) => {
        if (type === 'update' && isNoteBlock(surface.pickById(id))) {
          this.requestUpdate();
        }
      })
    );
  }

  protected override render() {
    if (!this.show) return nothing;

    const { viewport } = this.surface;
    const notes = this.surface.getBlocks(NOTE).filter(note => !note.hidden);
    const points: [IVec, IVec][] = [];
    for (let i = 1; i < notes.length; i++) {
      const last = notes[i - 1];
      const current = notes[i];
      const lastBound = Bound.deserialize(last.xywh);
      const currentBound = Bound.deserialize(current.xywh);
      const start = viewport.toViewCoord(lastBound.center[0], lastBound.maxY);
      const end = viewport.toViewCoord(
        currentBound.center[0],
        currentBound.maxY
      );
      points.push([start, end]);
    }

    return repeat(
      points,
      (_, index) => index,
      ([start, end]) => {
        const width = Math.abs(start[0] - end[0]);
        const height = Math.abs(start[1] - end[1]);
        const style = styleMap({
          position: 'absolute',
          transform: `translate(${
            Math.min(start[0], end[0]) - EXPAND_OFFSET / 2
          }px, ${Math.min(start[1], end[1]) - EXPAND_OFFSET / 2}px)`,
        });
        const lineStart = [0, 0];
        const lineEnd = [width, height];
        if (start[0] > end[0]) {
          lineStart[0] = width;
          lineEnd[0] = 0;
        } else {
          lineStart[0] = 0;
          lineEnd[0] = width;
        }

        if (start[1] > end[1]) {
          lineStart[1] = height;
          lineEnd[1] = 0;
        } else {
          lineStart[1] = 0;
          lineEnd[1] = height;
        }

        const newWidth = width + EXPAND_OFFSET;
        const newHeight = height + EXPAND_OFFSET;

        const newStart = Vec.add(Vec.pointOffset(lineStart, lineEnd, 16), [
          EXPAND_OFFSET / 2,
          EXPAND_OFFSET / 2,
        ]);
        const newEnd = Vec.add(Vec.pointOffset(lineEnd, lineStart, 16), [
          EXPAND_OFFSET / 2,
          EXPAND_OFFSET / 2,
        ]);

        return svg`
          <svg style=${style} width="${newWidth}px" height="${newHeight}px" viewBox="0 0 ${newWidth} ${newHeight}" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <marker
                id="arrow"
                refX="10"
                refY="10"
                markerWidth="10"
                markerHeight="20"
                orient="auto"
              >
                <path d="M 2 2 L 10 10 L 2 18" fill="none" stroke="var(--affine-black-10)" stroke-linecap="round" stroke-linejoin="round" />
              </marker>
            </defs>

            <line
              x1="${newStart[0]}"
              y1="${newStart[1]}"
              x2="${newEnd[0]}"
              y2="${newEnd[1]}"
              stroke="var(--affine-black-10)"
              stroke-width="2"
              marker-end="url(#arrow)" 
            />
          </svg>
        `;
      }
    );
  }
}
