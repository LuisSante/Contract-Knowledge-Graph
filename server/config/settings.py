from pathlib import Path

from core.config import settings as app_settings

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = app_settings.SECRET_KEY
DEBUG = app_settings.DEBUG
ALLOWED_HOSTS = app_settings.ALLOWED_HOSTS
CORS_ALLOWED_ORIGINS = app_settings.CORS_ORIGINS

INSTALLED_APPS = [
    "corsheaders",
    "rest_framework",
    "api",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# No database yet: the app is stateless (graph computed per request, LLM cost in
# a small JSON file). Postgres comes later. Empty DATABASES = Django assumes none.
DATABASES = {}

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "UNAUTHENTICATED_USER": None,
    "EXCEPTION_HANDLER": "api.exceptions.custom_exception_handler",
}

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
