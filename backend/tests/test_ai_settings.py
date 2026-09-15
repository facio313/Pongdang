"""Activation is local configuration only; never performs a paid health check."""

import pytest

from app.config import Settings


def settings(**changes):
    return Settings(_env_file=None, postgres_password="unit-test-only", **changes)


def test_key_only_enables_luna_with_matched_nonzero_prices(monkeypatch):
    for name in (
        "AI_PROVIDER",
        "AI_MODEL",
        "AI_PRICING_MODEL",
        "AI_API_KEY",
        "AI_INPUT_MICROUSD_PER_MILLION_TOKENS",
        "AI_OUTPUT_MICROUSD_PER_MILLION_TOKENS",
    ):
        monkeypatch.delenv(name, raising=False)
    assert settings().ai_effective_provider == "disabled"
    monkeypatch.setenv("AI_API_KEY", "  local-test-only-key  ")
    configured = settings()
    assert configured.ai_effective_provider == "openai"
    assert configured.ai_api_key.get_secret_value() == "local-test-only-key"
    assert "local-test-only-key" not in repr(configured)
    assert configured.ai_model == configured.ai_pricing_model == "gpt-5.6-luna"
    assert configured.ai_input_microusd_per_million_tokens == 200000
    assert configured.ai_output_microusd_per_million_tokens == 1200000


@pytest.mark.parametrize(
    "provider,key,expected",
    [
        ("auto", "", "disabled"),
        ("auto", "  ", "disabled"),
        ("openai", "", "disabled"),
        ("disabled", "unit-test-key", "disabled"),
        ("auto", "unit-test-key", "openai"),
        ("openai", "unit-test-key", "openai"),
    ],
)
def test_effective_activation_respects_explicit_disable(provider, key, expected):
    assert (
        settings(ai_provider=provider, ai_api_key=key).ai_effective_provider == expected
    )


def test_retired_empty_model_defaults_do_not_override_luna():
    configured = settings(ai_provider="", ai_model="", ai_pricing_model="")
    assert configured.ai_provider == "auto"
    assert configured.ai_model == configured.ai_pricing_model == "gpt-5.6-luna"


def test_explicit_wrong_price_remains_detectable_without_breaking_app_settings():
    configured = settings(
        ai_model="operator-selected-model", ai_input_microusd_per_million_tokens=None
    )
    assert configured.ai_model != configured.ai_pricing_model
    assert configured.ai_input_microusd_per_million_tokens is None


def test_single_documented_key_has_no_ambiguous_alias(monkeypatch):
    monkeypatch.delenv("AI_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "different-tool-private-key")
    assert settings().ai_effective_provider == "disabled"
