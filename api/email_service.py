"""
Email service -- sends OTP access codes via SMTP.

Falls back gracefully (WARNING logged, code printed) when SMTP is not
configured. This allows local development without email infrastructure.
"""

import logging
from email.mime.text import MIMEText

import config

logger = logging.getLogger(__name__)


async def send_otp_email(to_email: str, code: str) -> bool:
    """
    Send a 6-digit OTP code to an email address.

    Returns True on success. Returns False (with a WARNING log) if SMTP is
    not configured or delivery fails. The caller should not surface SMTP
    errors to the end user to avoid information leakage.
    """
    if not config.SMTP_HOST or not config.EMAIL_FROM:
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

    message = MIMEText(body)
    message["Subject"] = f"Your Continuum access code: {code}"
    message["From"] = config.EMAIL_FROM
    message["To"] = to_email

    try:
        import aiosmtplib

        use_tls = config.SMTP_PORT == 465
        await aiosmtplib.send(
            message,
            hostname=config.SMTP_HOST,
            port=config.SMTP_PORT,
            username=config.SMTP_USER or None,
            password=config.SMTP_PASS or None,
            use_tls=use_tls,
            start_tls=not use_tls,
            timeout=10,
        )
        logger.info("OTP email sent to %s", to_email)
        return True
    except Exception as exc:
        logger.error("Failed to send OTP email to %s: %s", to_email, exc)
        return False
