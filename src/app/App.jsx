import { TableControls } from "../ui/table/TableControls.jsx";
import { AutoActions } from "../ui/table/AutoActions.jsx";
import { SettingsDialog } from "../ui/settings/SettingsDialog.jsx";
import { TableStatus } from "../ui/table/TableStatus.jsx";
import { TableScene } from "../ui/table/TableScene.jsx";
import { PlayerDock } from "../ui/table/PlayerDock.jsx";
import { HandResult } from "../ui/result/HandResult.jsx";
import { CareerResult } from "../ui/result/CareerResult.jsx";
import { Lobby } from "../ui/lobby/Lobby.jsx";
import { ReplayPanel } from "../ui/replay/ReplayPanel.jsx";
import { PlaybackControls } from "../ui/replay/PlaybackControls.jsx";
import { LoadingPanel } from "../ui/shared/LoadingPanel.jsx";
import { TransientNotice } from "../ui/shared/TransientNotice.jsx";

export function App() {
  return (
    <>
      <div id="mahjong-boot-splash" role="status" aria-live="polite">
        <span class="mahjong-boot-spinner" aria-hidden="true" />
        <span class="mahjong-boot-label">正在载入麻将</span>
      </div>
      <main id="mahjong-app" class="mahjong-app" aria-busy="true">
        <div id="mahjong-viewport" class="mahjong-viewport">
          <TableControls />
          <AutoActions />
          <SettingsDialog />
          <TableStatus />
          <TableScene />
          <PlayerDock />
          <HandResult />
          <CareerResult />
          <Lobby />
          <ReplayPanel />
          <PlaybackControls />
          <LoadingPanel />
        </div>
        <TransientNotice />
      </main>
    </>
  );
}
