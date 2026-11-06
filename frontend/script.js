
"use strict";

// CS468 - NetPulse Internet Speed Testing
// Parallel transfer measurement with controlled data usage.

const API_BASE = window.location.origin;

const DOWNLOAD_SIZES = [1000000, 2000000, 4000000];
const UPLOAD_SIZES = [500000, 1000000, 2000000];

const REQUEST_TIMEOUT_MS = 20000;

const startButton = document.getElementById("startBtn");
const statusText = document.getElementById("status");
const pingResult = document.getElementById("ping");
const downloadResult = document.getElementById("download");
const uploadResult = document.getElementById("upload");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const downloadUsage = document.getElementById("downloadUsage");
const uploadUsage = document.getElementById("uploadUsage");
const testDuration = document.getElementById("testDuration");

// -----------------------------------------------
// HELPERS
// -----------------------------------------------

function calculateMbps(bytes, milliseconds) {
  if (milliseconds <= 0) {
    throw new Error("Invalid measurement duration");
  }

  return (bytes * 8 * 1000) / (milliseconds * 1000000);
}

function bytesToMB(bytes) {
  return bytes / 1000000;
}

function median(numbers) {
  if (numbers.length === 0) {
    throw new Error("No measurements available");
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function updateProgress(percent) {
  const value = Math.max(0, Math.min(100, percent));

  progressBar.style.width = `${value}%`;
  progressText.textContent = `${value.toFixed(0)}%`;
}

function resetResults() {
  pingResult.textContent = "-- ms";
  downloadResult.textContent = "-- Mbps";
  uploadResult.textContent = "-- Mbps";

  downloadUsage.textContent = "Downloaded: 0.00 MB";
  uploadUsage.textContent = "Uploaded: 0.00 MB";
  testDuration.textContent = "Test duration: -- seconds";

  updateProgress(0);
}

// -----------------------------------------------
// PING MEASUREMENT
// -----------------------------------------------

async function measurePing() {
  statusText.textContent = "Measuring ping...";

  const measurements = [];

  for (let i = 0; i < 5; i++) {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    try {
      const start = performance.now();

      const response = await fetch(
        `${API_BASE}/api/ping`,
        {
          cache: "no-store",
          signal: controller.signal
        }
      );

      if (!response.ok) {
        throw new Error(`Ping HTTP ${response.status}`);
      }

      await response.arrayBuffer();

      const elapsed = performance.now() - start;

      measurements.push(elapsed);

      updateProgress(((i + 1) / 5) * 20);
    } finally {
      clearTimeout(timeout);
    }
  }

  const result = median(measurements);

  pingResult.textContent = `${result.toFixed(1)} ms`;

  return result;
}

// -----------------------------------------------
// DOWNLOAD MEASUREMENT
// -----------------------------------------------

async function downloadOneSample(size, onBytes) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  let received = 0;

  try {
    const response = await fetch(
      `${API_BASE}/api/download?size=${size}`,
      {
        cache: "no-store",
        signal: controller.signal
      }
    );

    if (!response.ok || !response.body) {
      throw new Error(`Download HTTP ${response.status}`);
    }

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      received += value.byteLength;
      onBytes(value.byteLength);
    }

    if (received !== size) {
      throw new Error(
        `Expected ${size} bytes, received ${received}`
      );
    }

    return received;
  } finally {
    clearTimeout(timeout);
  }
}

async function measureDownload() {
  statusText.textContent = "Measuring download speed...";

  const totalPlanned = DOWNLOAD_SIZES.reduce(
    (sum, size) => sum + size,
    0
  );

  let totalReceived = 0;

  // Start all download requests together.
  const start = performance.now();

  const results = await Promise.all(
    DOWNLOAD_SIZES.map((size) =>
      downloadOneSample(size, (chunkBytes) => {
        totalReceived += chunkBytes;

        downloadUsage.textContent =
          `Downloaded: ${bytesToMB(totalReceived).toFixed(2)} MB`;

        updateProgress(
          20 + (totalReceived / totalPlanned) * 40
        );
      })
    )
  );

  // Measure the whole concurrent transfer interval.
  const elapsed = performance.now() - start;

  const verifiedBytes = results.reduce(
    (sum, bytes) => sum + bytes,
    0
  );

  if (verifiedBytes !== totalPlanned) {
    throw new Error("Incomplete download measurement");
  }

  const speed = calculateMbps(verifiedBytes, elapsed);

  downloadResult.textContent = `${speed.toFixed(2)} Mbps`;

  updateProgress(60);

  return speed;
}

// -----------------------------------------------
// UPLOAD MEASUREMENT
// -----------------------------------------------

function createRandomPayload(size) {
  const payload = new Uint8Array(size);

  // crypto.getRandomValues has a 65536-byte limit.
  for (let offset = 0; offset < size; offset += 65536) {
    crypto.getRandomValues(
      payload.subarray(
        offset,
        Math.min(offset + 65536, size)
      )
    );
  }

  return payload;
}

function uploadOneSample(size, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const payload = createRandomPayload(size);

    xhr.open("POST", `${API_BASE}/api/upload`);

    xhr.timeout = REQUEST_TIMEOUT_MS;

    xhr.setRequestHeader(
      "Content-Type",
      "application/octet-stream"
    );

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(event.loaded, size));
      }
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Upload HTTP ${xhr.status}`));
        return;
      }

      try {
        const result = JSON.parse(xhr.responseText);

        if (result.bytes_received !== size) {
          throw new Error("Incorrect server byte count");
        }

        onProgress(size);
        resolve(size);
      } catch (error) {
        reject(error);
      }
    };

    xhr.onerror = () => {
      reject(new Error("Upload network error"));
    };

    xhr.ontimeout = () => {
      reject(new Error("Upload timed out"));
    };

    xhr.onabort = () => {
      reject(new Error("Upload aborted"));
    };

    xhr.send(payload);
  });
}

async function measureUpload() {
  statusText.textContent = "Measuring upload speed...";

  const totalPlanned = UPLOAD_SIZES.reduce(
    (sum, size) => sum + size,
    0
  );

  // Track progress separately for each request.
  const uploadedByRequest = UPLOAD_SIZES.map(() => 0);

  // Prepare payloads and start uploads together.
  const start = performance.now();

  const results = await Promise.all(
    UPLOAD_SIZES.map((size, index) =>
      uploadOneSample(size, (loaded) => {
        uploadedByRequest[index] = loaded;

        const currentTotal = uploadedByRequest.reduce(
          (sum, bytes) => sum + bytes,
          0
        );

        uploadUsage.textContent =
          `Uploaded: ${bytesToMB(currentTotal).toFixed(2)} MB`;

        updateProgress(
          60 + (currentTotal / totalPlanned) * 40
        );
      })
    )
  );

  const elapsed = performance.now() - start;

  const verifiedBytes = results.reduce(
    (sum, bytes) => sum + bytes,
    0
  );

  if (verifiedBytes !== totalPlanned) {
    throw new Error("Incomplete upload measurement");
  }

  const speed = calculateMbps(verifiedBytes, elapsed);

  uploadResult.textContent = `${speed.toFixed(2)} Mbps`;

  updateProgress(100);

  return speed;
}

// -----------------------------------------------
// MAIN TEST CONTROLLER
// -----------------------------------------------

async function runSpeedTest() {
  startButton.disabled = true;

  resetResults();

  const testStart = performance.now();

  try {
    await measurePing();
    await measureDownload();
    await measureUpload();

    updateProgress(100);

    statusText.textContent = "Speed test completed!";
  } catch (error) {
    console.error("Speed test failed:", error);

    statusText.textContent =
      `Test failed: ${error.message}`;
  } finally {
    const elapsed = (performance.now() - testStart) / 1000;

    testDuration.textContent =
      `Test duration: ${elapsed.toFixed(2)} seconds`;

    startButton.disabled = false;
  }
}

startButton.addEventListener("click", runSpeedTest);
