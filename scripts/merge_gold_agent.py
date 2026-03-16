import json
import os
import sys

def merge_gold_agent(ticker, output_file):
    ticker = ticker.upper()
    research_dir = os.path.join(os.path.dirname(__file__), "..", "data", "research")
    research_path = os.path.join(research_dir, f"{ticker}.json")
    
    if not os.path.exists(research_path):
        print(f"Error: Research file not found for {ticker} at {research_path}")
        return False
        
    if not os.path.exists(output_file):
        print(f"Error: Output file not found at {output_file}")
        return False
        
    with open(research_path, "r", encoding="utf-8") as f:
        research_data = json.load(f)
        
    with open(output_file, "r", encoding="utf-8") as f:
        gold_output = json.load(f)
        
    # Ensure ticker consistency
    if "ticker" in gold_output and ticker not in gold_output["ticker"]:
         print(f"Warning: Output file ticker ({gold_output['ticker']}) mismatch with {ticker}")

    # Injection
    research_data["goldAgent"] = gold_output
    
    # Save back
    with open(research_path, "w", encoding="utf-8") as f:
        json.dump(research_data, f, indent=2, ensure_ascii=False)
        
    print(f"Successfully merged {output_file} into {research_path}")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python merge_gold_agent.py <TICKER> <OUTPUT_JSON_PATH>")
        sys.exit(1)
        
    merge_gold_agent(sys.argv[1], sys.argv[2])
