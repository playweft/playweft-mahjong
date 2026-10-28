import { appMarkup } from "../ui/markup.jsx";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CLAIM_LABELS } from "../../src/game/rules/constants.js";
import { YAKU_FONT_TEXT, traditionalDrawReason } from "../../src/game/rules/yaku-display.js";
import { ROOM_ENTRY_LABELS } from "../../src/ui/lobby/room-entry.js";
import { CAREER_RESULT_LABELS } from "../../src/ui/result/career-result-controller.js";

const root = new URL("../../", import.meta.url);
export function mahjongBrushTextGroups() {
  const html = appMarkup();
  return {
    lobby: [...html.matchAll(/<span class="setup-route-name[^\"]*"[^>]*>([^<]+)<\/span>/g)].map((match) => match[1]).join(""),
    roomEntry: Object.values(ROOM_ENTRY_LABELS).join(""),
    careerResult: "ABCDE" + Object.values(CAREER_RESULT_LABELS).map(({ title, action }) => title + action).join("") +
      [...html.matchAll(/data-career-brush(?:="")?>([^<]+)</g)].map((match) => match[1]).join(""),
    roundsAndWinds: "+0123456789四人東南西北一二三四局",
    actions: `跳过流局立直自摸${Object.values(CLAIM_LABELS).join("")}`,
    results: "继续等待中",
    draws: ["荒牌流局", "途中流局", "九种九牌", "四风连打", "四杠散了", "四家立直", "三家和", "流局满贯"].map(traditionalDrawReason).join(""),
    yaku: YAKU_FONT_TEXT,
  };
}
export function mahjongBrushText() {
  return [...new Set(Object.values(mahjongBrushTextGroups()).join(""))].sort().join("") + "\n";
}
const textFile = new URL("src/assets/fonts/mahjong-brush-text.txt", root);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--write")) writeFileSync(textFile, mahjongBrushText());
  else if (readFileSync(textFile, "utf8") !== mahjongBrushText()) {
    throw new Error("Brush glyph list is out of date. Run node build/fonts/mahjong-brush-text.js --write");
  }
}
