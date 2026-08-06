import type { MatchOption } from "../types";

import { ClubBadgeLink } from "./VisualIdentity";

type FixtureVariant = "compact" | "hero" | "inline";

function uniqueClubs(matches: MatchOption[]) {
  const clubs = new Map<number, string>();
  matches.forEach((match) => {
    if (match.home_team_id !== null) clubs.set(match.home_team_id, match.home_team_name);
    if (match.away_team_id !== null) clubs.set(match.away_team_id, match.away_team_name);
  });
  return [...clubs.entries()].map(([id, name]) => ({ id, name }));
}

export function FixtureStrip({ match, matches = [], teamHref, variant = "compact" }: { match?: MatchOption | null; matches?: MatchOption[]; teamHref?: (teamId: number) => string; variant?: FixtureVariant }) {
  if (!match && !matches.length) return null;
  if (!match) {
    const clubs = uniqueClubs(matches);
    return <section className={`fixture-strip fixture-strip--${variant} fixture-strip--sample`} aria-label="Available fixture sample">
      <div className="fixture-strip__sample-copy"><span className="fixture-strip__kicker">Available fixture sample</span><strong>{matches.length} matches · {clubs.length} clubs</strong></div>
      <div className="fixture-strip__crest-rail" aria-label={`${clubs.length} clubs in the available match sample`}>{clubs.map((club) => <ClubBadgeLink key={club.id} teamId={club.id} teamName={club.name} href={teamHref?.(club.id)} className="club-badge club-badge--rail" />)}</div>
    </section>;
  }
  return <section className={`fixture-strip fixture-strip--${variant}`} aria-label={`${match.home_team_name} versus ${match.away_team_name}`}>
    <div className="fixture-strip__team fixture-strip__team--home"><span>{match.home_team_name}</span><ClubBadgeLink teamId={match.home_team_id} teamName={match.home_team_name} href={match.home_team_id === null ? undefined : teamHref?.(match.home_team_id)} className="club-badge club-badge--fixture" /></div>
    <div className="fixture-strip__score"><span>{match.score ?? "Score unavailable"}</span><small>vs</small></div>
    <div className="fixture-strip__team fixture-strip__team--away"><ClubBadgeLink teamId={match.away_team_id} teamName={match.away_team_name} href={match.away_team_id === null ? undefined : teamHref?.(match.away_team_id)} className="club-badge club-badge--fixture" /><span>{match.away_team_name}</span></div>
  </section>;
}
