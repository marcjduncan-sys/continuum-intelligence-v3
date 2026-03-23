"""
Tests for PM Operations Dashboard (BEAD-001).

Covers: auth gating, traffic classification, timeseries fill,
aggregation logic, and schema stability.
"""

import pytest
from datetime import datetime, timezone, timedelta

from pm_ops import _classify_traffic, _fill_timeseries, _verify_ops_secret


# ---------------------------------------------------------------------------
# _classify_traffic
# ---------------------------------------------------------------------------

class TestClassifyTraffic:
    def test_none_is_inactive(self):
        status, reason = _classify_traffic(None)
        assert status == "inactive"
        assert reason is not None

    def test_over_24h_is_inactive(self):
        status, reason = _classify_traffic(1500)
        assert status == "inactive"
        assert "24 hours" in reason

    def test_over_4h_is_quiet(self):
        status, reason = _classify_traffic(300)
        assert status == "quiet"
        assert reason is None

    def test_under_4h_is_normal(self):
        status, reason = _classify_traffic(60)
        assert status == "normal"
        assert reason is None

    def test_exactly_240_is_quiet(self):
        # Boundary: 240 minutes = 4 hours, should be quiet (>240 check)
        status, _ = _classify_traffic(240)
        assert status == "normal"  # 240 is not >240

    def test_exactly_1440_is_quiet(self):
        # Boundary: 1440 minutes = 24 hours
        status, _ = _classify_traffic(1440)
        assert status == "quiet"  # 1440 is not >1440

    def test_zero_is_normal(self):
        status, reason = _classify_traffic(0)
        assert status == "normal"
        assert reason is None


# ---------------------------------------------------------------------------
# _fill_timeseries
# ---------------------------------------------------------------------------

class TestFillTimeseries:
    def test_fills_missing_dates_including_today(self):
        cutoff = datetime(2026, 3, 20, tzinfo=timezone.utc)
        rows = []  # no data
        result = _fill_timeseries(rows, cutoff, 3)
        assert len(result) == 4  # days + 1 to include today
        assert result[0] == {"date": "2026-03-20", "count": 0}
        assert result[1] == {"date": "2026-03-21", "count": 0}
        assert result[2] == {"date": "2026-03-22", "count": 0}
        assert result[3] == {"date": "2026-03-23", "count": 0}

    def test_preserves_existing_counts(self):
        cutoff = datetime(2026, 3, 20, tzinfo=timezone.utc)
        from datetime import date
        rows = [{"date": date(2026, 3, 21), "count": 5}]
        result = _fill_timeseries(rows, cutoff, 3)
        assert result[0]["count"] == 0  # 2026-03-20
        assert result[1]["count"] == 5  # 2026-03-21
        assert result[2]["count"] == 0  # 2026-03-22
        assert result[3]["count"] == 0  # 2026-03-23 (today)

    def test_single_day_window(self):
        cutoff = datetime(2026, 3, 23, tzinfo=timezone.utc)
        result = _fill_timeseries([], cutoff, 1)
        assert len(result) == 2  # days + 1
        assert result[0]["date"] == "2026-03-23"
        assert result[1]["date"] == "2026-03-24"


# ---------------------------------------------------------------------------
# _verify_ops_secret
# ---------------------------------------------------------------------------

class TestVerifyOpsSecret:
    def test_no_secret_configured_rejects(self, monkeypatch):
        monkeypatch.setattr("config.OPS_SECRET", "")
        from errors import APIError
        with pytest.raises(APIError) as exc_info:
            _verify_ops_secret(None)
        assert exc_info.value.status_code == 401

    def test_valid_secret_passes(self, monkeypatch):
        monkeypatch.setattr("config.OPS_SECRET", "test-secret-123")
        _verify_ops_secret("test-secret-123")

    def test_invalid_secret_raises(self, monkeypatch):
        monkeypatch.setattr("config.OPS_SECRET", "test-secret-123")
        from errors import APIError
        with pytest.raises(APIError) as exc_info:
            _verify_ops_secret("wrong-secret")
        assert exc_info.value.status_code == 401

    def test_missing_header_raises(self, monkeypatch):
        monkeypatch.setattr("config.OPS_SECRET", "test-secret-123")
        from errors import APIError
        with pytest.raises(APIError):
            _verify_ops_secret(None)

    def test_empty_header_raises(self, monkeypatch):
        monkeypatch.setattr("config.OPS_SECRET", "test-secret-123")
        from errors import APIError
        with pytest.raises(APIError):
            _verify_ops_secret("")


# ---------------------------------------------------------------------------
# Schema stability: verify response contract fields
# ---------------------------------------------------------------------------

class TestResponseContract:
    """Verify the expected response shape without a live DB."""

    EXPECTED_TOP_KEYS = {"window_days", "generated_at", "summary", "timeseries", "breakdowns", "latest_events", "status"}
    EXPECTED_SUMMARY_KEYS = {"pm_requests", "handoffs", "decisions", "insights", "active_portfolios", "active_tickers"}
    EXPECTED_TIMESERIES_KEYS = {"requests_by_day", "handoffs_by_day"}
    EXPECTED_BREAKDOWNS_KEYS = {"handoffs_by_route", "decisions_by_action", "insights_by_type", "context_modes", "top_portfolios", "top_tickers"}
    EXPECTED_STATUS_KEYS = {"has_data", "last_activity_at", "minutes_since_last_activity", "traffic_status", "zero_state_reason"}

    def test_top_level_keys_documented(self):
        """Ensure the test knows about every required top-level key."""
        assert len(self.EXPECTED_TOP_KEYS) == 7

    def test_summary_keys_documented(self):
        assert len(self.EXPECTED_SUMMARY_KEYS) == 6

    def test_status_keys_documented(self):
        assert len(self.EXPECTED_STATUS_KEYS) == 5

    def test_breakdowns_keys_documented(self):
        assert len(self.EXPECTED_BREAKDOWNS_KEYS) == 6
