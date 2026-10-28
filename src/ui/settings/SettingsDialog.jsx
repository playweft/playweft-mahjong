import { OfflineResources } from "./OfflineResources.jsx";
import { ViewComponent } from "../shared/component.js";
import { Icon } from "../shared/Icon.jsx";

export class SettingsDialog extends ViewComponent {
  state = {
    visible: false,
    open: false,
    tab: "operation",
    copyright: "",
    soloActive: false,
    endLabel: "结束本局",
    values: {
      gameHints: true,
      autoWin: false,
      tsumogiri: false,
      pass: false,
      master: 100,
      music: 32,
      voice: 100,
      discard: 100,
      avatar: "auto",
      offline: "network-first",
    },
  };
  render() {
    const {
      visible,
      open,
      tab,
      soloActive,
      endLabel,
      values,
      onClose,
      onTab,
      onTabKeyDown,
      onValue,
      onEndMatch,
      onOfflineAction,
    } = this.state;
    const volumeLabel = (value) => (Number(value) === 0 ? "静音" : `${value}%`);
    return (
      <section
        ref={this.bind}
        id="settings-dialog"
        class={`settings-dialog${open ? " is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="牌桌设置"
        hidden={!visible}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose?.();
        }}
      >
        <div class="settings-dialog-card" tabIndex="-1">
          <header class="settings-dialog-header">
            <button
              id="settings-close-button"
              class="settings-dialog-close"
              type="button"
              aria-label="关闭设置"
              onClick={onClose}
            >
              <Icon name="x" />
            </button>
            <div class="settings-tabs" role="tablist" aria-label="设置内容">
              <button
                id="settings-operation-tab"
                type="button"
                role="tab"
                aria-selected={String(tab === "operation")}
                aria-controls="settings-operation-panel"
                data-settings-tab="operation"
                tabIndex={tab === "operation" ? 0 : -1}
                onClick={() => onTab?.("operation")}
                onKeyDown={onTabKeyDown}
              >
                操作
              </button>
              <button
                id="settings-offline-tab"
                type="button"
                role="tab"
                aria-selected={String(tab === "offline")}
                aria-controls="settings-offline-panel"
                data-settings-tab="offline"
                tabIndex={tab === "offline" ? 0 : -1}
                onClick={() => onTab?.("offline")}
                onKeyDown={onTabKeyDown}
              >
                通用
              </button>
              <button
                id="settings-theme-tab"
                type="button"
                role="tab"
                aria-selected={String(tab === "theme")}
                aria-controls="settings-theme-panel"
                data-settings-tab="theme"
                tabIndex={tab === "theme" ? 0 : -1}
                onClick={() => onTab?.("theme")}
                onKeyDown={onTabKeyDown}
              >
                主题
              </button>
              <button
                id="settings-appearance-tab"
                type="button"
                role="tab"
                aria-selected={String(tab === "appearance")}
                aria-controls="settings-appearance-panel"
                data-settings-tab="appearance"
                tabIndex={tab === "appearance" ? 0 : -1}
                onClick={() => onTab?.("appearance")}
                onKeyDown={onTabKeyDown}
              >
                装扮
              </button>
              <button
                id="settings-sound-tab"
                type="button"
                role="tab"
                aria-selected={String(tab === "sound")}
                aria-controls="settings-sound-panel"
                data-settings-tab="sound"
                tabIndex={tab === "sound" ? 0 : -1}
                onClick={() => onTab?.("sound")}
                onKeyDown={onTabKeyDown}
              >
                声音
              </button>
              <button
                id="settings-help-tab"
                type="button"
                role="tab"
                aria-selected={String(tab === "help")}
                aria-controls="settings-help-panel"
                data-settings-tab="help"
                tabIndex={tab === "help" ? 0 : -1}
                onClick={() => onTab?.("help")}
                onKeyDown={onTabKeyDown}
              >
                帮助
              </button>
            </div>
          </header>
          <div class="settings-dialog-body">
            <div
              id="settings-operation-panel"
              class="settings-tab-panel settings-operation-panel"
              role="tabpanel"
              aria-labelledby="settings-operation-tab"
              data-settings-panel="operation"
              hidden={tab !== "operation"}
            >
              <label class="settings-option" htmlFor="game-hints-setting">
                <input
                  id="game-hints-setting"
                  type="checkbox"
                  checked={values.gameHints}
                  onChange={(event) =>
                    onValue?.("gameHints", event.currentTarget.checked)
                  }
                />
                <span>显示对局提示</span>
              </label>
              <label
                class="settings-option"
                htmlFor="auto-win-after-riichi-setting"
              >
                <input
                  id="auto-win-after-riichi-setting"
                  type="checkbox"
                  checked={values.autoWin}
                  onChange={(event) =>
                    onValue?.("autoWin", event.currentTarget.checked)
                  }
                />
                <span>立直后自动和牌</span>
              </label>
              <label
                class="settings-option"
                htmlFor="double-click-tsumogiri-setting"
              >
                <input
                  id="double-click-tsumogiri-setting"
                  type="checkbox"
                  checked={values.tsumogiri}
                  onChange={(event) =>
                    onValue?.("tsumogiri", event.currentTarget.checked)
                  }
                />
                <span>双击空白处摸切</span>
              </label>
              <label
                class="settings-option"
                htmlFor="double-click-pass-setting"
              >
                <input
                  id="double-click-pass-setting"
                  type="checkbox"
                  checked={values.pass}
                  onChange={(event) =>
                    onValue?.("pass", event.currentTarget.checked)
                  }
                />
                <span>双击空白处跳过</span>
              </label>
            </div>
            <div
              id="settings-sound-panel"
              class="settings-tab-panel settings-sound-panel"
              role="tabpanel"
              aria-labelledby="settings-sound-tab"
              data-settings-panel="sound"
              hidden={tab !== "sound"}
            >
              <section class="settings-sound-card">
                <h2 class="settings-sound-card-title">音量</h2>
                <ul
                  class="settings-list-card settings-sound-list"
                  aria-label="音量设置"
                >
                  <li>
                    <label htmlFor="master-volume-setting">主音量</label>
                    <span class="settings-sound-control">
                      <input
                        id="master-volume-setting"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={values.master}
                        aria-valuetext={volumeLabel(values.master)}
                        onInput={(event) =>
                          onValue?.("master", event.currentTarget.value)
                        }
                      />
                      <output
                        id="master-volume-value"
                        htmlFor="master-volume-setting"
                      >
                        {volumeLabel(values.master)}
                      </output>
                    </span>
                  </li>
                  <li>
                    <label htmlFor="music-volume-setting">音乐</label>
                    <span class="settings-sound-control">
                      <input
                        id="music-volume-setting"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={values.music}
                        aria-valuetext={volumeLabel(values.music)}
                        onInput={(event) =>
                          onValue?.("music", event.currentTarget.value)
                        }
                      />
                      <output
                        id="music-volume-value"
                        htmlFor="music-volume-setting"
                      >
                        {volumeLabel(values.music)}
                      </output>
                    </span>
                  </li>
                  <li>
                    <label htmlFor="voice-volume-setting">语音</label>
                    <span class="settings-sound-control">
                      <input
                        id="voice-volume-setting"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={values.voice}
                        aria-valuetext={volumeLabel(values.voice)}
                        onInput={(event) =>
                          onValue?.("voice", event.currentTarget.value)
                        }
                      />
                      <output
                        id="voice-volume-value"
                        htmlFor="voice-volume-setting"
                      >
                        {volumeLabel(values.voice)}
                      </output>
                    </span>
                  </li>
                  <li>
                    <label htmlFor="discard-volume-setting">音效</label>
                    <span class="settings-sound-control">
                      <input
                        id="discard-volume-setting"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={values.discard}
                        aria-valuetext={volumeLabel(values.discard)}
                        onInput={(event) =>
                          onValue?.("discard", event.currentTarget.value)
                        }
                      />
                      <output
                        id="discard-volume-value"
                        htmlFor="discard-volume-setting"
                      >
                        {volumeLabel(values.discard)}
                      </output>
                    </span>
                  </li>
                </ul>
              </section>
              <section class="settings-sound-card">
                <h2 class="settings-sound-card-title">音乐</h2>
                <div
                  id="settings-sound-controls"
                  class="settings-sound-controls"
                  hidden
                ></div>
                <p
                  id="default-bgm-copyright"
                  class="settings-bgm-copyright"
                  hidden={!this.state.copyright}
                >
                  {this.state.copyright}
                </p>
              </section>
            </div>
            <div
              id="settings-offline-panel"
              class="settings-tab-panel settings-operation-panel"
              role="tabpanel"
              aria-labelledby="settings-offline-tab"
              data-settings-panel="offline"
              hidden={tab !== "offline"}
            >
              <OfflineResources
                policy={values.offline}
                onPolicy={(event) =>
                  onValue?.("offline", event.currentTarget.value)
                }
                onAction={onOfflineAction}
              />
            </div>
            <div
              id="settings-theme-panel"
              class="settings-tab-panel settings-theme-panel"
              role="tabpanel"
              aria-labelledby="settings-theme-tab"
              data-settings-panel="theme"
              hidden={tab !== "theme"}
            >
              <label
                class="settings-theme-upload"
                htmlFor="settings-theme-upload"
              >
                <span>导入主题包</span>
                <input
                  id="settings-theme-upload"
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                />
              </label>
              <ul
                id="settings-theme-list"
                class="settings-list-card settings-theme-list"
                aria-label="主题包列表"
              ></ul>
            </div>
            <div
              id="settings-appearance-panel"
              class="settings-tab-panel settings-appearance-panel"
              role="tabpanel"
              aria-labelledby="settings-appearance-tab"
              data-settings-panel="appearance"
              hidden={tab !== "appearance"}
            >
              <section class="settings-appearance-card">
                <h2 class="settings-appearance-card-title">头像</h2>
                <ul class="settings-list-card settings-appearance-list">
                  <li>
                    <label
                      class="settings-appearance-list-item"
                      htmlFor="avatar-source-preference-setting"
                    >
                      <span>头像来源</span>
                      <span class="settings-appearance-select">
                        <select
                          id="avatar-source-preference-setting"
                          value={values.avatar}
                          onChange={(event) =>
                            onValue?.("avatar", event.currentTarget.value)
                          }
                        >
                          <option value="auto">自动</option>
                          <option value="theme">主题</option>
                        </select>
                        <Icon name="chevrons-up-down" />
                      </span>
                    </label>
                  </li>
                </ul>
              </section>
              <div
                id="settings-appearance-controls"
                class="settings-appearance-controls"
                hidden
              ></div>
            </div>
            <div
              id="settings-help-panel"
              class="settings-tab-panel settings-help-panel"
              role="tabpanel"
              aria-labelledby="settings-help-tab"
              data-settings-panel="help"
              hidden={tab !== "help"}
            >
              <div
                id="settings-help-frame-slot"
                class="settings-help-iframe-placeholder"
              ></div>
              <template
                id="settings-help-frame-template"
                dangerouslySetInnerHTML={{
                  __html:
                    '\n                <iframe id="settings-help-frame" title="麻将玩法帮助" src="./help.html"></iframe>\n              ',
                }}
              />
            </div>
          </div>
          <footer class="settings-dialog-footer">
            <button
              id="settings-end-match-button"
              class="settings-dialog-end-match"
              type="button"
              hidden={!soloActive}
              onClick={onEndMatch}
            >
              {endLabel}
            </button>
            <button
              id="settings-return-button"
              class="settings-dialog-return"
              type="button"
              onClick={onClose}
            >
              {soloActive ? "返回对局" : "返回大厅"}
            </button>
          </footer>
        </div>
      </section>
    );
  }
}
