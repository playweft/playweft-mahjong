import { render } from "preact";
import { Icon } from "../../shared/Icon.jsx";

function PackAction({ label, action, id = "", url, icon }) {
  return (
    <button
      type="button"
      class="settings-theme-icon-button"
      data-pack-action={action}
      data-pack-id={id}
      data-pack-url={url}
      aria-label={label}
      title={label}
    >
      <Icon name={icon} />
    </button>
  );
}
function ThemePacks({ packs, remote }) {
  return (
    <>
      {packs.map((pack) => (
        <li
          key={pack.id}
          class={pack.active ? "is-active" : ""}
          data-pack-id={pack.id}
        >
          <button
            type="button"
            class="settings-theme-select"
            data-pack-action="activate"
            data-pack-id={pack.id}
            disabled={pack.active}
          >
            <span class="settings-theme-row-details">
              <span class="settings-theme-title">{pack.name}</span>
              <small>
                {pack.isDefault
                  ? "内置主题包"
                  : `${pack.assetNames.length} 项装扮内容`}
              </small>
            </span>
          </button>
          <span class="settings-theme-actions">
            {pack.active && (
              <span
                class="settings-theme-current"
                aria-label="当前使用中"
                title="当前使用中"
              >
                <Icon name="check" />
              </span>
            )}
            {!pack.isDefault && (
              <PackAction
                label="删除"
                action="delete"
                id={pack.id}
                icon="trash-2"
              />
            )}
          </span>
        </li>
      ))}
      {remote.map((pack) => (
        <li key={pack.url} class="is-remote">
          <span class="settings-theme-row-details">
            <span class="settings-theme-title">{pack.name}</span>
            <small>在线主题包</small>
          </span>
          <span class="settings-theme-actions">
            <PackAction
              label="下载"
              action="download"
              url={pack.url}
              icon="download"
            />
          </span>
        </li>
      ))}
    </>
  );
}
function AppearanceList({ rows }) {
  return (
    <ul class="settings-list-card settings-appearance-list">
      {rows.map((row) => (
        <li key={row.key}>
          <label
            class={`settings-appearance-list-item${row.disabled ? " is-disabled" : ""}`}
          >
            <span>{row.label}</span>
            <span class="settings-appearance-select">
              <select
                data-appearance-key={row.key}
                disabled={row.disabled}
                value={row.selected}
              >
                {row.emptyLabel && <option value="">{row.emptyLabel}</option>}
                {row.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Icon name="chevrons-up-down" />
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
export function renderThemePacks(element, packs, remote) {
  if (element?.nodeType === 1)
    render(<ThemePacks packs={packs} remote={remote} />, element);
}
export function renderAppearanceCards(element, cards) {
  if (element?.nodeType === 1)
    render(
      <>
        {cards.map((card) => (
          <section key={card.title} class="settings-appearance-card">
            <h2 class="settings-appearance-card-title">{card.title}</h2>
            <AppearanceList rows={card.rows} />
          </section>
        ))}
      </>,
      element,
    );
}
export function renderSoundOptions(element, rows) {
  if (element?.nodeType === 1) render(<AppearanceList rows={rows} />, element);
}
export function unmountThemeControls(...elements) {
  for (const element of elements)
    if (element?.nodeType === 1) render(null, element);
}
