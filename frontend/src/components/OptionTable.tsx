import { useMemo, useState } from "react";

import { formatNumber, humanize } from "../format";
import { metricHelp } from "../metricHelp";
import type { ReceiverOption } from "../types";
import { MetricLabel } from "./Common";
import { PlayerPortraitLink } from "./VisualIdentity";

type SortKey = "pinned" | "receiver" | "same_frame" | "delta_xt" | "rank" | "local_xpass" | "availability" | "pass_viability" | "pass_viability_rank";

function role(option: ReceiverOption): string {
  if (option.is_selected && option.is_highest_pvi) return "Selected · Highest PVI";
  if (option.is_selected) return "Selected";
  if (option.is_highest_pvi) return "Highest PVI";
  return "Teammate candidate";
}

export function OptionTable({ options, activeOptionId, onSelect, playerHref }: { options: ReceiverOption[]; activeOptionId: string | null; onSelect: (option: ReceiverOption) => void; playerHref?: (playerId: number) => string }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "pinned", direction: "asc" });
  const rows = useMemo(() => [...options].sort((left, right) => {
    const value = (option: ReceiverOption): string | number | null => {
      switch (sort.key) {
        case "pinned": return option.is_selected ? 0 : option.is_highest_pvi ? 1 : 2;
        case "receiver": return option.receiver_name;
        case "same_frame": return option.same_frame.open_xt;
        case "rank": return option.same_frame.rank;
        case "delta_xt": return option.same_frame.delta_xt;
        case "local_xpass": return option.local_xpass.xpass;
        case "availability": return option.local_xpass.availability_score;
        case "pass_viability": return option.pass_viability.score;
        case "pass_viability_rank": return option.pass_viability.rank;
      }
    };
    const first = value(left); const second = value(right);
    const ordered = first === null || second === null ? (first === second ? 0 : first === null ? 1 : -1) : typeof first === "string" && typeof second === "string" ? first.localeCompare(second) : Number(first) - Number(second);
    const pinned = (option: ReceiverOption) => option.is_selected ? 0 : option.is_highest_pvi ? 1 : 2;
    const pviRank = (option: ReceiverOption) => option.pass_viability.rank ?? Number.POSITIVE_INFINITY;
    return ((first === null || second === null || sort.direction === "asc") ? ordered : -ordered)
      || (sort.key === "pinned" ? pviRank(left) - pviRank(right) : 0)
      || pinned(left) - pinned(right) || left.option_id.localeCompare(right.option_id);
  }), [options, sort]);
  const toggle = (key: SortKey) => setSort((current) => ({ key, direction: current.key === key ? current.direction === "asc" ? "desc" : "asc" : key === "pass_viability" ? "desc" : "asc" }));
  const header = (label: string, key: SortKey, help: string) => <button type="button" className="table-sort" onClick={() => toggle(key)}><MetricLabel label={label} help={help} />{sort.key === key ? ` ${sort.direction === "asc" ? "↑" : "↓"}` : ""}</button>;
  return <div className="option-table-wrap"><table className="data-table option-table"><thead>
    <tr className="table-group-row"><th colSpan={6}>Actual-frame Local xT v1</th><th colSpan={4}>Project-owned Local xPass v1</th><th colSpan={2}>Project-owned PVI v2</th></tr>
    <tr><th>{header("Receiver", "receiver", metricHelp.receiver)}</th><th>{header("Order", "pinned", metricHelp.order)}</th><th><MetricLabel label="Location valid" help={metricHelp.locationValid} /></th><th>{header("Local xT v1", "same_frame", metricHelp.sameFrameOpenXt)}</th><th>{header("Local xT rank", "rank", metricHelp.sameFrameRank)}</th><th>{header("Δ xT", "delta_xt", metricHelp.sameFrameDeltaXt)}</th><th>{header("Local xPass v1", "local_xpass", metricHelp.localXPass)}</th><th><MetricLabel label="Local rank" help={metricHelp.localXPassRank} /></th><th>{header("Availability", "availability", metricHelp.availability)}</th><th><MetricLabel label="Confidence" help={metricHelp.localConfidence} /></th><th className="is-pvi">{header("PVI", "pass_viability", metricHelp.passViability)}</th><th>{header("PVI rank", "pass_viability_rank", metricHelp.pviRank)}</th></tr>
  </thead><tbody>{rows.map((option) => <tr key={option.option_id} className={option.option_id === activeOptionId ? "is-active" : option.is_selected ? "is-selected" : ""}>
    <th scope="row"><span className="identity-cell"><PlayerPortraitLink playerId={option.receiver_id} playerName={option.receiver_name} href={playerHref?.(option.receiver_id)} className="player-portrait player-portrait--option" /><span><button type="button" className="row-link" onClick={() => onSelect(option)}>{option.receiver_name}</button>{playerHref ? <a className="player-profile-link" href={playerHref(option.receiver_id)}>Player profile</a> : null}</span></span></th><td>{role(option)}</td><td title={option.same_frame.invalid_reason ?? undefined}>{option.same_frame.has_valid_location ? "Valid" : humanize(option.same_frame.invalid_reason)}</td><td>{formatNumber(option.same_frame.open_xt, 5)}</td><td>{option.same_frame.rank ?? "N/A"}</td><td>{formatNumber(option.same_frame.delta_xt, 5)}</td><td>{formatNumber(option.local_xpass.xpass, 4)}</td><td>{option.local_xpass.rank ?? "N/A"}</td><td>{formatNumber(option.local_xpass.availability_score, 3)}</td><td>{humanize(option.local_xpass.confidence)}</td><td className="is-pvi">{formatNumber(option.pass_viability.score, 2)}</td><td>{option.pass_viability.rank ?? "N/A"}</td>
  </tr>)}</tbody></table></div>;
}
