"""
Automated Medical Image Reporting Using AI
Main FastAPI Application

Run with: uvicorn app.main:app --reload
"""

import logging
import asyncio
import time
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.api.auth import router as auth_router
from app.api.routes import router as report_router
from app.services.model_loader import medical_model

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def _async_load_model():
    """Background task to load model without blocking web server startup."""
    logger.info("Background downloading/loading AI model (Salesforce BLIP)...")
    try:
        await medical_model.load_model()
        logger.info("AI model loaded successfully and ready for inference!")
    except Exception as e:
        logger.error(f"Failed to load AI model in background: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle manager.
    - On startup: Initialize database + schedule non-blocking AI model download.
    - On shutdown: Cleanup.
    """
    # === STARTUP ===
    logger.info("=" * 60)
    logger.info(f"  {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info("=" * 60)

    # Initialize database tables
    logger.info("Initializing database...")
    await init_db()
    logger.info("Database ready.")

    # Schedule AI model loading in background so web server starts instantly!
    asyncio.create_task(_async_load_model())

    logger.info("=" * 60)
    logger.info(f"  Server ready at http://{settings.HOST}:{settings.PORT}")
    logger.info(f"  API docs at http://{settings.HOST}:{settings.PORT}/docs")
    logger.info("=" * 60)

    yield  # Server is running

    # === SHUTDOWN ===
    logger.info("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "AI-powered medical image analysis system that generates "
        "structured radiology reports from chest X-rays and other medical images. "
        "Uses a pre-trained BLIP Vision-Language model."
    ),
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware — allow frontend to connect with credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS if "*" not in settings.ALLOWED_ORIGINS else [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_origin_regex=r"https?://.*" if "*" in settings.ALLOWED_ORIGINS else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========================
# Global Exception Handler
# ========================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch any unhandled exception and return a clean JSON error."""
    logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."},
    )


# ========================
# Request Logging Middleware
# ========================

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log every request with its processing time."""
    start = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start) * 1000, 1)
    logger.info(
        f"{request.method} {request.url.path} → {response.status_code} ({duration_ms}ms)"
    )
    return response


# Mount routers
app.include_router(auth_router)
app.include_router(report_router)

# Mount frontend build if available (enables running entire full-stack app on a single port)
def _find_frontend_dist() -> Path:
    candidates = [
        Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
        Path(__file__).resolve().parent.parent / "frontend" / "dist",
        Path.cwd() / "frontend" / "dist",
        Path("/app/frontend/dist"),
        Path("/frontend/dist"),
    ]
    for c in candidates:
        if c.exists() and (c / "index.html").is_file():
            return c
    return candidates[0]

FRONTEND_DIST = _find_frontend_dist()
if FRONTEND_DIST.exists() and (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="static-assets")


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend_spa(full_path: str):
    """
    Serve frontend Single Page Application (SPA).
    Serves static files directly if present in dist, otherwise falls back to index.html.
    If dist is not built, returns backend info JSON.
    """
    if full_path.startswith("api/") or full_path == "api":
        return JSONResponse(status_code=404, content={"detail": "API endpoint not found."})

    requested_file = FRONTEND_DIST / full_path
    if full_path and requested_file.is_file():
        return FileResponse(requested_file)

    index_file = FRONTEND_DIST / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)

    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "status": "running",
    }

