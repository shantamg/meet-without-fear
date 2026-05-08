#!/usr/bin/env python3
"""Compatibility entry point for the bot harness provider runner."""

from bot_harness.providers import *  # noqa: F401,F403
from bot_harness.providers import main


if __name__ == "__main__":
    raise SystemExit(main())
