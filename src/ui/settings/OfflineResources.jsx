import { ViewComponent } from "../shared/component.js";
import { Icon } from "../shared/Icon.jsx";

export class OfflineResources extends ViewComponent {
  state = { status: "idle", checking: true, animate: false, feedback: "" };
  render() {
    const { status, checking, animate, feedback } = this.state;
    const { policy, onPolicy, onAction } = this.props;
    const downloading = status === "downloading",
      complete = status === "complete";
    const icon = downloading
      ? "loader-circle"
      : complete
        ? "trash-2"
        : "download";
    const label = downloading ? "下载中" : complete ? "删除" : "下载";
    const action = downloading
      ? "取消下载"
      : complete
        ? "删除离线资源"
        : "下载离线资源";
    return (
      <div ref={this.bind} id="offline-resources">
        <h2 class="settings-general-heading">资源管理</h2>
        <ul
          class="settings-list-card settings-general-list settings-offline-list"
          aria-label="离线资源设置"
        >
          <li class="settings-general-list-item">
            <button
              id="mahjong-offline-action-button"
              class={`settings-list-item-button settings-offline-action${downloading ? " is-downloading" : ""}`}
              type="button"
              disabled={checking}
              aria-label={action}
              title={action}
              onClick={onAction}
            >
              <span class="settings-general-list-label">离线资源包</span>
              <span class="settings-list-trailing settings-offline-action-content">
                <span>{label}</span>
                <Icon name={icon} />
              </span>
            </button>
          </li>
          <li
            id="mahjong-offline-policy-row"
            class={`settings-general-list-item settings-offline-policy${animate ? " is-animated" : ""}${complete ? " is-expanded" : ""}`}
            inert={!complete}
            aria-hidden={String(!complete)}
          >
            <div class="settings-offline-policy-content">
              <hr />
              <label
                class="settings-list-item-button"
                htmlFor="mahjong-offline-policy-setting"
              >
                <span class="settings-general-list-label">资源策略</span>
                <span class="settings-list-trailing settings-general-select">
                  <select
                    id="mahjong-offline-policy-setting"
                    aria-label="资源策略"
                    disabled={!complete}
                    value={policy}
                    onChange={onPolicy}
                  >
                    <option value="network-first">网络优先</option>
                    <option value="local-first">本地优先（手动更新）</option>
                  </select>
                  <Icon
                    class="settings-general-select-icon"
                    name="chevrons-up-down"
                  />
                </span>
              </label>
            </div>
          </li>
        </ul>
        <p
          id="mahjong-offline-feedback"
          class="settings-offline-feedback"
          role="status"
          aria-live="polite"
        >
          {feedback}
        </p>
      </div>
    );
  }
}
