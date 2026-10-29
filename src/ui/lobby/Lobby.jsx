import { ViewComponent } from "../shared/component.js";
import { CareerSlots } from "./CareerSlots.jsx";
import { Icon } from "../shared/Icon.jsx";

export class Lobby extends ViewComponent {
  state = {
    page: "home",
    fading: false,
    transitioning: false,
    pending: false,
    careers: [],
    room: false,
    roomAvailable: false,
    roomBusy: false,
  };
  render() {
    const {
      page,
      fading,
      transitioning,
      pending,
      careers,
      room,
      roomAvailable,
      roomBusy,
      onNavigate,
      onStart,
      onCreateRoom,
      onKeyDown,
    } = this.state;
    return (
      <section
        ref={this.bind}
        id="setup-panel"
        class="setup-panel"
        data-lobby-view={page}
        onKeyDown={onKeyDown}
        aria-label="麻将大厅"
      >
        <div class="setup-scene">
          <div id="setup-menu" class="setup-menu">
            <div
              class={`setup-menu-paper${fading ? " is-menu-fading" : ""}`}
              inert={transitioning}
            >
              <div
                class="setup-lobby-page"
                data-lobby-page="home"
                hidden={page !== "home"}
              >
                <div class="setup-match-options" aria-label="选择游戏模式">
                  <button
                    class="setup-route-sign setup-route-east"
                    type="button"
                    data-lobby-target="career"
                    onClick={() => onNavigate?.("career")}
                    hidden={room}
                  >
                    <span class="setup-route-name setup-career-name">
                      立志戦
                    </span>
                    <Icon name="chevron-right" />
                  </button>
                  <button
                    class="setup-route-sign"
                    type="button"
                    data-lobby-target="training"
                    onClick={() => onNavigate?.("training")}
                  >
                    <span class="setup-route-name">修練戦</span>
                    <Icon name="chevron-right" />
                  </button>
                  <button
                    id="create-room-button"
                    class="setup-route-sign setup-room-entry"
                    type="button"
                    hidden={!roomAvailable}
                    disabled={roomBusy}
                    aria-busy={String(roomBusy)}
                    onClick={onCreateRoom}
                  >
                    <span class="setup-route-name" data-room-entry-label="">
                      {roomBusy ? "创建中" : "友人戦"}
                    </span>
                    <Icon name="chevron-right" />
                  </button>
                </div>
              </div>
              <div
                class="setup-lobby-page"
                data-lobby-page="training"
                hidden={page !== "training"}
              >
                <header class="setup-submenu-header">
                  <button
                    type="button"
                    data-lobby-target="home"
                    onClick={() => onNavigate?.("home")}
                    aria-label="返回主菜单"
                  >
                    ‹ 返回
                  </button>
                  <h2>修練戦</h2>
                </header>
                <div class="setup-match-options" aria-label="选择对局长度">
                  <button
                    class="setup-route-sign setup-route-east"
                    type="button"
                    data-match-type="east"
                    aria-label="东风场，东一局至东四局"
                  >
                    <span class="setup-route-name">東風場</span>
                    <Icon name="chevron-right" />
                  </button>
                  <button
                    class="setup-route-sign setup-route-south"
                    type="button"
                    data-match-type="hanchan"
                    aria-label="南风场，包含东场与南场"
                  >
                    <span class="setup-route-name">南風場</span>
                    <Icon name="chevron-right" />
                  </button>
                </div>
              </div>
              <div
                class="setup-lobby-page setup-career-page"
                data-lobby-page="career"
                hidden={page !== "career"}
              >
                <header class="setup-submenu-header">
                  <button
                    type="button"
                    data-lobby-target="home"
                    onClick={() => onNavigate?.("home")}
                    aria-label="返回主菜单"
                  >
                    ‹ 返回
                  </button>
                  <h2>立志戦</h2>
                </header>
                <div
                  id="career-slots"
                  class="career-slots"
                  aria-label="三个生涯存档槽"
                >
                  <CareerSlots
                    careers={careers}
                    pending={pending}
                    onStart={onStart}
                  />
                </div>
                <details class="career-guide">
                  <summary>赛制说明</summary>
                  <p class="career-rules">
                    定段：3 场南风战，战绩为主、决策质量为辅。
                    <br />
                    联赛：每期 8 场。C3 升级线 +80 pt，降级线 −80 pt；
                    每升一级，两条分线均提高 5 pt。累计成绩达到对应分线升降级，
                    其余保级。E1 不降级，A1 不升级。
                    <br />
                    E1 → D3 → D2 → D1 → C3 → C2 → C1 → B2 → B1 → A2 → A1
                  </p>
                  <p class="career-evaluation-note">
                    决策参考用于练习评估，不对应现实职业等级。
                  </p>
                </details>
              </div>
              <div class="setup-menu-divider" aria-hidden="true">
                <span></span>
              </div>
              <div class="setup-secondary-actions">
                <button
                  class="setup-secondary-entry setup-paipu-entry"
                  type="button"
                  aria-label="牌谱"
                >
                  <Icon name="book-open" />
                  <span>牌谱</span>
                </button>
              </div>
              <details class="rule-options" hidden={page !== "training"}>
                <summary>
                  高级规则
                  <Icon name="chevron-right" />
                </summary>
                <div class="rule-options-list">
                  <label>
                    <input
                      type="checkbox"
                      data-rule="multipleRon"
                      defaultChecked
                    />{" "}
                    一炮多响
                  </label>
                  <label>
                    <input type="checkbox" data-rule="tripleRonAbort" />{" "}
                    三家和流局
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      data-rule="abortiveDraws"
                      defaultChecked
                    />{" "}
                    途中流局
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      data-rule="nagashiMangan"
                      defaultChecked
                    />{" "}
                    流局满贯
                  </label>
                  <label>
                    <input type="checkbox" data-rule="pao" defaultChecked />{" "}
                    包牌
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      data-rule="bankruptcy"
                      defaultChecked
                    />{" "}
                    击飞结束
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      data-rule="extensions"
                      defaultChecked
                    />{" "}
                    南入／西入
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      data-rule="agariYame"
                      defaultChecked
                    />{" "}
                    终局庄家止和
                  </label>
                </div>
              </details>
            </div>
          </div>
          <h1 class="setup-title" aria-label="麻将">
            <img
              src={
                new URL("../../assets/lobby-title.svg", import.meta.url).href
              }
              alt=""
              aria-hidden="true"
            />
          </h1>
        </div>
      </section>
    );
  }
}
