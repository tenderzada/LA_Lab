"""
Unified LLM client factory.
Manages multiple providers; one is active at a time for chat tasks.
Embedding always uses OpenRouter (separate from chat provider).
"""

import os
import json
from openai import OpenAI

APP_DIR = os.path.dirname(__file__)
LLM_CONFIG_FILE = os.path.join(APP_DIR, "llm_config.json")

DEFAULT_PROVIDERS = [
    {
        "id": "qwen-plus",
        "name": "Qwen-Plus (DashScope)",
        "api_key_env": "DASHSCOPE_API_KEY",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model": "qwen-plus",
        "is_default": True,
    },
    {
        "id": "openrouter",
        "name": "OpenRouter (Multi-model)",
        "api_key_env": "OPENAI_API_KEY",
        "base_url": "https://openrouter.ai/api/v1",
        "model": "anthropic/claude-sonnet-4",
        "is_default": False,
    },
]


def _load_config() -> dict:
    if os.path.exists(LLM_CONFIG_FILE):
        with open(LLM_CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    cfg = {"providers": DEFAULT_PROVIDERS, "active": "qwen-plus"}
    _save_config(cfg)
    return cfg


def _save_config(cfg: dict):
    with open(LLM_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def get_providers() -> list:
    return _load_config()["providers"]


def get_active_id() -> str:
    return _load_config()["active"]


def set_active(provider_id: str) -> dict:
    cfg = _load_config()
    ids = [p["id"] for p in cfg["providers"]]
    if provider_id not in ids:
        raise ValueError(f"Unknown provider: {provider_id}")
    cfg["active"] = provider_id
    _save_config(cfg)
    return cfg


def add_provider(provider: dict) -> dict:
    cfg = _load_config()
    cfg["providers"] = [p for p in cfg["providers"] if p["id"] != provider["id"]]
    cfg["providers"].append(provider)
    _save_config(cfg)
    return cfg


def delete_provider(provider_id: str) -> dict:
    cfg = _load_config()
    cfg["providers"] = [p for p in cfg["providers"] if p["id"] != provider_id]
    if cfg["active"] == provider_id and cfg["providers"]:
        cfg["active"] = cfg["providers"][0]["id"]
    _save_config(cfg)
    return cfg


def get_chat_client() -> tuple:
    """Returns (OpenAI_client, model_name) for the active chat provider."""
    cfg = _load_config()
    active_id = cfg["active"]
    provider = next((p for p in cfg["providers"] if p["id"] == active_id), None)
    if not provider:
        provider = cfg["providers"][0] if cfg["providers"] else DEFAULT_PROVIDERS[0]

    api_key = os.environ.get(provider["api_key_env"], "") or "not-set"
    client = OpenAI(api_key=api_key, base_url=provider["base_url"])
    return client, provider["model"]


def get_embed_client() -> OpenAI:
    """Embedding client — always uses OpenRouter / OpenAI."""
    key = os.environ.get("OPENAI_API_KEY", "") or "not-set"
    base = os.environ.get("OPENAI_BASE_URL", "https://openrouter.ai/api/v1")
    return OpenAI(api_key=key, base_url=base)


def get_llm_status() -> dict:
    cfg = _load_config()
    active = next((p for p in cfg["providers"] if p["id"] == cfg["active"]), None)
    return {
        "active": cfg["active"],
        "active_name": active["name"] if active else "unknown",
        "model": active["model"] if active else "unknown",
        "providers": [{"id": p["id"], "name": p["name"], "model": p["model"]} for p in cfg["providers"]],
    }
