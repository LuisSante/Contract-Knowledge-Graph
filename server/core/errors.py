"""Domain error types shared by the service layer.

Ported from the FastAPI backend. The original also defined
``register_exception_handlers(app)`` to wire these into FastAPI; under Django
that job is done by ``api/exceptions.py`` (a DRF ``EXCEPTION_HANDLER``), so the
FastAPI-only helper — and its ``fastapi`` import — is dropped here. The exception
classes themselves are framework-agnostic and used unchanged by the services.
"""


class AppError(Exception):
    status_code = 400

    def __init__(self, detail: str, status_code: int | None = None):
        self.detail = detail
        if status_code is not None:
            self.status_code = status_code
        super().__init__(detail)


class NotFoundError(AppError):
    status_code = 404
