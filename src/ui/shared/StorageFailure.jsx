import { useRef, useState } from "preact/hooks";

export function StorageFailure({ error, retry, saving }) {
  const [busy, setBusy] = useState(false);
  const button = useRef(null);
  return (
    <div
      class="game-storage-error"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="game-storage-title"
      aria-describedby="game-storage-reason"
      onKeyDown={(event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          button.current?.focus();
        }
        event.stopPropagation();
      }}
    >
      <h2 id="game-storage-title">
        {saving ? "存档保存失败" : "存档读取失败"}
      </h2>
      <p id="game-storage-reason">{`${error?.code ? `[${error.code}]\n` : ""}${error?.message || String(error)}\n${saving ? "当前进度仍保留在本页，请重试保存。" : "旧存档已保留，请重试读取。"}`}</p>
      <button
        type="button"
        ref={button}
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          try {
            await retry();
          } finally {
            setBusy(false);
          }
        }}
      >
        {saving ? "重试保存" : "重试读取"}
      </button>
    </div>
  );
}
