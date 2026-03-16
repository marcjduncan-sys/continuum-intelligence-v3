import asyncio
import json
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Path configuration
api_dir = Path("C:/Users/User/continuum-intelligence-v3/api")
sys.path.append(str(api_dir))

load_dotenv(api_dir / ".env")

# Set environmental variables
os.environ["PROJECT_ROOT"] = "C:/Users/User/continuum-intelligence-v3"
os.environ["GEMINI_API_KEY"] = "AIzaSyAdPX1DDj4cqEw4WFjJAF6k_PcMGiw66qI"

# Load NotebookLM auth from Desktop
auth_file = Path("C:/Users/User/Desktop/NOTEBOOKLM_AUTH_JSON.txt")
if auth_file.exists():
    with open(auth_file, "r", encoding="utf-8") as f:
        auth_content = f.read().strip()
    os.environ["NOTEBOOKLM_AUTH_JSON"] = auth_content
    # Use a local storage file for the client
    storage_path = Path("C:/Users/User/continuum-intelligence-v3/api/.notebooklm_auth.json")
    with open(storage_path, "w", encoding="utf-8") as f:
        f.write(auth_content)
    os.environ["NOTEBOOKLM_STORAGE"] = str(storage_path)
else:
    print("WARNING: NOTEBOOKLM_AUTH_JSON.txt not found on Desktop!")

from gold_agent import run_gold_analysis

async def run_ticker(ticker):
    print(f"\n>>> Running gold agent for {ticker}...")
    try:
        # run_gold_analysis will look up the notebook ID from notebooklm-notebooks.json
        res = await run_gold_analysis(ticker, force=True)
        output_path = f"agents/output/{ticker}_20260315.json"
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(res, f, indent=2, ensure_ascii=False)
        print(f"SUCCESS: {ticker} analysis saved to {output_path}")
        return True
    except Exception as e:
        print(f"ERROR for {ticker}: {e}")
        return False

async def main():
    tickers = ["OBM", "WIA", "SNX"]
    results = []
    for ticker in tickers:
        success = await run_ticker(ticker)
        results.append(success)
    
    if any(results):
        print("\n>>> All completed. Run merge_gold_agent.py to update research database.")

if __name__ == "__main__":
    asyncio.run(main())
