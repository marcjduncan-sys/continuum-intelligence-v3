"""Tests for workstation extraction endpoint (BEAD-W019)."""
import copy
import json
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Fixture: load BHP.json from repo root
# ---------------------------------------------------------------------------

_BHP_PATH = Path(__file__).parents[2] / "data" / "workstation" / "BHP.json"


def _load_bhp() -> dict:
    with open(_BHP_PATH, encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------
# Helpers for constructing minimal valid payloads
# ---------------------------------------------------------------------------

def _minimal_payload() -> dict:
    """Return a minimal valid payload for targeted mutation tests."""
    return {
        "schema_version": "1.0.0",
        "generated_at": "2026-04-02T00:00:00Z",
        "identity": {"ticker": "BHP", "company_name": "BHP Group", "exchange": "ASX: BHP", "sector": "Mining", "updated_date": "2026-04-02"},
        "verdict": {"rating": "Accumulate", "skew": "Moderate upside", "confidence_pct": 76},
        "decision_strip": {
            "spot_price": {"value": 52.56, "currency": "A$", "subtitle": "Anchor."},
            "base_case": {"value": 56.0, "currency": "A$", "subtitle": "Base."},
            "bull_case": {"value": 63.0, "currency": "A$", "subtitle": "Bull."},
            "bear_case": {"value": 44.0, "currency": "A$", "subtitle": "Bear."},
            "forward_yield": {"display_value": "3.7% - 4.0%", "yield_low_pct": 3.7, "yield_high_pct": 4.0, "subtitle": "Yield."},
            "key_lever": {"value": "Copper", "subtitle": "Drives rerating."},
            "next_catalyst": {"value": "China + copper", "subtitle": "Next 90 days."},
        },
        "summary": {
            "bottom_line": "Market missing copper mix shift.",
            "why_now": "Copper contributed 51% of H1 EBITDA.",
            "decision_rule": "Own while iron ore above US$90/t.",
            "what_matters_most": "1. China. 2. Escondida. 3. Copper price.",
        },
        "watchlist": [
            {"label": "Risk 1", "description": "Iron ore fall.", "severity": "High"},
            {"label": "Risk 2", "description": "China stimulus.", "severity": "Medium"},
            {"label": "Support", "description": "Dividend support.", "severity": "Supportive"},
        ],
        "thesis": {
            "headline": "BHP is no longer just an iron ore play.",
            "bluf": "At A$52.56 the market is paying for cash flow, not copper mix.",
            "narrative": "What changed is earnings mix.",
            "decision_frame_conditions": ["Iron ore above US$90/t.", "Copper guidance met."],
        },
        "scenarios": [
            {"case_name": "Bull", "probability": 0.25, "target_price": 63.0, "currency": "A$", "description": "Copper rerates.", "style": "bull"},
            {"case_name": "Base", "probability": 0.45, "target_price": 56.0, "currency": "A$", "description": "Status quo.", "style": "base"},
            {"case_name": "Bear", "probability": 0.30, "target_price": 44.0, "currency": "A$", "description": "Iron ore falls.", "style": "bear"},
        ],
        "valuation": {
            "headline": "Iron ore drives the fastest swing; copper carries multiple support.",
            "bridge": [
                {"label": "Bear", "price": 44.0, "currency": "A$", "style": "bad", "value_class": "neg"},
                {"label": "Base", "price": 56.0, "currency": "A$", "style": "base", "value_class": "neu"},
                {"label": "Bull", "price": 63.0, "currency": "A$", "style": "good", "value_class": "pos"},
            ],
            "narrative": "Iron ore sets the floor, copper sets the multiple.",
            "sensitivities": [
                {"driver": "Iron ore", "base_deck": "US$95/t", "sensitivity_range": "± US$10/t", "equity_effect": "± A$4.20", "rationale": "Largest near-term swing."},
            ],
            "footnote": "House model framing only.",
        },
        "risks": {
            "headline": "Thesis fails if both legs disappoint simultaneously.",
            "items": [
                {"risk": "China miss", "impact": "High", "probability": "Medium", "decision_relevance": "Breaks iron ore floor."},
                {"risk": "Escondida miss", "impact": "High", "probability": "Low-Medium", "decision_relevance": "Kills copper rerating case."},
                {"risk": "Cost inflation", "impact": "Medium", "probability": "Medium", "decision_relevance": "Noise unless coinciding with price fall."},
            ],
        },
        "evidence": {
            "headline": "Evidence supports the long case on delivery and capital discipline.",
            "items": [
                {"category": "Observed", "text": "H1 FY26 copper 51% of EBITDA.", "quality": "High quality"},
                {"category": "Inference", "text": "Market underweights copper mix.", "quality": "Needs market proof"},
                {"category": "Tripwire", "text": "Iron ore below US$90/t is the cut signal.", "quality": "Critical"},
            ],
        },
        "revisions": {
            "headline": "Copper thesis strengthened since last review.",
            "items": [
                {"item": "Copper mix", "previous_view": "Important", "current_view": "Primary lever", "direction": "positive", "rationale": "EBITDA mix confirms it."},
                {"item": "EWP", "previous_view": "A$54.20", "current_view": "A$56.55", "direction": "positive", "rationale": "Higher copper confidence."},
                {"item": "China read", "previous_view": "Sentiment only", "current_view": "Potential support", "direction": "neutral", "rationale": "Needs tonnage proof."},
            ],
        },
        "deep_research": {
            "headline": "BHP can fund copper growth without financial fragility.",
            "paragraphs": [
                "Strategic attraction: future-facing without becoming fragile.",
                "Escondida is the central proof-point for volume and margin.",
                "China is the near-term swing variable, not the foundation.",
            ],
        },
        "quality": {
            "headline": "BHP behaves like a disciplined allocator.",
            "tiles": [
                {"label": "EBITDA margin", "headline_value": "58%", "description": "Strong operating leverage."},
                {"label": "Payout ratio", "headline_value": "60%", "description": "Capital returns intact."},
                {"label": "Net debt", "headline_value": "US$14.7bn", "description": "Inside target range."},
                {"label": "Copper share", "headline_value": "51%", "description": "Mix shift confirmed."},
            ],
            "chart": {
                "series": [
                    {"label": "EBITDA margin %", "colour": "#2563EB", "datapoints": [{"period": "H1 FY25", "value": 55}, {"period": "H1 FY26", "value": 58}]},
                ]
            },
        },
        "chat_seed": {
            "stats": [
                {"label": "Rating", "value": "Accumulate"},
                {"label": "EWP", "value": "A$56.55"},
                {"label": "Confidence", "value": "76%"},
            ],
            "messages": [
                {
                    "role": "analyst",
                    "timestamp": "09:15",
                    "tag": {"text": "Copper mix", "colour": "blue"},
                    "thread_label": "Earnings quality",
                    "body": "Copper generated the largest share of H1 FY26 EBITDA. The market has not re-rated for this.",
                },
                {
                    "role": "pm",
                    "timestamp": "09:20",
                    "tag": {"text": "Position size", "colour": "green"},
                    "thread_label": "Sizing decision",
                    "body": "Own size. The downside is manageable with iron ore above US$90/t.",
                },
                {
                    "role": "strategist",
                    "timestamp": "09:25",
                    "tag": {"text": "China risk", "colour": "amber"},
                    "thread_label": "Macro overlay",
                    "body": "China stimulus is running ahead of tonnage. Watch for confirmation before adding.",
                },
                {
                    "role": "analyst",
                    "timestamp": "09:30",
                    "tag": {"text": "Catalyst", "colour": "violet"},
                    "thread_label": "Next event",
                    "body": "Next catalyst is FY26 copper guidance confirmation. Track vs 1.9-2.0 Mt.",
                },
            ],
            "suggested_question": "What would change the Accumulate rating to a Strong Buy?",
        },
    }


# ---------------------------------------------------------------------------
# Import validator (runs without network)
# ---------------------------------------------------------------------------

from extraction import validate_workstation_payload


# ---------------------------------------------------------------------------
# Validator tests
# ---------------------------------------------------------------------------

class TestValidateWorkstationPayload:

    def test_validate_valid_bhp_payload(self):
        """BHP.json fixture must pass validation with no errors."""
        payload = _load_bhp()
        valid, errors, warnings = validate_workstation_payload(payload)
        assert valid is True, f"Expected valid, got errors: {errors}"
        assert errors == []

    def test_validate_missing_required_fields(self):
        """Empty payload must report all required fields as missing."""
        valid, errors, _ = validate_workstation_payload({})
        assert valid is False
        missing_field_errors = [e for e in errors if "Missing required field" in e]
        # Every required field must appear in the error list
        for field in (
            "schema_version", "generated_at", "identity", "verdict",
            "decision_strip", "summary", "watchlist", "thesis",
            "scenarios", "valuation", "risks", "evidence",
            "revisions", "deep_research", "quality", "chat_seed",
        ):
            assert any(field in e for e in errors), (
                f"Expected error for missing field '{field}', got: {errors}"
            )

    def test_validate_bad_probability_sum(self):
        """Scenarios summing to 0.8 must return a probability sum error."""
        payload = _minimal_payload()
        payload["scenarios"] = [
            {"case_name": "Bull", "probability": 0.20, "target_price": 63.0, "currency": "A$", "description": "Up.", "style": "bull"},
            {"case_name": "Base", "probability": 0.40, "target_price": 56.0, "currency": "A$", "description": "Mid.", "style": "base"},
            {"case_name": "Bear", "probability": 0.20, "target_price": 44.0, "currency": "A$", "description": "Down.", "style": "bear"},
        ]
        valid, errors, _ = validate_workstation_payload(payload)
        assert valid is False
        assert any("sum" in e.lower() for e in errors), f"Expected sum error, got: {errors}"

    def test_validate_base_case_probability_too_low(self):
        """Base case with probability 0.20 must return an error."""
        payload = _minimal_payload()
        payload["scenarios"] = [
            {"case_name": "Bull", "probability": 0.25, "target_price": 63.0, "currency": "A$", "description": "Up.", "style": "bull"},
            {"case_name": "Base", "probability": 0.20, "target_price": 56.0, "currency": "A$", "description": "Mid.", "style": "base"},
            {"case_name": "Bear", "probability": 0.25, "target_price": 44.0, "currency": "A$", "description": "Down.", "style": "bear"},
            {"case_name": "Stress", "probability": 0.30, "target_price": 38.0, "currency": "A$", "description": "Crash.", "style": "stress"},
        ]
        valid, errors, _ = validate_workstation_payload(payload)
        assert valid is False
        assert any("0.35" in e or "0.20" in e or "base case" in e.lower() for e in errors), (
            f"Expected base case probability error, got: {errors}"
        )

    def test_validate_no_base_case(self):
        """Scenarios with no style='base' must return an error."""
        payload = _minimal_payload()
        payload["scenarios"] = [
            {"case_name": "Bull", "probability": 0.35, "target_price": 63.0, "currency": "A$", "description": "Up.", "style": "bull"},
            {"case_name": "Bear", "probability": 0.35, "target_price": 44.0, "currency": "A$", "description": "Down.", "style": "bear"},
            {"case_name": "Stress", "probability": 0.30, "target_price": 38.0, "currency": "A$", "description": "Crash.", "style": "stress"},
        ]
        valid, errors, _ = validate_workstation_payload(payload)
        assert valid is False
        assert any("base case" in e.lower() for e in errors), (
            f"Expected 'base case' error, got: {errors}"
        )

    def test_validate_non_base_exceeds_30pct(self):
        """Non-base scenario with probability 0.40 must return an error."""
        payload = _minimal_payload()
        payload["scenarios"] = [
            {"case_name": "Bull", "probability": 0.40, "target_price": 63.0, "currency": "A$", "description": "Up.", "style": "bull"},
            {"case_name": "Base", "probability": 0.40, "target_price": 56.0, "currency": "A$", "description": "Mid.", "style": "base"},
            {"case_name": "Bear", "probability": 0.20, "target_price": 44.0, "currency": "A$", "description": "Down.", "style": "bear"},
        ]
        valid, errors, _ = validate_workstation_payload(payload)
        assert valid is False
        assert any("0.30" in e or "exceeding" in e.lower() for e in errors), (
            f"Expected non-base probability error, got: {errors}"
        )

    def test_validate_bad_verdict_rating(self):
        """Unknown verdict rating must return an error."""
        payload = _minimal_payload()
        payload["verdict"]["rating"] = "UNKNOWN_RATING"
        valid, errors, _ = validate_workstation_payload(payload)
        assert valid is False
        assert any("verdict.rating" in e for e in errors), (
            f"Expected verdict.rating error, got: {errors}"
        )

    def test_validate_bad_evidence_category(self):
        """Unknown evidence category must return an error."""
        payload = _minimal_payload()
        payload["evidence"]["items"][0]["category"] = "NotACategory"
        valid, errors, _ = validate_workstation_payload(payload)
        assert valid is False
        assert any("evidence.items" in e and "category" in e for e in errors), (
            f"Expected evidence category error, got: {errors}"
        )

    def test_validate_valid_scenarios_4_item(self):
        """Four-scenario set with valid probabilities must pass."""
        payload = _minimal_payload()
        payload["scenarios"] = [
            {"case_name": "Bull", "probability": 0.20, "target_price": 63.0, "currency": "A$", "description": "Up.", "style": "bull"},
            {"case_name": "Base", "probability": 0.45, "target_price": 56.0, "currency": "A$", "description": "Mid.", "style": "base"},
            {"case_name": "Bear", "probability": 0.25, "target_price": 44.0, "currency": "A$", "description": "Down.", "style": "bear"},
            {"case_name": "Stress", "probability": 0.10, "target_price": 38.0, "currency": "A$", "description": "Crash.", "style": "stress"},
        ]
        valid, errors, _ = validate_workstation_payload(payload)
        assert valid is True, f"Expected valid, got errors: {errors}"


# ---------------------------------------------------------------------------
# Endpoint tests with mocked Claude
# ---------------------------------------------------------------------------

from fastapi import FastAPI
from fastapi.testclient import TestClient
from extraction import router as extraction_router


def _make_test_app() -> FastAPI:
    """Create a minimal FastAPI app with only the extraction router registered."""
    app = FastAPI()
    app.include_router(extraction_router)
    return app


def _make_mock_response(payload: dict) -> MagicMock:
    """Build a mock Anthropic response containing a JSON payload."""
    content_block = MagicMock()
    content_block.text = json.dumps(payload)
    mock_response = MagicMock()
    mock_response.content = [content_block]
    return mock_response


class TestExtractionEndpoint:

    @pytest.fixture(autouse=True)
    def _client(self):
        self.client = TestClient(_make_test_app(), raise_server_exceptions=False)

    def test_endpoint_422_empty_ticker(self):
        """POST with ticker='' must return 422."""
        response = self.client.post(
            "/api/extract-workstation",
            json={"ticker": "", "source_text": "A" * 50},
        )
        assert response.status_code == 422

    def test_endpoint_422_empty_source_text(self):
        """POST with source_text='' must return 422."""
        response = self.client.post(
            "/api/extract-workstation",
            json={"ticker": "BHP", "source_text": ""},
        )
        assert response.status_code == 422

    def test_endpoint_returns_payload_on_valid_response(self):
        """Mock Claude returning BHP fixture JSON: endpoint returns 200 with payload."""
        bhp_payload = _load_bhp()
        mock_response = _make_mock_response(bhp_payload)

        with patch("extraction.config") as mock_config:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = mock_response
            mock_config.get_anthropic_client.return_value = mock_client
            mock_config.ANTHROPIC_MODEL = "claude-sonnet-4-6"

            response = self.client.post(
                "/api/extract-workstation",
                json={"ticker": "BHP", "source_text": "A" * 50},
            )

        assert response.status_code == 200
        returned = response.json()
        assert returned["schema_version"] == "1.0.0"
        assert returned["identity"]["ticker"] == "BHP"
        assert returned["verdict"]["rating"] == "Accumulate"
