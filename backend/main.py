
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

# Create the FastAPI application
app = FastAPI(title="CS468 Speed Testing API")

# Locate the frontend folder
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

# Maximum transfer sizes: 25 MB
MAX_DOWNLOAD_BYTES = 25_000_000
MAX_UPLOAD_BYTES = 25_000_000

# Download chunk size: 64 KB
CHUNK_SIZE = 64 * 1024


# --------------------------------------------------
# FRONTEND ROUTES
# --------------------------------------------------

@app.get("/", include_in_schema=False)
async def serve_frontend():
    """Serve the main website."""
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/style.css", include_in_schema=False)
async def serve_css():
    """Serve the frontend stylesheet."""
    return FileResponse(
        FRONTEND_DIR / "style.css",
        media_type="text/css"
    )


@app.get("/script.js", include_in_schema=False)
async def serve_js():
    """Serve the frontend JavaScript."""
    return FileResponse(
        FRONTEND_DIR / "script.js",
        media_type="application/javascript"
    )


# --------------------------------------------------
# PING TEST
# --------------------------------------------------

@app.get("/api/ping")
def ping():
    """Return a minimal response for latency measurement."""
    return {"status": "ok"}


# --------------------------------------------------
# DOWNLOAD TEST
# --------------------------------------------------

def generate_download_data(size: int):
    """Generate exactly 'size' random bytes in chunks."""
    remaining = size

    while remaining > 0:
        chunk_size = min(CHUNK_SIZE, remaining)
        yield os.urandom(chunk_size)
        remaining -= chunk_size


@app.get("/api/download")
def download(size: int = 1_000_000):
    """Stream generated data to the browser."""

    if size < 1 or size > MAX_DOWNLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail="Download size must be between 1 and 25000000 bytes"
        )

    return StreamingResponse(
        generate_download_data(size),
        media_type="application/octet-stream",
        headers={
            "Cache-Control": "no-store, no-transform",
            "Content-Encoding": "identity",
            "X-Content-Type-Options": "nosniff",
        },
    )


# --------------------------------------------------
# UPLOAD TEST
# --------------------------------------------------

@app.post("/api/upload")
async def upload(request: Request):
    """Receive uploaded binary data and count its bytes."""

    total_bytes = 0

    async for chunk in request.stream():
        total_bytes += len(chunk)

        if total_bytes > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Upload exceeds 25 MB limit"
            )

    if total_bytes == 0:
        raise HTTPException(
            status_code=400,
            detail="Upload cannot be empty"
        )

    return {
        "status": "success",
        "bytes_received": total_bytes
    }
