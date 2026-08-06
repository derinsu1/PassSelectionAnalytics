import { useEffect, useState } from "react";

type AssetKind = "club" | "player";

interface VisualAssetRecord {
  source_id: number;
  status: "downloaded" | "failed" | "placeholder";
  local_path: string | null;
}

interface VisualAssetManifest {
  clubs: VisualAssetRecord[];
  players: VisualAssetRecord[];
}

const ASSET_ROOT = "/data/visual-assets";
const manifestPath = `${ASSET_ROOT}/manifest.json`;
let manifestRequest: Promise<VisualAssetManifest | null> | null = null;

function loadManifest() {
  if (!manifestRequest) {
    manifestRequest = (typeof fetch === "undefined" ? Promise.resolve(null) : fetch(manifestPath)
      .then((response) => response.ok ? response.json() as Promise<VisualAssetManifest> : null)
      .catch(() => null));
  }
  return manifestRequest;
}

function fallbackPath(kind: AssetKind) {
  return `${ASSET_ROOT}/placeholders/${kind}.svg`;
}

function useVisualAsset(kind: AssetKind, sourceId: number | null) {
  const fallback = fallbackPath(kind);
  const [src, setSrc] = useState(fallback);

  useEffect(() => {
    let mounted = true;
    setSrc(fallback);
    void loadManifest().then((manifest) => {
      const records = manifest?.[kind === "club" ? "clubs" : "players"];
      const record = Array.isArray(records) ? records.find((item) => item.source_id === sourceId) : undefined;
      if (mounted && record?.status === "downloaded" && record.local_path) setSrc(record.local_path);
    });
    return () => { mounted = false; };
  }, [fallback, kind, sourceId]);

  return [src, fallback, setSrc] as const;
}

function VisualIdentity({ kind, sourceId, name, className }: { kind: AssetKind; sourceId: number | null; name: string; className: string }) {
  const [src, fallback, setSrc] = useVisualAsset(kind, sourceId);
  return <img
    className={className}
    src={src}
    alt=""
    aria-hidden="true"
    title={name}
    onError={() => { if (src !== fallback) setSrc(fallback); }}
  />;
}

export function ClubBadge({ teamId, teamName, className = "club-badge" }: { teamId: number | null; teamName: string; className?: string }) {
  return <VisualIdentity kind="club" sourceId={teamId} name={teamName} className={className} />;
}

export function PlayerPortrait({ playerId, playerName, className = "player-portrait" }: { playerId: number | null; playerName: string; className?: string }) {
  return <VisualIdentity kind="player" sourceId={playerId} name={`${playerName} portrait`} className={className} />;
}

export function ClubBadgeLink({ teamId, teamName, href, className = "club-badge" }: { teamId: number | null; teamName: string; href?: string; className?: string }) {
  const badge = <ClubBadge teamId={teamId} teamName={teamName} className={className} />;
  if (!href || teamId === null) return badge;
  return <a className="identity-link identity-link--club" href={href} aria-label={`Open ${teamName} in Review Explorer`} title={teamName}>{badge}</a>;
}

export function PlayerPortraitLink({ playerId, playerName, href, className = "player-portrait" }: { playerId: number | null; playerName: string; href?: string; className?: string }) {
  const portrait = <PlayerPortrait playerId={playerId} playerName={playerName} className={className} />;
  if (!href || playerId === null) return portrait;
  return <a className="identity-link identity-link--player" href={href} aria-label={`Open ${playerName} player profile`} title={`Open ${playerName} player profile`}>{portrait}</a>;
}
