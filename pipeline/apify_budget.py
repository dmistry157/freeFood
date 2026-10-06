"""Apify spend guard. Every Apify run must go through run_actor().

- Before: skip if this month's usage is at the budget.
- During: the run's maxTotalChargeUsd is capped at what's left of the budget, so one run
  can't push the month over.
- After: re-read usage, log the run's cost and the month total.
Apify's own Free-plan $5 limit is the last backstop.
"""
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
API = "https://api.apify.com/v2"
HEADERS = {"Authorization": f"Bearer {os.environ['APIFY_TOKEN']}"}
MONTHLY_BUDGET_USD = 4.50   # stay under Apify's $5 free credit
MAX_RUN_USD = 0.25          # no single run may cost more than this
RUN_TIMEOUT_S = 300


class BudgetExceeded(Exception):
    pass


def monthly_usage() -> float:
    resp = requests.get(f"{API}/users/me/limits", headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json()["data"]["current"]["monthlyUsageUsd"]


def run_actor(actor: str, run_input: dict) -> list[dict]:
    """Run an actor synchronously within budget; return its dataset items."""
    before = monthly_usage()
    left = MONTHLY_BUDGET_USD - before
    if left < 0.01:
        raise BudgetExceeded(f"Apify month usage ${before:.2f} >= ${MONTHLY_BUDGET_USD:.2f}; skipping {actor}")
    cap = round(min(MAX_RUN_USD, left), 4)

    resp = requests.post(
        f"{API}/acts/{actor.replace('/', '~')}/run-sync-get-dataset-items",
        headers=HEADERS, json=run_input, timeout=RUN_TIMEOUT_S + 30,
        params={"maxTotalChargeUsd": cap, "timeout": RUN_TIMEOUT_S},
    )
    resp.raise_for_status()
    items = resp.json()

    after = monthly_usage()
    print(f"apify {actor}: {len(items)} items, cost ${after - before:.4f} (cap ${cap:.2f}), "
          f"month ${after:.2f}/${MONTHLY_BUDGET_USD:.2f}")
    if after >= MONTHLY_BUDGET_USD:
        raise BudgetExceeded(f"Apify month usage ${after:.2f} reached budget; stopping Instagram jobs")
    return items


if __name__ == "__main__":
    print(f"Apify usage this month: ${monthly_usage():.4f} / ${MONTHLY_BUDGET_USD:.2f} budget")
