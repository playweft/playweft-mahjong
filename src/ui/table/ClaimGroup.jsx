import { useRef, useState } from "preact/hooks";
import { flushSync } from "preact/compat";
import { CLAIM_LABELS } from "../../game/rules/constants.js";
import { claimPreviewTiles, tileFace } from "../../game/rules/game-format.js";
import { Tile } from "./Tile.jsx";

export function ClaimGroup({ claims, kind, onAction, showHints, dora }) {
  const [open, updateOpen] = useState(false);
  const button = useRef(null),
    choices = useRef(null);
  const label = CLAIM_LABELS[kind];
  const setOpen = (value) => {
    flushSync(() => updateOpen(value));
    if (value) choices.current?.querySelector("button")?.focus();
    else button.current?.focus();
  };
  if (claims.length === 1)
    return (
      <div class="claim-action-group">
        <button
          type="button"
          class={`claim-action claim-${kind}`}
          onClick={() =>
            onAction?.({ type: "claim", option: claims[0].option })
          }
        >
          {label}
        </button>
      </div>
    );
  return (
    <div class="claim-action-group">
      <button
        ref={button}
        type="button"
        class={`claim-action claim-${kind}`}
        aria-haspopup="dialog"
        aria-controls={`${kind}-choice-popover`}
        aria-expanded={String(open)}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      <div
        class="claim-choice-layer"
        hidden={!open}
        tabIndex={-1}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <div
          id={`${kind}-choice-popover`}
          class="claim-choice-popover"
          role="dialog"
          aria-label={`选择${label}法`}
          aria-modal="true"
        >
          <div
            ref={choices}
            class="claim-choice-list"
            style={{
              "--claim-choice-columns": String(Math.min(3, claims.length)),
            }}
          >
            {claims.map((claim) => {
              const preview = claimPreviewTiles(claim);
              return (
                <button
                  key={claim.option}
                  type="button"
                  class="claim-choice"
                  aria-label={`${label}：${preview.map((tile) => `${tile.red ? "赤" : ""}${tileFace(tile.type).label}`).join("、")}`}
                  onClick={() =>
                    onAction?.({ type: "claim", option: claim.option })
                  }
                >
                  {preview.map((tile, index) => (
                    <Tile
                      key={index}
                      type={tile.type}
                      red={tile.red}
                      size="claim-choice"
                      dora={showHints && dora?.has(tile.type)}
                      aria-hidden="true"
                    />
                  ))}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
