from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from io import StringIO

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.axes import Axes
from matplotlib.patches import FancyArrowPatch
from mplsoccer import Pitch

from pass_selection.api.contracts import PitchCacheInfo, TrackedObject
from pass_selection.api.repository import WorkbenchRepository, _optional_float, _optional_int

RENDERING_VERSION = "pass-selection-pitch-v1"


@dataclass(frozen=True)
class PitchRenderResult:
    svg: str
    cache_hit: bool


class PitchRenderer:
    """Canonical mplsoccer renderer with a bounded deterministic SVG cache."""

    def __init__(self, repository: WorkbenchRepository, capacity: int = 180) -> None:
        self.repository = repository
        self.capacity = capacity
        self._cache: OrderedDict[str, str] = OrderedDict()
        self._hits = 0
        self._misses = 0

    def cache_info(self) -> PitchCacheInfo:
        return PitchCacheInfo(hits=self._hits, misses=self._misses, entries=len(self._cache))

    @staticmethod
    def _key(
        decision_id: str,
        frame: int,
        show_names: bool,
        show_ids: bool,
        show_option_labels: bool,
        show_all_option_arrows: bool,
        show_best_option_arrow: bool,
        show_ball_trail: bool,
        show_defender_labels: bool,
        show_provider_peak_context: bool,
        highlight_option_id: str | None,
        view_mode: str,
    ) -> str:
        toggles = (
            show_names,
            show_ids,
            show_option_labels,
            show_all_option_arrows,
            show_best_option_arrow,
            show_ball_trail,
            show_defender_labels,
            show_provider_peak_context,
            highlight_option_id or "",
            view_mode,
        )
        return f"{RENDERING_VERSION}|{decision_id}|{frame}|{','.join(str(int(value)) if isinstance(value, bool) else value for value in toggles)}"

    @staticmethod
    def _point(player: TrackedObject | None) -> tuple[float, float] | None:
        if player is None or player.x is None or player.y is None:
            return None
        return player.x, player.y

    @staticmethod
    def _label(player: TrackedObject, show_names: bool, show_ids: bool) -> str | None:
        values: list[str] = []
        if show_names and player.name:
            values.append(player.name)
        if show_ids and player.player_id is not None:
            values.append(str(player.player_id))
        return " · ".join(values) if values else None

    def render(
        self,
        decision_id: str,
        frame: int,
        *,
        show_names: bool = False,
        show_ids: bool = False,
        show_option_labels: bool = False,
        show_all_option_arrows: bool = False,
        show_best_option_arrow: bool = True,
        show_ball_trail: bool = False,
        show_defender_labels: bool = False,
        show_provider_peak_context: bool = False,
        highlight_option_id: str | None = None,
        view_mode: str = "action",
    ) -> PitchRenderResult:
        key = self._key(
            decision_id,
            frame,
            show_names,
            show_ids,
            show_option_labels,
            show_all_option_arrows,
            show_best_option_arrow,
            show_ball_trail,
            show_defender_labels,
            show_provider_peak_context,
            highlight_option_id,
            view_mode,
        )
        cached = self._cache.get(key)
        if cached is not None:
            self._cache.move_to_end(key)
            self._hits += 1
            return PitchRenderResult(svg=cached, cache_hit=True)
        self._misses += 1
        svg = self._render_uncached(
            decision_id,
            frame,
            show_names=show_names,
            show_ids=show_ids,
            show_option_labels=show_option_labels,
            show_all_option_arrows=show_all_option_arrows,
            show_best_option_arrow=show_best_option_arrow,
            show_ball_trail=show_ball_trail,
            show_defender_labels=show_defender_labels,
            show_provider_peak_context=show_provider_peak_context,
            highlight_option_id=highlight_option_id,
            view_mode=view_mode,
        )
        self._cache[key] = svg
        self._cache.move_to_end(key)
        while len(self._cache) > self.capacity:
            self._cache.popitem(last=False)
        return PitchRenderResult(svg=svg, cache_hit=False)

    def _render_uncached(
        self,
        decision_id: str,
        frame: int,
        *,
        show_names: bool,
        show_ids: bool,
        show_option_labels: bool,
        show_all_option_arrows: bool,
        show_best_option_arrow: bool,
        show_ball_trail: bool,
        show_defender_labels: bool,
        show_provider_peak_context: bool,
        highlight_option_id: str | None,
        view_mode: str,
    ) -> str:
        decision = self.repository.decision_series(decision_id)
        summary = self.repository.review_summary(decision_id)
        payload = self.repository.frame(decision_id, frame)
        options = self.repository.options_for_decision(decision_id)
        pitch = Pitch(
            pitch_type="skillcorner",
            pitch_length=float(decision.source_pitch_length),
            pitch_width=float(decision.source_pitch_width),
            pitch_color="#123d32",
            line_color="#d9efe7",
            stripe=True,
            stripe_color="#154838",
            linewidth=1.2,
        )
        fig, ax = pitch.draw(figsize=(12.5, 7.8))
        fig.patch.set_facecolor("#0b1715")
        ax.set_facecolor("#123d32")
        attackers = [player for player in payload.players if player.team_id == summary.team_id]
        defenders = [player for player in payload.players if player.team_id != summary.team_id]
        self._scatter_group(pitch, ax, defenders, "#df6076", 50, alpha=0.88)
        self._scatter_group(pitch, ax, attackers, "#82c7b8", 50, alpha=0.94)

        option_ids = {
            int(row.receiver_id): str(row.option_id)
            for row in options.loc[options.receiver_id.notna()].itertuples(index=False)
        }
        selected_point: tuple[float, float] | None = None
        best_point: tuple[float, float] | None = None
        highlighted_point: tuple[float, float] | None = None
        for player in payload.players:
            option_id = option_ids.get(player.player_id or -1)
            if option_id is None:
                continue
            point = self._point(player)
            if point is None:
                continue
            is_selected = player.is_selected_receiver
            is_best = player.is_best_same_frame_option
            is_highlighted = option_id == highlight_option_id
            if is_selected:
                selected_point = point
            if is_best:
                best_point = point
            if is_highlighted:
                highlighted_point = point

        passer_point = self._point(payload.passer)
        ball_point = self._point(payload.ball)
        at_pass_frame = frame == int(decision.actual_pass_frame)
        option_by_id = {str(row.option_id): row for row in options.itertuples(index=False)}

        arrow_segments: list[tuple[tuple[float, float], tuple[float, float]]] = []
        if at_pass_frame and passer_point is not None:
            arrow_segments = self._draw_option_arrows(
                ax,
                passer_point,
                selected_point,
                best_point,
                option_by_id,
                show_all=show_all_option_arrows,
                show_best=show_best_option_arrow,
            )
        elif not at_pass_frame:
            ax.text(
                0.5,
                0.025,
                "Comparison arrows are shown only at the provider pass frame.",
                transform=ax.transAxes,
                ha="center",
                va="bottom",
                color="#d0e8df",
                fontsize=8.2,
                zorder=30,
            )

        view_bounds = self._set_view_bounds(
            ax,
            pitch,
            view_mode,
            [
                passer_point,
                selected_point,
                best_point,
                highlighted_point,
                ball_point,
            ],
        )
        self._draw_role_markers(
            pitch,
            ax,
            passer_point=passer_point,
            selected_point=selected_point,
            best_point=best_point,
            highlighted_point=highlighted_point,
            ball_point=ball_point,
        )
        if show_ball_trail:
            self._draw_ball_trail(pitch, ax, decision_id, frame)
        self._draw_compact_labels(
            ax,
            self._label_specs(
                payload.passer,
                payload.players,
                option_ids,
                show_names=show_names,
                show_ids=show_ids,
                show_option_labels=show_option_labels,
                show_defender_labels=show_defender_labels,
                attacking_team_id=summary.team_id,
            ),
            [self._point(player) for player in payload.players] + [ball_point],
            arrow_segments,
            view_bounds,
        )
        if show_provider_peak_context:
            self._draw_provider_peak_context(ax, options, highlight_option_id)
        ax.set_title(
            f"{summary.match_name} · {summary.match_clock} · frame {frame} "
            f"({payload.frame_offset_from_pass:+d})",
            color="#f8fffc",
            fontsize=12.2,
            fontweight="bold",
            pad=14,
        )
        subtitle = (
            f"{summary.passer_name} → {summary.selected_receiver_name} · "
            f"same-frame margin {summary.same_frame_margin if summary.same_frame_margin is not None else 'unavailable'} · "
            f"{summary.review_classification.replace('_', ' ')}"
        )
        ax.text(
            0.5,
            1.005,
            subtitle,
            transform=ax.transAxes,
            ha="center",
            va="bottom",
            color="#c6ddd4",
            fontsize=8.3,
        )
        buffer = StringIO()
        fig.savefig(buffer, format="svg", bbox_inches="tight", facecolor=fig.get_facecolor())
        plt.close(fig)
        return buffer.getvalue()

    @staticmethod
    def _scatter_group(
        pitch: Pitch,
        ax: Axes,
        players: list[TrackedObject],
        color: str,
        size: int,
        *,
        alpha: float,
    ) -> None:
        coordinates = [PitchRenderer._point(player) for player in players]
        valid = [point for point in coordinates if point is not None]
        if valid:
            pitch.scatter(
                [point[0] for point in valid],
                [point[1] for point in valid],
                ax=ax,
                s=size,
                color=color,
                edgecolors="#09251e",
                linewidth=0.8,
                alpha=alpha,
                marker="o",
                zorder=5,
            )

    @staticmethod
    def _draw_arrow(
        ax: Axes,
        start: tuple[float, float],
        end: tuple[float, float],
        *,
        color: str,
        linestyle: str | tuple[int, tuple[int, int]],
        linewidth: float,
        alpha: float,
    ) -> None:
        arrow = FancyArrowPatch(
            start,
            end,
            arrowstyle="-|>",
            mutation_scale=14,
            shrinkA=8,
            shrinkB=12,
            linewidth=linewidth,
            linestyle=linestyle,
            color=color,
            alpha=alpha,
            zorder=7,
        )
        ax.add_patch(arrow)

    @classmethod
    def _draw_option_arrows(
        cls,
        ax: Axes,
        passer_point: tuple[float, float],
        selected_point: tuple[float, float] | None,
        best_point: tuple[float, float] | None,
        option_by_id: dict[str, object],
        *,
        show_all: bool,
        show_best: bool,
    ) -> list[tuple[tuple[float, float], tuple[float, float]]]:
        segments: list[tuple[tuple[float, float], tuple[float, float]]] = []
        if selected_point is not None:
            cls._draw_arrow(
                ax,
                passer_point,
                selected_point,
                color="#f7fbf9",
                linestyle="-",
                linewidth=2.55,
                alpha=0.98,
            )
            segments.append((passer_point, selected_point))
        if best_point is not None and best_point != selected_point and show_best:
            cls._draw_arrow(
                ax,
                passer_point,
                best_point,
                color="#f7c867",
                linestyle=(0, (4, 3)),
                linewidth=2.35,
                alpha=0.98,
            )
            segments.append((passer_point, best_point))
        rows = list(option_by_id.values())
        for row in rows:
            if not bool(getattr(row, "same_frame_option_valid", False)):
                continue
            is_selected = bool(getattr(row, "is_selected", False))
            rank = getattr(row, "same_frame_receiver_xt_rank", None)
            is_best = rank == 1
            if not show_all or is_selected or is_best:
                continue
            x = _optional_float(getattr(row, "receiver_x", None))
            y = _optional_float(getattr(row, "receiver_y", None))
            if x is None or y is None:
                continue
            point = (x, y)
            cls._draw_arrow(
                ax,
                passer_point,
                point,
                color="#9abbb0",
                linestyle=(0, (1, 3)),
                linewidth=1.0,
                alpha=0.42,
            )
            segments.append((passer_point, point))
        return segments

    @staticmethod
    def _draw_role_markers(
        pitch: Pitch,
        ax: Axes,
        *,
        passer_point: tuple[float, float] | None,
        selected_point: tuple[float, float] | None,
        best_point: tuple[float, float] | None,
        highlighted_point: tuple[float, float] | None,
        ball_point: tuple[float, float] | None,
    ) -> None:
        attacking_fill = "#82c7b8"
        if passer_point is not None:
            pitch.scatter(
                [passer_point[0]],
                [passer_point[1]],
                ax=ax,
                s=210,
                color=attacking_fill,
                edgecolors="#ff9f43",
                linewidth=3.2,
                marker="o",
                zorder=12,
            )
        if selected_point is not None:
            pitch.scatter(
                [selected_point[0]],
                [selected_point[1]],
                ax=ax,
                s=224,
                color=attacking_fill,
                edgecolors="#ffffff",
                linewidth=3.0,
                marker="o",
                zorder=13,
            )
        if best_point is not None:
            is_selected = best_point == selected_point
            pitch.scatter(
                [best_point[0]],
                [best_point[1]],
                ax=ax,
                s=330 if is_selected else 224,
                facecolors="none" if is_selected else attacking_fill,
                edgecolors="#f7c867",
                linewidth=2.9,
                marker="o",
                zorder=14,
            )
        if highlighted_point is not None:
            pitch.scatter(
                [highlighted_point[0]],
                [highlighted_point[1]],
                ax=ax,
                s=465,
                facecolors="none",
                edgecolors="#f4fffb",
                linewidth=1.8,
                marker="o",
                zorder=15,
            )
        if ball_point is not None:
            pitch.scatter(
                [ball_point[0]],
                [ball_point[1]],
                ax=ax,
                s=116,
                color="#f9faf7",
                edgecolors="#07110f",
                linewidth=3.2,
                marker="o",
                zorder=16,
            )
            pitch.scatter(
                [ball_point[0]],
                [ball_point[1]],
                ax=ax,
                s=18,
                color="#0f1f1b",
                edgecolors="none",
                marker="o",
                zorder=17,
            )
    @staticmethod
    def _set_view_bounds(
        ax: Axes,
        pitch: Pitch,
        view_mode: str,
        points: list[tuple[float, float] | None],
    ) -> tuple[float, float, float, float]:
        full_bounds = (
            float(pitch.dim.left),
            float(pitch.dim.right),
            float(pitch.dim.bottom),
            float(pitch.dim.top),
        )
        if view_mode == "full":
            return full_bounds
        focus = [point for point in points if point is not None]
        if not focus:
            return full_bounds
        left, right, bottom, top = full_bounds
        min_x, max_x = min(point[0] for point in focus), max(point[0] for point in focus)
        min_y, max_y = min(point[1] for point in focus), max(point[1] for point in focus)
        width = max(30.0, max_x - min_x + 16.0)
        height = max(19.0, max_y - min_y + 14.0)
        aspect = 12.5 / 7.8
        if width / height < aspect:
            width = height * aspect
        else:
            height = width / aspect
        width, height = min(width, right - left), min(height, top - bottom)
        center_x, center_y = (min_x + max_x) / 2, (min_y + max_y) / 2
        center_x = min(max(center_x, left + width / 2), right - width / 2)
        center_y = min(max(center_y, bottom + height / 2), top - height / 2)
        bounds = (
            center_x - width / 2,
            center_x + width / 2,
            center_y - height / 2,
            center_y + height / 2,
        )
        ax.set_xlim(bounds[0], bounds[1])
        ax.set_ylim(bounds[2], bounds[3])
        return bounds

    @staticmethod
    def _label_specs(
        passer: TrackedObject | None,
        players: list[TrackedObject],
        option_ids: dict[int, str],
        *,
        show_names: bool,
        show_ids: bool,
        show_option_labels: bool,
        show_defender_labels: bool,
        attacking_team_id: int,
    ) -> list[tuple[str, tuple[float, float]]]:
        specs: list[tuple[str, tuple[float, float]]] = []
        labelled_ids: set[int] = set()

        def add(label: str, player: TrackedObject | None) -> None:
            point = PitchRenderer._point(player)
            if point is None:
                return
            specs.append((label, point))
            if player is not None and player.player_id is not None:
                labelled_ids.add(player.player_id)

        if passer is not None:
            add(f"Passer · {passer.name or passer.player_id}", passer)
        for player in players:
            if not player.is_selected_receiver:
                continue
            role = "Selected + best" if player.is_best_same_frame_option else "Selected"
            add(f"{role} · {player.name or player.player_id}", player)
        for player in players:
            if player.is_best_same_frame_option and not player.is_selected_receiver:
                add(f"Best · {player.name or player.player_id}", player)
        if show_option_labels:
            for player in players:
                if player.player_id not in option_ids or player.player_id in labelled_ids:
                    continue
                add(f"Option · {player.name or player.player_id}", player)
        if show_names or show_ids:
            for player in players:
                if player.player_id in labelled_ids:
                    continue
                if player.team_id != attacking_team_id and not show_defender_labels:
                    continue
                label = PitchRenderer._label(player, show_names, show_ids)
                if label is not None:
                    add(label, player)
        return specs

    @staticmethod
    def _draw_compact_labels(
        ax: Axes,
        specs: list[tuple[str, tuple[float, float]]],
        protected_points: list[tuple[float, float] | None],
        arrow_segments: list[tuple[tuple[float, float], tuple[float, float]]],
        bounds: tuple[float, float, float, float],
    ) -> None:
        occupied: list[tuple[float, float, float, float]] = []
        valid_points = [point for point in protected_points if point is not None]
        candidates = (
            (0.0, 5.2),
            (0.0, -5.2),
            (6.7, 4.2),
            (-6.7, 4.2),
            (7.4, -4.1),
            (-7.4, -4.1),
            (9.0, 0.0),
            (-9.0, 0.0),
        )
        left, right, bottom, top = bounds
        for index, (label, point) in enumerate(specs):
            half_width = min(12.0, max(4.8, 1.2 + len(label) * 0.38))
            half_height = 1.65
            best: tuple[float, float, float, float, tuple[float, float, float, float]] | None = None
            for dx, dy in candidates:
                center_x, center_y = point[0] + dx, point[1] + dy
                box = (
                    center_x - half_width,
                    center_x + half_width,
                    center_y - half_height,
                    center_y + half_height,
                )
                if box[0] < left or box[1] > right or box[2] < bottom or box[3] > top:
                    continue
                score = sum(100 for other in occupied if PitchRenderer._boxes_intersect(box, other))
                score += sum(
                    12
                    for other in valid_points
                    if other != point and PitchRenderer._point_in_box(other, box, 1.25)
                )
                score += sum(
                    24
                    for start, end in arrow_segments
                    if PitchRenderer._segment_hits_box(start, end, box)
                )
                distance_penalty = abs(dx) + abs(dy)
                candidate = (score, distance_penalty, center_x, center_y, box)
                if best is None or candidate[:2] < best[:2]:
                    best = candidate
            if best is None or (index >= 3 and best[0] > 0):
                continue
            _, _, center_x, center_y, box = best
            ax.annotate(
                label,
                point,
                xytext=(center_x, center_y),
                textcoords="data",
                ha="center",
                va="center",
                color="#f5fff9",
                fontsize=7.15,
                zorder=24,
                annotation_clip=True,
                bbox={
                    "boxstyle": "round,pad=0.24",
                    "facecolor": "#07110f",
                    "alpha": 0.94,
                    "edgecolor": "#52756a",
                    "linewidth": 0.55,
                },
                arrowprops={
                    "arrowstyle": "-",
                    "color": "#90b4a6",
                    "linewidth": 0.55,
                    "shrinkA": 1,
                    "shrinkB": 7,
                },
            )
            occupied.append(box)

    @staticmethod
    def _boxes_intersect(
        left: tuple[float, float, float, float], right: tuple[float, float, float, float]
    ) -> bool:
        return (
            left[0] < right[1] and left[1] > right[0] and left[2] < right[3] and left[3] > right[2]
        )

    @staticmethod
    def _point_in_box(
        point: tuple[float, float], box: tuple[float, float, float, float], padding: float
    ) -> bool:
        return (
            box[0] - padding <= point[0] <= box[1] + padding
            and box[2] - padding <= point[1] <= box[3] + padding
        )

    @staticmethod
    def _segment_hits_box(
        start: tuple[float, float],
        end: tuple[float, float],
        box: tuple[float, float, float, float],
    ) -> bool:
        return any(
            PitchRenderer._point_in_box(
                (
                    start[0] + (end[0] - start[0]) * fraction / 24,
                    start[1] + (end[1] - start[1]) * fraction / 24,
                ),
                box,
                0.3,
            )
            for fraction in range(25)
        )

    def _draw_ball_trail(self, pitch: Pitch, ax: Axes, decision_id: str, frame: int) -> None:
        trail = []
        for candidate in range(frame - 8, frame + 1):
            try:
                payload = self.repository.frame(decision_id, candidate)
            except (
                Exception
            ):  # Source frame gaps are presentation-unavailable, not an analytical failure.
                continue
            point = self._point(payload.ball)
            if point is not None:
                trail.append(point)
        if len(trail) > 1:
            pitch.lines(
                [point[0] for point in trail[:-1]],
                [point[1] for point in trail[:-1]],
                [point[0] for point in trail[1:]],
                [point[1] for point in trail[1:]],
                ax=ax,
                color="#f9faf9",
                lw=1.25,
                alpha=0.42,
                zorder=6,
            )

    @staticmethod
    def _draw_provider_peak_context(
        ax: Axes, options: pd.DataFrame, highlight_option_id: str | None
    ) -> None:
        """Show timing context without pretending peak-frame positions are this frame's positions."""
        rows = list(options.itertuples(index=False))
        selected = next((row for row in rows if bool(getattr(row, "is_selected", False))), None)
        highlighted = next(
            (row for row in rows if str(getattr(row, "option_id", "")) == highlight_option_id),
            None,
        )
        lines = ["Provider peak context"]
        for label, row in (("Selected", selected), ("Highlighted", highlighted)):
            if row is None or (label == "Highlighted" and row is selected):
                continue
            peak = _optional_int(getattr(row, "provider_peak_frame", None))
            offset = _optional_int(getattr(row, "provider_peak_offset_frames", None))
            if peak is None:
                lines.append(f"{label}: peak unavailable")
            else:
                offset_text = "" if offset is None else f" ({offset:+d} frames)"
                lines.append(f"{label}: frame {peak}{offset_text}")
        lines.append("Peak positions are not overlaid here.")
        ax.text(
            0.988,
            0.99,
            "\n".join(lines),
            transform=ax.transAxes,
            ha="right",
            va="top",
            color="#f8fffc",
            fontsize=7.3,
            zorder=25,
            bbox={
                "boxstyle": "round,pad=0.4",
                "facecolor": "#21566a",
                "alpha": 0.94,
                "edgecolor": "#b9e9f2",
                "linewidth": 0.4,
            },
        )
