
"use strict";

// CS468 - Internet Speed Testing
// Frontend measurement implementation

const API_BASE = window.location.origin;

const DOWNLOAD_SIZES = [1000000, 2000000, 4000000];
const UPLOAD_SIZES = [500000, 1000000, 2000000];
const REQUEST_TIMEOUT_MS = 15000;

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

// PING MEASUREMENT
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

// DOWNLOAD MEASUREMENT
async function downloadOneSample(size, onBytes) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  let received = 0;

  try {
    const start = performance.now();

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
      if (done) break;

      received += value.byteLength;
      onBytes(value.byteLength);
    }

    const elapsed = performance.now() - start;

    if (received !== size) {
      throw new Error(
        `Expected ${size} bytes, received ${received}`
      );
    }

    return { bytes: received, milliseconds: elapsed };
  } finally {
    clearTimeout(timeout);
  }
}

async function measureDownload() {
  statusText.textContent = "Measuring download speed...";

  const totalPlanned = DOWNLOAD_SIZES.reduce(
    (sum, size) => sum + size, 0
  );

  let totalReceived = 0;
  let totalMilliseconds = 0;

  for (const size of DOWNLOAD_SIZES) {
    const sample = await downloadOneSample(
      size,
      (chunkBytes) => {
        totalReceived += chunkBytes;

        downloadUsage.textContent =
          `Downloaded: ${bytesToMB(totalReceived).toFixed(2)} MB`;

        updateProgress(
          20 + (totalReceived / totalPlanned) * 40
        );
      }
    );

    totalMilliseconds += sample.milliseconds;
  }

  const speed = calculateMbps(
    totalReceived,
    totalMilliseconds
  );

  downloadResult.textContent = `${speed.toFixed(2)} Mbps`;
  return speed;
}

// UPLOAD MEASUREMENT
function uploadOneSample(size, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const payload = new Uint8Array(size);

    // Generate incompressible test data in safe chunks.
    for (let offset = 0; offset < size; offset += 65536) {
      crypto.getRandomValues(
        payload.subarray(offset, Math.min(offset + 65536, size))
      );
    }

    let start = 0;

    xhr.open("POST", `${API_BASE}/api/upload`);
    xhr.timeout = REQUEST_TIMEOUT_MS;
    xhr.setRequestHeader(
      "Content-Type",
      "application/octet-stream"
    );

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded);
      }
    };

    xhr.onload = () => {
      const elapsed = performance.now() - start;

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
        resolve({ bytes: size, milliseconds: elapsed });
      } catch (error) {
        reject(error);
      }
    };

    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.onabort = () => reject(new Error("Upload aborted"));

    start = performance.now();
    xhr.send(payload);
  });
}

async function measureUpload() {
  statusText.textContent = "Measuring upload speed...";

  const totalPlanned = UPLOAD_SIZES.reduce(
    (sum, size) => sum + size, 0
  );

  let completedBytes = 0;
  let totalMilliseconds = 0;

  for (const size of UPLOAD_SIZES) {
    const sample = await uploadOneSample(
      size,
      (loaded) => {
        const currentTotal = completedBytes + loaded;

        uploadUsage.textContent =
          `Uploaded: ${bytesToMB(currentTotal).toFixed(2)} MB`;

        updateProgress(
          60 + (currentTotal / totalPlanned) * 40
        );
      }
    );

    completedBytes += sample.bytes;
    totalMilliseconds += sample.milliseconds;
  }

  const speed = calculateMbps(
    completedBytes,
    totalMilliseconds
  );

  uploadResult.textContent = `${speed.toFixed(2)} Mbps`;
  return speed;
}

// MAIN TEST CONTROLLER
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
    statusText.textContent = `Test failed: ${error.message}`;
  } finally {
    const elapsed = (performance.now() - testStart) / 1000;

    testDuration.textContent =
      `Test duration: ${elapsed.toFixed(2)} seconds`;

    startButton.disabled = false;
  }
}

startButton.addEventListener("click", runSpeedTest);
s
