import { ViewComponent } from "../shared/component.js";
import { Icon } from "../shared/Icon.jsx";

function summaryPlayers(summary) {
  return Array.isArray(summary?.players) && summary.players.length === 4
    ? summary.players
        .map((player, index) => ({
          seat: Number(player?.seat) || index + 1,
          id: String(player?.id || ""),
          name: String(player?.name || ""),
          score: Number(player?.score) || 0,
          isLocal:
            String(player?.id || "") === String(summary.viewerPlayerId || ""),
        }))
        .sort(
          (left, right) => right.score - left.score || left.seat - right.seat,
        )
    : [];
}
export class ReplayPanel extends ViewComponent {
  state = {
    visible: false,
    open: false,
    loading: false,
    summaries: [],
    error: "",
    busyId: null,
  };
  render() {
    const {
      visible,
      open,
      loading,
      summaries,
      error,
      busyId,
      onReplay,
      onPin,
    } = this.state;
    return (
      <section
        ref={this.bind}
        id="paipu-panel"
        class={`paipu-panel${open ? " is-open" : ""}`}
        aria-label="牌谱"
        hidden={!visible}
      >
        <div class="paipu-card" tabIndex={-1}>
          <header class="paipu-header">
            <button
              id="paipu-close-button"
              class="paipu-close"
              type="button"
              aria-label="关闭牌谱"
            >
              <Icon name="x" />
            </button>
            <div>
              <h2>牌谱</h2>
            </div>
          </header>
          <div
            id="paipu-empty"
            class="paipu-empty"
            hidden={loading || (!error && summaries.length > 0)}
          >
            {error || "还没有完成的对局"}
          </div>
          <ul id="paipu-list" class="paipu-list" aria-label="牌谱列表">
            {summaries.map((summary) => {
              const date = new Date(Number(summary.endedAtMs));
              const validDate = Number.isFinite(date.getTime());
              return (
                <li key={summary.id} class="paipu-entry">
                  <div class="paipu-entry-info">
                    <div class="paipu-entry-players">
                      {summaryPlayers(summary).map((player) => {
                        const Tag = player.isLocal ? "strong" : "span";
                        const name =
                          player.name ||
                          (player.isLocal ? "你" : `玩家${player.seat}`);
                        return (
                          <div
                            key={player.seat}
                            class={`paipu-entry-player${player.isLocal ? " is-local" : ""}`}
                          >
                            <Tag class="paipu-entry-player-name" title={name}>
                              {name}
                            </Tag>
                            <Tag class="paipu-entry-player-score">
                              {player.score}
                            </Tag>
                          </div>
                        );
                      })}
                    </div>
                    <div class="paipu-entry-meta">
                      <span class="paipu-entry-match-type">
                        {summary.matchType === "hanchan" ? "南风场" : "东风场"}
                      </span>
                      <time
                        dateTime={validDate ? date.toISOString() : undefined}
                      >
                        {validDate
                          ? date.toLocaleString("zh-CN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "未知时间"}
                      </time>
                    </div>
                  </div>
                  <div class="paipu-entry-actions">
                    <button
                      type="button"
                      class="paipu-entry-action"
                      aria-label="回放"
                      title="回放"
                      onClick={() => onReplay?.(summary.id)}
                    >
                      <Icon name="play" />
                    </button>
                    <button
                      type="button"
                      class="paipu-entry-action"
                      aria-label={summary.pinned ? "取消收藏" : "收藏"}
                      title={summary.pinned ? "取消收藏" : "收藏"}
                      aria-pressed={String(summary.pinned)}
                      disabled={busyId === summary.id}
                      onClick={() => onPin?.(summary)}
                    >
                      <Icon
                        name={summary.pinned ? "bookmark-check" : "bookmark"}
                      />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    );
  }
}
