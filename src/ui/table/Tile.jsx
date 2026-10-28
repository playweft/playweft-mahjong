import { tileFace } from "../../game/rules/game-format.js";
import { tileFaceFrameIndex } from "../../render/tile-texture-map.js";

export function Tile({
  type,
  size,
  red = false,
  dora = false,
  class: extra = "",
  style = {},
  ...props
}) {
  const face = tileFace(type);
  const frame = tileFaceFrameIndex(type, red);
  const Tag = size === "hand" ? "button" : "span";
  return (
    <Tag
      class={`mahjong-tile tile-${size} suit-${face.suit}${red ? " is-red-five" : ""}${dora ? " is-dora" : ""}${extra ? ` ${extra}` : ""}`}
      type={size === "hand" ? "button" : undefined}
      data-type={type}
      style={{
        "--tile-column": String(frame % 8),
        "--tile-row": String(Math.floor(frame / 8)),
        ...style,
      }}
      {...props}
      aria-label={props["aria-label"] ?? face.label}
    >
      <b>{face.rank}</b>
      <small>{face.mark}</small>
    </Tag>
  );
}
export function TileBack(props) {
  return <span class="mahjong-tile tile-back" aria-hidden="true" {...props} />;
}
