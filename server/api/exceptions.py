import logging

from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from core.errors import AppError

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is not None:
        return response

    if isinstance(exc, AppError):
        return Response({"detail": exc.detail}, status=exc.status_code)

    if isinstance(exc, RuntimeError):
        return Response({"detail": str(exc)}, status=400)

    logger.exception("Unhandled error")
    return Response({"detail": "Internal server error"}, status=500)
