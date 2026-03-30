"""Tests for regime_detector.py -- BEAD-004 regime break detection."""

import sys
import time
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import regime_detector
from regime_detector import RegimeEvent, detect, reset_cooldowns


def _make_state(series_id, current, mean, stddev=None, samples=1):
    """Build a single macro state entry for testing."""
    return {
        series_id: {
            "current": current,
            "rolling_30d_mean": mean,
            "rolling_30d_stddev": stddev,
            "rolling_30d_samples": samples,
        }
    }


class TestPercentageThreshold:
    def setup_method(self):
        reset_cooldowns()

    def test_fires_on_50pct_brent_move(self):
        """A 50% Brent move should trigger a regime event."""
        state = _make_state("BRENT_SPOT", 113.0, 72.5, stddev=None, samples=1)
        events = detect(state)
        assert len(events) == 1
        assert events[0].variable == "brent_crude"
        assert events[0].current == 113.0
        assert events[0].baseline == 72.5
        assert events[0].change_pct > 50
        assert events[0].sigma is None  # insufficient history for sigma

    def test_no_fire_on_10pct_move(self):
        """A 10% move should NOT trigger (below 15% threshold)."""
        state = _make_state("BRENT_SPOT", 79.75, 72.5, stddev=None, samples=1)
        events = detect(state)
        assert len(events) == 0

    def test_fires_on_exactly_15pct(self):
        """A 15% move should trigger (threshold is >=15)."""
        state = _make_state("BRENT_SPOT", 83.375, 72.5, stddev=None, samples=1)
        events = detect(state)
        assert len(events) == 1

    def test_fires_on_negative_move(self):
        """A negative move exceeding threshold should also fire."""
        state = _make_state("BRENT_SPOT", 55.0, 72.5, stddev=None, samples=1)
        events = detect(state)
        assert len(events) == 1
        assert events[0].change_pct < 0


class TestSigmaThreshold:
    def setup_method(self):
        reset_cooldowns()

    def test_fires_on_2_sigma_with_enough_samples(self):
        """With enough history, a 2+ sigma move should fire."""
        state = _make_state("GOLD", 3200.0, 3000.0, stddev=80.0, samples=30)
        events = detect(state)
        assert len(events) == 1
        assert events[0].sigma is not None
        assert abs(events[0].sigma) >= 2.0

    def test_no_sigma_fire_with_insufficient_samples(self):
        """With fewer than MIN_SAMPLES_FOR_SIGMA, sigma should be None."""
        # 10% move (below pct threshold), 3 sigma but only 3 samples
        state = _make_state("GOLD", 3100.0, 3000.0, stddev=20.0, samples=3)
        events = detect(state)
        # 3.3% move, below pct threshold; sigma ignored due to low samples
        assert len(events) == 0

    def test_sigma_ignored_when_stddev_zero(self):
        """When stddev is 0, sigma should not be computed."""
        state = _make_state("BRENT_SPOT", 113.0, 72.5, stddev=0, samples=30)
        events = detect(state)
        assert len(events) == 1
        assert events[0].sigma is None  # stddev was 0

    def test_sigma_ignored_when_stddev_none(self):
        """When stddev is None, sigma should not be computed."""
        state = _make_state("BRENT_SPOT", 113.0, 72.5, stddev=None, samples=30)
        events = detect(state)
        assert len(events) == 1
        assert events[0].sigma is None


class TestCooldown:
    def setup_method(self):
        reset_cooldowns()

    def test_second_fire_within_cooldown_suppressed(self):
        """Same variable should not fire twice within cooldown window."""
        state = _make_state("BRENT_SPOT", 113.0, 72.5)
        events1 = detect(state)
        assert len(events1) == 1

        events2 = detect(state)
        assert len(events2) == 0

    def test_fires_again_after_cooldown_expires(self):
        """After cooldown expires, the variable should fire again."""
        state = _make_state("BRENT_SPOT", 113.0, 72.5)
        events1 = detect(state)
        assert len(events1) == 1

        # Simulate cooldown expiry
        regime_detector._cooldowns["brent_crude"] = time.time() - 5 * 3600
        events2 = detect(state)
        assert len(events2) == 1

    def test_different_variables_have_independent_cooldowns(self):
        """Cooldown on one variable should not affect another."""
        state = {
            **_make_state("BRENT_SPOT", 113.0, 72.5),
            **_make_state("GOLD", 3600.0, 3000.0, stddev=None, samples=1),
        }
        events = detect(state)
        assert len(events) == 2
        fired_vars = {e.variable for e in events}
        assert "brent_crude" in fired_vars
        assert "gold" in fired_vars


class TestAffectedTickers:
    def setup_method(self):
        reset_cooldowns()

    def test_brent_event_includes_oil_tickers(self):
        """Brent regime event should list oil-exposed tickers."""
        state = _make_state("BRENT_SPOT", 113.0, 72.5)
        events = detect(state)
        assert len(events) == 1
        tickers = [t["ticker"] for t in events[0].affected_tickers]
        assert "WDS" in tickers
        assert "STO" in tickers

    def test_gold_event_includes_gold_miners(self):
        """Gold regime event should list gold mining tickers."""
        state = _make_state("GOLD", 3600.0, 3000.0)
        events = detect(state)
        assert len(events) == 1
        tickers = [t["ticker"] for t in events[0].affected_tickers]
        assert "NST" in tickers
        assert "EVN" in tickers
        assert "OBM" in tickers


class TestRegimeEventStructure:
    def setup_method(self):
        reset_cooldowns()

    def test_event_has_all_required_fields(self):
        """RegimeEvent should have all fields needed by POST /api/regime/refresh."""
        state = _make_state("BRENT_SPOT", 113.0, 72.5, stddev=5.0, samples=30)
        events = detect(state)
        assert len(events) == 1
        e = events[0]
        assert isinstance(e.variable, str)
        assert isinstance(e.current, float)
        assert isinstance(e.baseline, float)
        assert isinstance(e.change_pct, float)
        assert isinstance(e.timestamp, float)
        assert isinstance(e.affected_tickers, list)
        assert e.variable == "brent_crude"

    def test_event_is_frozen(self):
        """RegimeEvent should be immutable."""
        state = _make_state("BRENT_SPOT", 113.0, 72.5)
        events = detect(state)
        try:
            events[0].current = 999.0
            assert False, "Should have raised FrozenInstanceError"
        except AttributeError:
            pass


class TestEdgeCases:
    def setup_method(self):
        reset_cooldowns()

    def test_empty_state_returns_no_events(self):
        """Empty macro state should produce no events."""
        events = detect({})
        assert events == []

    def test_null_current_skipped(self):
        """Variable with null current should be skipped."""
        state = {"BRENT_SPOT": {"current": None, "rolling_30d_mean": 72.5,
                                "rolling_30d_stddev": None, "rolling_30d_samples": 1}}
        events = detect(state)
        assert events == []

    def test_zero_mean_skipped(self):
        """Variable with zero mean should be skipped (avoid division by zero)."""
        state = _make_state("BRENT_SPOT", 50.0, 0, stddev=None, samples=1)
        events = detect(state)
        assert events == []

    def test_unmapped_state_key_ignored(self):
        """State keys not in the sensitivity map should be ignored."""
        state = {"UNKNOWN_SERIES": {"current": 100, "rolling_30d_mean": 50,
                                     "rolling_30d_stddev": None, "rolling_30d_samples": 1}}
        events = detect(state)
        assert events == []
