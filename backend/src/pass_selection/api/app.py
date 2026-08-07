from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse

from pass_selection.api.contracts import (
    AppliedReviewFilters,
    DecisionDetails,
    EntityOption,
    ErrorResponse,
    FramePayload,
    HealthResponse,
    MatchOption,
    MetadataResponse,
    PasserOption,
    PasserOriginSide,
    PasserOriginThird,
    PlaybackBundle,
    PlayerStatsDetailResponse,
    PlayerStatsDirectoryResponse,
    ReviewListResponse,
    ReviewNavigationResponse,
    TimelineResponse,
)
from pass_selection.api.exports import ExportRequest, ExportService
from pass_selection.api.pitch import RENDERING_VERSION, PitchRenderer
from pass_selection.api.repository import (
    MAX_TIMELINE_WINDOW,
    DecisionNotFoundError,
    FrameNotFoundError,
    PlayerNotFoundError,
    WorkbenchRepository,
)
from pass_selection.config import PROJECT_ROOT

SortBy = Literal[
    "minute",
    "team",
    "match",
    "margin",
    "selected_rank",
    "local_xpass",
    "pass_viability",
    "pass_viability_rank",
    "pass_viability_gap",
    "provider_choice",
    "provider_choice_rank",
    "passer",
    "classification",
]
SortDirection = Literal["asc", "desc"]
PlayerStatsSortBy = Literal[
    "minutes",
    "passes_per90",
    "completion_rate",
    "local_xpass",
    "availability",
    "pvi",
    "pvi_best_rate",
    "higher_open_xt_per90",
    "targets_per90",
    "target_completion_rate",
    "percentile",
]


def review_filters(
    match_id: int | None = None,
    team_id: int | None = None,
    passer_id: int | None = None,
    passer_origin_third: PasserOriginThird | None = None,
    passer_origin_side: PasserOriginSide | None = None,
    review_classification: str | None = None,
    review_candidate: bool | None = None,
    pass_outcome: str | None = None,
    selected_rank: Annotated[int | None, Query(ge=1, le=20)] = None,
    min_selected_rank: Annotated[int | None, Query(ge=1, le=20)] = None,
    max_selected_rank: Annotated[int | None, Query(ge=1, le=20)] = None,
    min_same_frame_margin: Annotated[float | None, Query(ge=0.0)] = None,
    max_same_frame_margin: Annotated[float | None, Query(ge=0.0)] = None,
    min_selected_pass_viability_score: Annotated[float | None, Query(ge=0.0, le=100.0)] = None,
    max_selected_pass_viability_score: Annotated[float | None, Query(ge=0.0, le=100.0)] = None,
    min_pass_viability_gap: Annotated[float | None, Query(ge=0.0, le=100.0)] = None,
    max_pass_viability_gap: Annotated[float | None, Query(ge=0.0, le=100.0)] = None,
    selected_pvi_not_best: bool | None = None,
    provider_agreement: bool | None = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
) -> AppliedReviewFilters:
    if (
        min_selected_rank is not None
        and max_selected_rank is not None
        and min_selected_rank > max_selected_rank
    ):
        raise ValueError("min_selected_rank cannot exceed max_selected_rank")
    if (
        min_same_frame_margin is not None
        and max_same_frame_margin is not None
        and min_same_frame_margin > max_same_frame_margin
    ):
        raise ValueError("min_same_frame_margin cannot exceed max_same_frame_margin")
    if (
        min_selected_pass_viability_score is not None
        and max_selected_pass_viability_score is not None
        and min_selected_pass_viability_score > max_selected_pass_viability_score
    ):
        raise ValueError("min_selected_pass_viability_score cannot exceed max_selected_pass_viability_score")
    if (
        min_pass_viability_gap is not None
        and max_pass_viability_gap is not None
        and min_pass_viability_gap > max_pass_viability_gap
    ):
        raise ValueError("min_pass_viability_gap cannot exceed max_pass_viability_gap")
    return AppliedReviewFilters(
        match_id=match_id,
        team_id=team_id,
        passer_id=passer_id,
        passer_origin_third=passer_origin_third,
        passer_origin_side=passer_origin_side,
        review_classification=review_classification,
        review_candidate=review_candidate,
        pass_outcome=pass_outcome,
        selected_rank=selected_rank,
        min_selected_rank=min_selected_rank,
        max_selected_rank=max_selected_rank,
        min_same_frame_margin=min_same_frame_margin,
        max_same_frame_margin=max_same_frame_margin,
        min_selected_pass_viability_score=min_selected_pass_viability_score,
        max_selected_pass_viability_score=max_selected_pass_viability_score,
        min_pass_viability_gap=min_pass_viability_gap,
        max_pass_viability_gap=max_pass_viability_gap,
        selected_pvi_not_best=selected_pvi_not_best,
        provider_agreement=provider_agreement,
        search=search,
    )


def create_app(repository: WorkbenchRepository | None = None) -> FastAPI:
    store = repository or WorkbenchRepository()
    renderer = PitchRenderer(store)
    app = FastAPI(
        title="Pass Selection Analytics API",
        version="1.0.0",
        description=(
            "Read-only access to the committed Pass Selection Analytics dataset. "
            "Same-frame values and provider peak-opportunity values remain explicitly separate."
        ),
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=500)

    @app.exception_handler(DecisionNotFoundError)
    async def decision_not_found(_: Request, error: DecisionNotFoundError) -> JSONResponse:
        payload = ErrorResponse(error="decision_not_found", message=str(error))
        return JSONResponse(status_code=404, content=payload.model_dump())

    @app.exception_handler(FrameNotFoundError)
    async def frame_not_found(_: Request, error: FrameNotFoundError) -> JSONResponse:
        payload = ErrorResponse(error="frame_not_found", message=str(error))
        return JSONResponse(status_code=404, content=payload.model_dump())

    @app.exception_handler(PlayerNotFoundError)
    async def player_not_found(_: Request, error: PlayerNotFoundError) -> JSONResponse:
        payload = ErrorResponse(error="player_not_found", message=str(error))
        return JSONResponse(status_code=404, content=payload.model_dump())

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_: Request, error: RequestValidationError) -> JSONResponse:
        payload = ErrorResponse(
            error="validation_error",
            message="One or more request parameters are invalid.",
            details=jsonable_encoder(error.errors()),
        )
        return JSONResponse(status_code=422, content=payload.model_dump())

    @app.exception_handler(ValueError)
    async def invalid_value(_: Request, error: ValueError) -> JSONResponse:
        payload = ErrorResponse(error="validation_error", message=str(error))
        return JSONResponse(status_code=422, content=payload.model_dump())

    @app.get("/api/health", response_model=HealthResponse, tags=["application"])
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            application="Pass Selection Analytics",
            artifact_source="Committed analytical tables and SkillCorner tracking used only for frame inspection.",
            counts=store.counts(),
        )

    @app.get("/api/metadata", response_model=MetadataResponse, tags=["metadata"])
    def metadata() -> MetadataResponse:
        return store.metadata()

    @app.get("/api/matches", response_model=list[MatchOption], tags=["metadata"])
    def matches(team_id: int | None = None) -> list[MatchOption]:
        return store.match_options(team_id=team_id)

    @app.get("/api/teams", response_model=list[EntityOption], tags=["metadata"])
    def teams(match_id: int | None = None) -> list[EntityOption]:
        return store.team_options(match_id=match_id)

    @app.get("/api/players", response_model=list[PasserOption], tags=["metadata"])
    def players(match_id: int | None = None, team_id: int | None = None) -> list[PasserOption]:
        return store.passer_options(match_id=match_id, team_id=team_id)

    @app.get("/api/player-stats", response_model=PlayerStatsDirectoryResponse, tags=["players"])
    def player_stats(
        match_id: int | None = None,
        team_id: int | None = None,
        search: Annotated[str | None, Query(max_length=120)] = None,
        hide_under_60: bool = True,
        position: Annotated[str | None, Query(max_length=80)] = None,
        percentile_metric: Annotated[str, Query(max_length=80)] = "pvi",
        min_percentile: Annotated[float | None, Query(ge=0.0, le=100.0)] = None,
        max_percentile: Annotated[float | None, Query(ge=0.0, le=100.0)] = None,
        sort_by: PlayerStatsSortBy = "minutes",
        sort_direction: SortDirection = "desc",
    ) -> PlayerStatsDirectoryResponse:
        return store.list_player_stats(
            match_id=match_id,
            team_id=team_id,
            search=search,
            hide_under_60=hide_under_60,
            position=position,
            percentile_metric=percentile_metric,
            min_percentile=min_percentile,
            max_percentile=max_percentile,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )

    @app.get(
        "/api/player-stats/{player_id}", response_model=PlayerStatsDetailResponse, tags=["players"]
    )
    def player_stats_detail(
        player_id: int, match_id: int | None = None, team_id: int | None = None
    ) -> PlayerStatsDetailResponse:
        return store.player_stats_detail(player_id, match_id, team_id)

    @app.get("/api/reviews", response_model=ReviewListResponse, tags=["reviews"])
    def reviews(
        filters: Annotated[AppliedReviewFilters, Depends(review_filters)],
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(ge=1, le=10_000)] = 50,
        sort_by: SortBy = "minute",
        sort_direction: SortDirection = "asc",
    ) -> ReviewListResponse:
        return store.list_reviews(filters, page, page_size, sort_by, sort_direction)

    @app.get("/api/review-navigation", response_model=ReviewNavigationResponse, tags=["reviews"])
    def review_navigation(
        filters: Annotated[AppliedReviewFilters, Depends(review_filters)],
        sort_by: SortBy = "minute",
        sort_direction: SortDirection = "asc",
    ) -> ReviewNavigationResponse:
        return store.review_navigation(filters, sort_by, sort_direction)

    @app.get(
        "/api/decisions/{decision_id}/timeline", response_model=TimelineResponse, tags=["decisions"]
    )
    def timeline(
        decision_id: str,
        window: Annotated[int, Query(ge=1, le=MAX_TIMELINE_WINDOW)] = 30,
    ) -> TimelineResponse:
        return store.timeline(decision_id, window)

    @app.get(
        "/api/decisions/{decision_id}/frame/{frame_number}",
        response_model=FramePayload,
        tags=["decisions"],
    )
    def frame(decision_id: str, frame_number: int) -> FramePayload:
        return store.frame(decision_id, frame_number)

    @app.get(
        "/api/decisions/{decision_id}/playback",
        response_model=PlaybackBundle,
        tags=["decisions"],
    )
    def playback(
        decision_id: str,
        window: Annotated[int, Query(ge=1, le=MAX_TIMELINE_WINDOW)] = 30,
    ) -> PlaybackBundle:
        return store.playback(decision_id, window)

    @app.get("/api/decisions/{decision_id}/pitch.svg", tags=["decisions"])
    def pitch(
        decision_id: str,
        frame: int | None = None,
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
    ) -> Response:
        selected_frame = frame
        if selected_frame is None:
            selected_frame = int(store.decision_series(decision_id).actual_pass_frame)
        result = renderer.render(
            decision_id,
            selected_frame,
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
        return Response(
            content=result.svg,
            media_type="image/svg+xml",
            headers={
                "Cache-Control": "private, max-age=300",
                "X-Pitch-Cache": "hit" if result.cache_hit else "miss",
                "X-Pitch-Rendering-Version": RENDERING_VERSION,
            },
        )

    @app.get("/api/decisions/{decision_id}", response_model=DecisionDetails, tags=["decisions"])
    def decision(decision_id: str) -> DecisionDetails:
        return store.decision_details(decision_id)

    @app.post("/api/exports", tags=["exports"])
    def export(request: ExportRequest) -> Response:
        """Create a download without persisting browser-local analyst notes."""

        result = ExportService(store).render(request)
        return Response(
            content=result.content,
            media_type=result.media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{result.filename}"',
                "Cache-Control": "no-store",
            },
        )

    dist = Path(PROJECT_ROOT) / "frontend" / "dist"
    if dist.is_dir():
        dist_root = dist.resolve()

        @app.get("/{full_path:path}", include_in_schema=False)
        def frontend(full_path: str) -> FileResponse:
            """Serve built assets directly and fall back to the React entry point for deep links."""

            if full_path == "api" or full_path.startswith("api/"):
                raise HTTPException(status_code=404, detail="Not Found")
            candidate = (dist_root / full_path).resolve()
            if candidate.is_relative_to(dist_root) and candidate.is_file():
                if full_path.startswith("assets/"):
                    cache_control = "public, max-age=31536000, immutable"
                elif full_path.startswith(("data/visual-assets/clubs/", "data/visual-assets/players/")):
                    cache_control = "public, max-age=604800, stale-while-revalidate=86400"
                else:
                    cache_control = "no-cache"
                return FileResponse(candidate, headers={"Cache-Control": cache_control})
            return FileResponse(dist_root / "index.html", headers={"Cache-Control": "no-cache"})
    return app


app = create_app()
