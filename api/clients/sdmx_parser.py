"""
Generic SDMX response parser.

Handles JSON (SDMX-JSON) and CSV responses from SDMX-compliant APIs
such as BIS and ABS. Extracts the latest observation values from
structured SDMX data.
"""

import csv
import io
import logging
from typing import Any

logger = logging.getLogger(__name__)


def parse_sdmx_csv(text: str) -> list[dict[str, str]]:
    """Parse an SDMX CSV response into a list of row dicts.

    Args:
        text: Raw CSV text from an SDMX endpoint.

    Returns:
        List of dicts, one per row, keyed by column header.
    """
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)


def extract_latest_from_csv(
    rows: list[dict[str, str]],
    value_col: str = "OBS_VALUE",
    period_col: str = "TIME_PERIOD",
) -> tuple[float | None, str | None, float | None, str | None]:
    """Extract the latest and previous values from SDMX CSV rows.

    Rows should already be sorted by period descending, or will be
    sorted here. Returns (last_value, last_date, previous_value, previous_date).
    """
    # Sort by period descending
    sorted_rows = sorted(
        rows,
        key=lambda r: r.get(period_col, ""),
        reverse=True,
    )

    last_value = None
    last_date = None
    prev_value = None
    prev_date = None

    for row in sorted_rows:
        raw = row.get(value_col, "").strip()
        if not raw or raw in ("", "NaN", "nan"):
            continue
        try:
            val = float(raw)
        except (ValueError, TypeError):
            continue

        period = row.get(period_col, "")
        if last_value is None:
            last_value = val
            last_date = period
        elif prev_value is None:
            prev_value = val
            prev_date = period
            break

    return last_value, last_date, prev_value, prev_date


def parse_sdmx_json(data: dict) -> list[dict[str, Any]]:
    """Parse an SDMX-JSON response into flat observation records.

    Handles the standard SDMX-JSON structure with dataSets, series,
    and observations nested arrays. Returns a list of dicts with
    dimension values and observation value/period.

    Args:
        data: Parsed JSON dict from an SDMX-JSON endpoint.

    Returns:
        List of observation dicts with 'value', 'period', and
        dimension key-value pairs.
    """
    results: list[dict[str, Any]] = []

    # Navigate SDMX-JSON structure
    structure = data.get("structure") or data.get("meta", {})
    data_sets = data.get("dataSets", [])
    if not data_sets:
        return results

    # Extract dimension names and values from structure
    dim_info = _extract_dimensions(data)
    obs_dim_info = _extract_obs_dimensions(data)

    dataset = data_sets[0]
    series_map = dataset.get("series", {})

    for series_key, series_data in series_map.items():
        # Decode series dimensions
        dim_indices = series_key.split(":")
        dim_values = {}
        for i, idx_str in enumerate(dim_indices):
            if i < len(dim_info):
                dim_name, dim_vals = dim_info[i]
                idx = int(idx_str) if idx_str else 0
                if idx < len(dim_vals):
                    dim_values[dim_name] = dim_vals[idx]

        # Extract observations
        observations = series_data.get("observations", {})
        for obs_key, obs_data in observations.items():
            record = dict(dim_values)
            # Decode observation dimension (usually time period)
            if obs_dim_info:
                obs_dim_name, obs_dim_vals = obs_dim_info[0]
                obs_idx = int(obs_key) if obs_key else 0
                if obs_idx < len(obs_dim_vals):
                    record["period"] = obs_dim_vals[obs_idx]

            # Observation value is typically the first element
            if isinstance(obs_data, list) and obs_data:
                record["value"] = obs_data[0]
            elif isinstance(obs_data, (int, float)):
                record["value"] = obs_data

            results.append(record)

    return results


def _extract_dimensions(data: dict) -> list[tuple[str, list[str]]]:
    """Extract series dimension info from SDMX-JSON structure."""
    dims: list[tuple[str, list[str]]] = []
    structure = data.get("structure", {})
    dimensions = structure.get("dimensions", {})
    series_dims = dimensions.get("series", [])

    for dim in series_dims:
        name = dim.get("id", dim.get("name", ""))
        values = [v.get("id", v.get("name", "")) for v in dim.get("values", [])]
        dims.append((name, values))

    return dims


def _extract_obs_dimensions(data: dict) -> list[tuple[str, list[str]]]:
    """Extract observation dimension info (usually time) from SDMX-JSON."""
    dims: list[tuple[str, list[str]]] = []
    structure = data.get("structure", {})
    dimensions = structure.get("dimensions", {})
    obs_dims = dimensions.get("observation", [])

    for dim in obs_dims:
        name = dim.get("id", dim.get("name", ""))
        values = [v.get("id", v.get("name", "")) for v in dim.get("values", [])]
        dims.append((name, values))

    return dims


def extract_latest_from_json_obs(
    observations: list[dict[str, Any]],
) -> tuple[float | None, str | None, float | None, str | None]:
    """Extract latest and previous values from parsed SDMX-JSON observations.

    Returns (last_value, last_date, previous_value, previous_date).
    """
    sorted_obs = sorted(
        observations,
        key=lambda r: r.get("period", ""),
        reverse=True,
    )

    last_value = None
    last_date = None
    prev_value = None
    prev_date = None

    for obs in sorted_obs:
        val = obs.get("value")
        if val is None:
            continue
        try:
            fval = float(val)
        except (ValueError, TypeError):
            continue

        period = obs.get("period", "")
        if last_value is None:
            last_value = fval
            last_date = period
        elif prev_value is None:
            prev_value = fval
            prev_date = period
            break

    return last_value, last_date, prev_value, prev_date
