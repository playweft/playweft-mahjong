import { ViewComponent } from "../shared/component.js";
import { Icon } from "../shared/Icon.jsx";

export class TableControls extends ViewComponent {
  state = { settingsOpen: false };
  render() {
    return (
      <nav
        ref={this.bind}
        class="table-controls"
        aria-label="牌桌导航"
        id="table-controls"
      >
        <span id="connection-status" class="table-connection-status" hidden>
          <span id="connection-latency" class="table-connection-latency"></span>
          <Icon
            name="signal-high"
            class="table-connection-icon"
            data-connection-level="strong"
          />
          <Icon
            name="signal-medium"
            class="table-connection-icon"
            hidden
            data-connection-level="medium"
          />
          <Icon
            name="signal-low"
            class="table-connection-icon"
            hidden
            data-connection-level="weak"
          />
        </span>
        <button
          id="settings-button"
          class="table-control table-control-settings"
          type="button"
          aria-label="打开设置"
          aria-haspopup="dialog"
          aria-expanded={String(this.state.settingsOpen)}
          onClick={this.state.onSettings}
        >
          <Icon name="cog" />
        </button>
      </nav>
    );
  }
}
