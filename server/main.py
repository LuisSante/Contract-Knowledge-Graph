from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.logging import setup_logging

load_dotenv()
setup_logging()

from api import api_router
from api.deps import document_store
from core.config import settings
from core.errors import register_exception_handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize the document store on startup
    document_store.initialize()
    yield

app = FastAPI(lifespan=lifespan)

register_exception_handlers(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def home():
    return {"message": "Hola desde FastAPI"}

@app.get("/health")
def health():
    return {
        "status": "ok",
        "services": {
            "api": {"status": "ok"},
        },
    }
