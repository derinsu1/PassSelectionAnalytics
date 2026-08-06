from fastapi.testclient import TestClient
from pass_selection.api.app import create_app


def test_public_runtime_serves_committed_data_and_excludes_diagnostics() -> None:
    client = TestClient(create_app())

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["application"] == "Pass Selection Analytics"
    assert health.json()["counts"] == {"decisions": 7029, "options": 16697, "review_candidates": 383}
    assert client.get("/api/diagnostics").status_code == 404

    metadata = client.get("/api/metadata")
    assert metadata.status_code == 200
    assert len(metadata.json()["filter_options"]["matches"]) == 10

    reviews = client.get("/api/reviews", params={"page_size": 1})
    assert reviews.status_code == 200
    decision_id = reviews.json()["items"][0]["decision_id"]

    detail = client.get(f"/api/decisions/{decision_id}")
    assert detail.status_code == 200
    assert detail.json()["option_count"] == 10
    assert any("Local xPass v1" in definition for definition in detail.json()["metric_definitions"])
    assert any("Pass Viability Index v2" in definition for definition in detail.json()["metric_definitions"])
    assert "model_version" not in detail.json()["selected_receiver"]["local_xpass"]

    playback = client.get(f"/api/decisions/{decision_id}/playback", params={"window": 2})
    assert playback.status_code == 200
    assert playback.json()["frames"]

    players = client.get("/api/player-stats")
    assert players.status_code == 200
    assert players.json()["items"]


def test_public_exports_use_the_committed_population() -> None:
    client = TestClient(create_app())
    response = client.post(
        "/api/exports",
        json={
            "scope": "review_explorer",
            "format": "json",
            "review_filters": {"review_candidate": True},
        },
    )
    assert response.status_code == 200
    assert response.json()["data"]["reviews"]
