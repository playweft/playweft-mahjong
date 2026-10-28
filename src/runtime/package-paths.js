// Development serves the game at root; production paths are injected by Vite.
export function siteBasePath() {
  return typeof __MAHJONG_SITE_BASE__ === "string" ? __MAHJONG_SITE_BASE__ : "/";
}

export function siteResourcePath(file) {
  return siteBasePath() + file.replace(/^\/+/, "");
}

export function gameBasePath(gameId = "mahjong") {
  if (gameId === "mahjong")
    return typeof __MAHJONG_PACKAGE_BASE__ === "string" ? __MAHJONG_PACKAGE_BASE__ : siteBasePath();
  return `${siteBasePath()}${gameId}/`;
}
