"""
extend_price_history.py

Extends priceHistory arrays in data/research/*.json to exactly 252 points
by prepending synthetic data using reverse Geometric Brownian Motion.

Approach:
- Preserves all real data at the tail of the array
- Estimates per-stock daily volatility from existing log-returns
- Walks backwards from the oldest known real price using GBM
- Uses random.seed(ticker) for reproducibility

Usage:
  python3 scripts/extend_price_history.py
"""

import json
import math
import os
import random

TARGET = 252
MU = 0.0002  # small positive daily drift (~5% annualised)
SIGMA_FLOOR = 0.008
SIGMA_CAP = 0.030
RESEARCH_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'research')


def estimate_sigma(prices):
    """Estimate daily volatility from log-returns of existing price array."""
    if len(prices) < 2:
        return 0.015  # fallback
    log_returns = [
        math.log(prices[i] / prices[i - 1])
        for i in range(1, len(prices))
        if prices[i] > 0 and prices[i - 1] > 0
    ]
    if not log_returns:
        return 0.015
    mean = sum(log_returns) / len(log_returns)
    variance = sum((r - mean) ** 2 for r in log_returns) / len(log_returns)
    sigma = math.sqrt(variance)
    return max(SIGMA_FLOOR, min(SIGMA_CAP, sigma))


def synthesise_prefix(anchor_price, n, sigma, ticker):
    """
    Generate n synthetic prices to prepend before anchor_price.
    Walks backwards from anchor_price using reverse GBM, then reverses to chronological order.
    """
    rng = random.Random(hash(ticker) & 0xFFFFFFFF)
    prices = []
    p = anchor_price
    for _ in range(n):
        z = rng.gauss(0, 1)
        # Reverse GBM step: undo one forward step
        p_prev = p / math.exp(MU - sigma * z)
        p_prev = max(p_prev, 0.01)  # floor at 1 cent
        prices.append(round(p_prev, 2))
        p = p_prev
    # prices is in reverse chronological order; flip to chronological
    prices.reverse()
    return prices


def process_file(filepath, ticker):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    history = data.get('priceHistory', [])
    current_len = len(history)

    if current_len >= TARGET:
        print(f'  {ticker:<5} already {current_len} points — skipped')
        return

    n_to_prepend = TARGET - current_len
    anchor = history[0] if history else 1.0
    sigma = estimate_sigma(history)

    prefix = synthesise_prefix(anchor, n_to_prepend, sigma, ticker)
    data['priceHistory'] = prefix + history

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f'  {ticker:<5} {current_len} -> {len(data["priceHistory"])} points  (sigma={sigma:.4f}, prepended={n_to_prepend})')


def main():
    print('Extending priceHistory arrays to 252 points...')
    files = sorted(f for f in os.listdir(RESEARCH_DIR) if f.endswith('.json') and f != '_index.json')
    for filename in files:
        ticker = filename.replace('.json', '')
        filepath = os.path.join(RESEARCH_DIR, filename)
        process_file(filepath, ticker)
    print('Done.')


if __name__ == '__main__':
    main()
