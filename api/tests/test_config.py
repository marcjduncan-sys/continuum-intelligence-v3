"""Tests for config centralisation (BEAD-004).

Validates that:
1. validate_config() fails for missing required vars in production
2. validate_config() warns (not fails) in dev
3. All config attributes are populated from env vars
4. Legacy fallback names emit deprecation warnings
"""

import importlib
import logging
import os
from unittest import mock

import pytest


def _reload_config(**env_overrides):
    """Reload config module with custom environment."""
    with mock.patch.dict(os.environ, env_overrides, clear=False):
        import config
        importlib.reload(config)
        return config


class TestValidateConfig:
    """Tests for config.validate_config()."""

    def test_validate_exits_in_production_when_required_missing(self):
        """Production (Fly.io) must fail if ANTHROPIC_API_KEY is missing."""
        env = {
            "FLY_ALLOC_ID": "test-alloc",
            "ANTHROPIC_API_KEY": "",
            "DATABASE_URL": "postgres://test",
            "GEMINI_API_KEY": "test-key",
            "JWT_SECRET": "not-default",
            "BATCH_SECRET": "s",
            "INSIGHTS_SECRET": "s",
            "PRICE_DRIVERS_SECRET": "s",
            "OPS_SECRET": "s",
        }
        with pytest.raises(SystemExit):
            _reload_config(**env)

    def test_validate_warns_in_dev_when_required_missing(self, caplog):
        """Dev environment should warn, not crash, on missing vars."""
        env = {
            "ANTHROPIC_API_KEY": "",
            "DATABASE_URL": "",
            "GEMINI_API_KEY": "",
        }
        # Remove production markers
        clean_env = {k: v for k, v in os.environ.items()
                     if k not in ("FLY_ALLOC_ID", "RAILWAY_ENVIRONMENT", "RAILWAY_SERVICE_NAME")}
        clean_env.update(env)
        with mock.patch.dict(os.environ, clean_env, clear=True):
            import config
            with caplog.at_level(logging.WARNING):
                importlib.reload(config)
            warnings = [r for r in caplog.records if "not set" in r.message]
            assert len(warnings) >= 1

    def test_validate_passes_when_all_required_set(self):
        """No error when all required vars are set."""
        env = {
            "ANTHROPIC_API_KEY": "test-key",
            "DATABASE_URL": "postgres://test",
            "GEMINI_API_KEY": "test-key",
        }
        # Remove production markers so check_production_secrets doesn't fire
        clean_env = {k: v for k, v in os.environ.items()
                     if k not in ("FLY_ALLOC_ID", "RAILWAY_ENVIRONMENT", "RAILWAY_SERVICE_NAME")}
        clean_env.update(env)
        with mock.patch.dict(os.environ, clean_env, clear=True):
            import config
            importlib.reload(config)  # Should not raise


class TestConfigAttributes:
    """Tests that config exposes all expected attributes."""

    def test_all_expected_attributes_exist(self):
        """Every env var should be accessible as a config attribute."""
        import config
        expected = [
            "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "ALLOWED_ORIGINS",
            "CI_API_KEY", "PORT", "DATABASE_URL",
            "GEMINI_API_KEY", "GEMINI_MODEL",
            "EODHD_API_KEY", "ALPHA_VANTAGE_API_KEY", "FINNHUB_API_KEY",
            "TWELVE_DATA_API_KEY", "FRED_API_KEY", "EIA_API_KEY",
            "ACLED_USERNAME", "ACLED_PASSWORD",
            "JWT_SECRET", "BATCH_SECRET", "INSIGHTS_SECRET",
            "PRICE_DRIVERS_SECRET", "OPS_SECRET",
            "GITHUB_TOKEN", "JWT_EXPIRY_DAYS",
            "EMAIL_FROM", "RESEND_API_KEY",
            "SENTRY_DSN", "ENABLE_PM", "ECONOMIST_PM_BRIDGE_ENABLED",
            "IS_PRODUCTION",
        ]
        for attr in expected:
            assert hasattr(config, attr), f"config.{attr} missing"


class TestLegacyFallback:
    """Tests that legacy env var names are handled with deprecation warnings."""

    def test_finnhub_legacy_fallback(self, caplog):
        """FINNHUB_API should fall back to FINNHUB_API_KEY with warning."""
        clean_env = {k: v for k, v in os.environ.items()
                     if k not in ("FINNHUB_API_KEY", "FINNHUB_API",
                                  "FLY_ALLOC_ID", "RAILWAY_ENVIRONMENT", "RAILWAY_SERVICE_NAME")}
        clean_env["FINNHUB_API"] = "legacy-key"
        clean_env["ANTHROPIC_API_KEY"] = "test"
        clean_env["DATABASE_URL"] = "test"
        clean_env["GEMINI_API_KEY"] = "test"
        with mock.patch.dict(os.environ, clean_env, clear=True):
            import config
            with caplog.at_level(logging.WARNING):
                importlib.reload(config)
            assert config.FINNHUB_API_KEY == "legacy-key"
            deprecation_warnings = [r for r in caplog.records if "deprecated" in r.message.lower()]
            assert len(deprecation_warnings) >= 1

    def test_primary_name_takes_precedence(self):
        """When both names are set, the primary name wins."""
        clean_env = {k: v for k, v in os.environ.items()
                     if k not in ("FLY_ALLOC_ID", "RAILWAY_ENVIRONMENT", "RAILWAY_SERVICE_NAME")}
        clean_env["FINNHUB_API_KEY"] = "primary-key"
        clean_env["FINNHUB_API"] = "legacy-key"
        clean_env["ANTHROPIC_API_KEY"] = "test"
        clean_env["DATABASE_URL"] = "test"
        clean_env["GEMINI_API_KEY"] = "test"
        with mock.patch.dict(os.environ, clean_env, clear=True):
            import config
            importlib.reload(config)
            assert config.FINNHUB_API_KEY == "primary-key"
