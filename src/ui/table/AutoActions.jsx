import { ViewComponent } from "../shared/component.js";
import { Icon } from "../shared/Icon.jsx";

export class AutoActions extends ViewComponent {
  state = {
    actions: { autoWin: false, passClaims: false, autoTsumogiri: false },
  };
  render() {
    return (
      <nav
        ref={this.bind}
        id="auto-action-controls"
        class="auto-action-controls"
        aria-label="自动操作"
      >
        <button
          id="replay-hand-visibility-button"
          class="auto-action-control replay-hand-visibility-control"
          type="button"
          aria-pressed="false"
          aria-label="显示其他玩家手牌"
          title="显示其他玩家手牌"
          hidden
        >
          <Icon name="eye" />
          <Icon name="eye-off" hidden />
        </button>
        <button
          id="auto-win-button"
          class="auto-action-control"
          type="button"
          aria-pressed={String(this.state.actions.autoWin)}
          aria-label="自动胡牌"
          title={`自动胡牌（${this.state.actions.autoWin ? "开启" : "关闭"}）`}
        >
          <svg
            class="auto-action-icon"
            data-icon="trophy-solid"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              stroke="none"
              d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"
            ></path>
            <path
              fill="currentColor"
              stroke="none"
              d="M5.35 4.5H3.25A1.75 1.75 0 0 0 1.5 6.25V7.5A2.5 2.5 0 0 0 4 10h1.35V8.5H4A1 1 0 0 1 3 7.5V6.25A.25.25 0 0 1 3.25 6h2.1Z\n                 M18.65 4.5h2.1A1.75 1.75 0 0 1 22.5 6.25V7.5A2.5 2.5 0 0 1 20 10h-1.35V8.5H20a1 1 0 0 0 1-1V6.25a.25.25 0 0 0-.25-.25h-2.1Z"
            ></path>
            <path
              fill="currentColor"
              stroke="none"
              d="M9.25 15.2h1.5v2.05l-2.2 3.35h-1.6l2.3-3.5Zm5.5 0h-1.5v2.05l2.2 3.35h1.6l-2.3-3.5ZM5 20.6h14v1.8H5Z"
            ></path>
          </svg>
        </button>
        <button
          id="pass-claims-button"
          class="auto-action-control"
          type="button"
          aria-pressed={String(this.state.actions.passClaims)}
          aria-label="放弃鸣牌"
          title={`放弃鸣牌（${this.state.actions.passClaims ? "开启" : "关闭"}）`}
        >
          <svg
            class="auto-action-icon"
            data-icon="bell-off"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <defs>
              <mask id="pass-claims-bell-mask">
                <rect width="24" height="24" fill="white"></rect>
                <path
                  d="M4.8 4.8 19.2 19.2"
                  stroke="black"
                  stroke-width="3"
                  stroke-linecap="round"
                ></path>
              </mask>
            </defs>
            <path
              mask="url(#pass-claims-bell-mask)"
              d="M18 16.25v-5.5c0-3.03-1.75-5.57-4.75-6.25v-.75a1.25 1.25 0 0 0-2.5 0v.75C7.75 5.18 6 7.72 6 10.75v5.5l-2 2V20h16v-1.75l-2-2Zm-6 7.25c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2Z"
            ></path>
          </svg>
        </button>
        <button
          id="auto-tsumogiri-button"
          class="auto-action-control"
          type="button"
          aria-pressed={String(this.state.actions.autoTsumogiri)}
          aria-label="自动摸切"
          title={`自动摸切（${this.state.actions.autoTsumogiri ? "开启" : "关闭"}）`}
        >
          <svg class="auto-action-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="3" width="7.5" height="10" rx="1.4"></rect>
            <path d="m11.25 8.4 4.5 4.5v-2.15a1 1 0 1 1 2 0v4.55a1 1 0 0 1-1 1h-4.55a1 1 0 1 1 0-2h2.15l-4.5-4.5a1 1 0 0 1 1.4-1.4Z"></path>
            <rect x="3" y="17" width="5" height="4" rx=".8"></rect>
            <rect x="9.5" y="17" width="5" height="4" rx=".8"></rect>
            <rect x="16" y="17" width="5" height="4" rx=".8"></rect>
          </svg>
        </button>
      </nav>
    );
  }
}
