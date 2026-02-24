import os
import json

research_dir = r'c:\Users\User\continuum-intelligence-v2\data\research'
json_files = [f for f in os.listdir(research_dir) if f.endswith('.json') and f != '_index.json']

results = []

for filename in json_files:
    path = os.path.join(research_dir, filename)
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
            ticker = data.get('ticker', 'UNKNOWN')
            evidence_cards = data.get('evidence', {}).get('cards', [])
            domain_count = len(evidence_cards)
            price_history = data.get('priceHistory', [])
            price_points = len(price_history)
            
            # Check for specific fields in evidence cards (Leadership is usually card 9, Ownership is card 10)
            has_leadership = any(card.get('number') == 9 for card in evidence_cards)
            has_ownership = any(card.get('number') == 10 for card in evidence_cards)
            
            results.append({
                'file': filename,
                'ticker': ticker,
                'domains': domain_count,
                'leadership': has_leadership,
                'ownership': has_ownership,
                'price_points': price_points,
                'chart_12m': price_points >= 52
            })
    except Exception as e:
        results.append({
            'file': filename,
            'error': str(e)
        })

print(json.dumps(results, indent=2))
