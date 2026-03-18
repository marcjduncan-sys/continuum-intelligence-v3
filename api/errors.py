"""
Structured error responses for the Continuum Intelligence API.

All API errors use a standard JSON envelope:
    {"error": str, "code": str, "detail": str | None}

Usage:
    from errors import api_error, ErrorCode
    raise api_error(400, ErrorCode.INVALID_TICKER, f"Bad ticker: '{t}'")
"""

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


# ---------------------------------------------------------------------------
# Error codes
# ---------------------------------------------------------------------------

class ErrorCode:
    INVALID_TICKER = "INVALID_TICKER"
    NOT_FOUND = "NOT_FOUND"
    LLM_ERROR = "LLM_ERROR"
    AUTH_ERROR = "AUTH_ERROR"
    RATE_LIMITED = "RATE_LIMITED"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    CONFLICT = "CONFLICT"
    UPSTREAM_ERROR = "UPSTREAM_ERROR"
    SERVER_ERROR = "SERVER_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    ACCESS_DENIED = "ACCESS_DENIED"


# ---------------------------------------------------------------------------
# Error helper
# ---------------------------------------------------------------------------

class APIError(HTTPException):
    """HTTPException subclass that carries a structured error code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        error: str,
        detail: str | None = None,
    ):
        self.code = code
        self.error = error
        self.detail_extra = detail
        super().__init__(
            status_code=status_code,
            detail={"error": error, "code": code, "detail": detail},
        )


def api_error(
    status_code: int,
    code: str,
    error: str,
    detail: str | None = None,
) -> APIError:
    """Create a structured API error.

    Args:
        status_code: HTTP status code (400, 401, 404, etc.)
        code: Machine-readable error code from ErrorCode constants.
        error: Human-readable error message.
        detail: Optional additional context.

    Returns:
        APIError exception (raise it at the call site).
    """
    return APIError(status_code=status_code, code=code, error=error, detail=detail)


# ---------------------------------------------------------------------------
# Exception handler (register on the FastAPI app)
# ---------------------------------------------------------------------------

async def api_error_handler(_request: Request, exc: APIError) -> JSONResponse:
    """Return the structured envelope for APIError exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.error, "code": exc.code, "detail": exc.detail_extra},
    )


async def rate_limit_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Wrap slowapi RateLimitExceeded in the standard envelope."""
    return JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded",
            "code": ErrorCode.RATE_LIMITED,
            "detail": str(exc),
        },
    )
