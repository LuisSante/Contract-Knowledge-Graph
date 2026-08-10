"""Aggregates the API routers into a single `api_router` that `main.py` mounts."""

from fastapi import APIRouter

from api.routes import documents

api_router = APIRouter()
api_router.include_router(documents.router)
