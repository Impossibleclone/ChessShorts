import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.db.base import init_db
from app.api.routes import router as api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(
    title="ChessShorts API",
    description="Adaptive chess puzzle feed API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS - allow all in development, restrict in production
allow_origins = ["*"]
if os.getenv("ENVIRONMENT") == "production":
    # Add your production domain(s) here
    allow_origins = [
        "https://chessshorts.app",
        "https://www.chessshorts.app",
        "exp://*",  # Expo development
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)