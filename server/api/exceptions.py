"""DRF custom exception handler replicating the FastAPI error contract.

The service layer raises plain `RuntimeError` for bad states (missing API key,
empty nodes, unsupported callType, ...) and `AppError`/`NotFoundError` (from
`core.errors`) for domain lookups. In the old FastAPI backend these mapped to
(see server_old/core/errors.py):

    - AppError      -> exc.status_code (NotFoundError => 404), body {"detail": ...}
    - RuntimeError  -> 400,            body {"detail": str(exc)}
    - Exception     -> 500,            body {"detail": "Internal server error"}

DRF's own exceptions (ValidationError -> 400, NotFound -> 404, ...) keep their
default handling: we call `rest_framework.views.exception_handler` first and only
take over when it returns None (i.e. a non-DRF exception).
"""

import logging

from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from core.errors import AppError

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    # Let DRF handle its own exception types exactly as before.
    response = drf_exception_handler(exc, context)
    if response is not None:
        return response

    # Domain error with an explicit status code (NotFoundError -> 404, etc.).
    if isinstance(exc, AppError):
        return Response({"detail": exc.detail}, status=exc.status_code)

    # Bad states raised by the service layer -> 400 (mirrors FastAPI).
    if isinstance(exc, RuntimeError):
        return Response({"detail": str(exc)}, status=400)

    # Anything else -> opaque 500 (mirrors FastAPI's generic handler).
    logger.exception("Unhandled error")
    return Response({"detail": "Internal server error"}, status=500)
