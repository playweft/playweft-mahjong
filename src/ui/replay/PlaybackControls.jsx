import { ViewComponent } from "../shared/component.js";
import { Icon } from "../shared/Icon.jsx";

export class PlaybackControls extends ViewComponent {
  state = {};
  render() {
    return (
      <section
        ref={this.bind}
        id="paipu-playback-controls"
        class="paipu-playback-controls"
        aria-label="牌谱回放控制"
        hidden
      >
        <div class="paipu-playback-card">
          <div class="paipu-playback-toolbar">
            <button
              id="paipu-replay-previous-hand"
              type="button"
              aria-label="上一局"
              title="上一局"
            >
              <Icon name="skip-back" />
            </button>
            <span
              id="paipu-replay-status"
              class="paipu-playback-round"
              role="status"
              aria-live="polite"
            ></span>
            <button
              id="paipu-replay-next-hand"
              type="button"
              aria-label="下一局"
              title="下一局"
            >
              <Icon name="skip-forward" />
            </button>
            <button
              id="paipu-replay-toggle"
              class="paipu-playback-toggle"
              type="button"
              aria-label="播放"
              title="播放"
            >
              <Icon name="play" />
              <Icon name="pause" hidden />
            </button>
            <button
              id="paipu-replay-step-back"
              type="button"
              aria-label="上一手"
              title="上一手"
            >
              <Icon name="chevron-left" />
            </button>
            <span
              id="paipu-replay-step-status"
              class="paipu-playback-step"
              role="status"
              aria-live="polite"
            ></span>
            <button
              id="paipu-replay-step-forward"
              type="button"
              aria-label="下一手"
              title="下一手"
            >
              <Icon name="chevron-right" />
            </button>
            <button
              id="paipu-replay-speed"
              class="paipu-playback-speed"
              type="button"
              aria-label="回放速度"
            >
              1×
            </button>
          </div>
          <input
            id="paipu-replay-progress"
            class="paipu-playback-progress"
            type="range"
            min="0"
            max="0"
            value="0"
            step="1"
            aria-label="回放进度"
          />
        </div>
      </section>
    );
  }
}
