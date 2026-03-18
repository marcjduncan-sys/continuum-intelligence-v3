"""
Email service -- sends OTP access codes via Resend HTTP API.

Falls back gracefully (WARNING logged, code printed) when RESEND_API_KEY
is not configured. This allows local development without email infrastructure.
"""

import logging

import httpx

import config

logger = logging.getLogger(__name__)


async def send_otp_email(to_email: str, code: str) -> bool:
    """
    Send a 6-digit OTP code to an email address via Resend HTTP API.

    Returns True on success. Returns False (with a WARNING log) if Resend is
    not configured or delivery fails. The caller should not surface errors
    to the end user to avoid information leakage.
    """
    if not config.RESEND_API_KEY or not config.EMAIL_FROM:
        logger.warning(
            "SMTP not configured -- OTP for %s is: %s (dev mode)", to_email, code
        )
        return False

    body = (
        "Your Continuum Intelligence access code is:\n\n"
        f"    {code}\n\n"
        "This code expires in 15 minutes. "
        "If you did not request this, please ignore this email.\n"
    )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {config.RESEND_API_KEY}"},
                json={
                    "from": config.EMAIL_FROM,
                    "to": [to_email],
                    "subject": f"Your Continuum access code: {code}",
                    "text": body,
                },
            )
            resp.raise_for_status()
        logger.info("OTP email sent to %s", to_email)
        return True
    except Exception as exc:
        logger.error("Failed to send OTP email to %s: %s", to_email, exc)
        return False
