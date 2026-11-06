
from fastapi import FastAPI

# Create the web application.
app = FastAPI(title="CS468 Speed Testing API")


@app.get("/")
def home():
    """Confirm that the backend is running."""
    return {"message": "CS468 Speed Test API is running"}


@app.get("/api/ping")
def ping():
    """Return a minimal response for latency measurement."""
    return {"status": "ok"}



import os

from fastapi import HTTPException
from fastapi.responses import StreamingResponse

# Maximum data allowed in a single download request: 25 MB
MAX_DOWNLOAD_BYTES = 25_000_000

# Send data in 64 KB chunks.
CHUNK_SIZE = 64 * 1024


def generate_download_data(size: int):
    """Generate exactly 'size' bytes without storing
    the entire response in memory.
    """
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



from fastapi import Request

# Maximum upload size: 25 MB
MAX_UPLOAD_BYTES = 25_000_000


@app.post("/api/upload")
async def upload(request: Request):
    """Receive uploaded binary data and count its bytes."""

    total_bytes = 0

    # Read incoming data in chunks.
    async for chunk in request.stream():
        total_bytes += len(chunk)

        # Reject requests that exceed the allowed size.
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
