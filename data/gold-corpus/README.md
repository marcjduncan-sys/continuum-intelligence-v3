# Gold Agent Corpus

Place research documents (PDF, TXT, MD) for each gold ticker in its subdirectory.
The gold agent reads these documents via Gemini to produce structured analysis.

## Directory Structure

```
gold-corpus/
  EVN/    -- Evolution Mining
  NST/    -- Northern Star Resources
  WAF/    -- West African Resources
  HRZ/    -- Horizon Gold
```

## Supported File Types

- `.pdf` -- Annual reports, quarterly reports, technical reports
- `.txt` -- Text extracts, research notes
- `.md`  -- Markdown research compilations

## Adding Documents

Drop files into the ticker's directory. The gold agent will process all files
in the directory when `/ci:gold-refresh TICKER` is run.

For best results, include:
- Most recent annual report
- Last 2-4 quarterly activities reports
- Feasibility study or technical report (if available)
- Broker research notes
