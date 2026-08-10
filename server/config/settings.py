"""Django settings for the ContraVis backend (Phase 1: stateless document + graph API).

No database is used yet — the graph is computed per request and never persisted.
The DATABASES entry is kept ready for when users/auth/persistence arrive.
"""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY: replace before any non-local deployment.
SECRET_KEY = "dev-insecure-change-me"
DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1"]

INSTALLED_APPS = [
    # DRF touches request.user, which needs auth (and contenttypes). Kept minimal
    # now; ready for real users/auth later. The graph stays stateless regardless.
    "django.contrib.contenttypes",
    "django.contrib.auth",
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

# Phase 1 is stateless; nothing queries the DB. Ready for future models.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# The Next.js dev server proxies to us; allow its origins.
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    # Phase 1 has no users: no auth machinery (avoids pulling in
    # django.contrib.auth/contenttypes and any DB). Add these back when
    # authentication arrives.
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
}

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
