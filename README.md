# NetPulse – Internet Speed Testing Tool

## 1. Project Overview

NetPulse is a web-based internet speed testing tool that we developed for our CS468 project. The website measures the user's ping, download speed, and upload speed, and displays the results in milliseconds (ms) and megabits per second (Mbps).

Our goal was to make a speed testing tool that gives reasonable results without transferring too much data or taking too long to finish a test.

We built the backend using Python and FastAPI, and the frontend using HTML, CSS, and JavaScript. We deployed the website on Google Cloud Run.

## 2. How the Website Works

When the user clicks the **Start Test** button, the website performs three measurements in order:

1. **Ping:** Measures the round-trip time between the user's browser and our server.
2. **Download:** Downloads test data from the server and calculates the download speed.
3. **Upload:** Sends test data from the browser to the server and calculates the upload speed.

The website also shows a progress bar, the amount of data downloaded and uploaded, and the total time taken to complete the test.

## 3. Backend

### Implementation

We used Python with FastAPI to build the backend. The backend handles the requests sent by the browser and provides the data needed for the speed measurements.

We created three main API endpoints:

- `GET /api/ping` – Used to measure the round-trip time between the browser and the server.
- `GET /api/download?size=...` – Sends a requested amount of test data to the browser.
- `POST /api/upload` – Receives uploaded data and returns the number of bytes received.

For the download test, we made sure the server sends the requested number of bytes. For the upload test, we check the number of bytes received so the frontend can verify that the transfer was completed correctly.

We also added limits and error handling to avoid accepting invalid requests or unnecessarily large uploads.

### Backend Challenges

One challenge was making sure that the amount of data transferred was accurate. We needed the server to send the correct number of bytes for each download request and report the correct number of bytes received during uploads.

Another challenge was deploying the project to the cloud. We used Docker to package the backend and Google Cloud Run to host the website. We connected our GitHub repository to Cloud Build so that changes pushed to the main branch could be deployed automatically.

Another issue we faced was connecting the frontend and backend. Initially, the backend returned a JSON message when we opened the main website URL, instead of displaying the actual website. This happened because we had two routes using `/`. We fixed it by removing the original homepage route and configuring FastAPI to serve `index.html` instead. We also added routes for `style.css` and `script.js`, and updated the Dockerfile to include the frontend files. After deploying these changes, the entire website worked from one Cloud Run URL.

### Changing the Server Region

At first, we deployed NetPulse in **Belgium (`europe-west1`)**. After testing the website, we decided to try another server region to see whether we could improve the results.

We created a second deployment in **Frankfurt, Germany (`europe-west3`)** and compared the results using the same internet connection.

| Measurement | Belgium | Frankfurt | Improvement |
|---|---:|---:|---:|
| Ping | 83.0 ms | 72.5 ms | 12.7% lower |
| Download | 52.44 Mbps | 57.15 Mbps | 9.0% faster |
| Upload | 9.69 Mbps | 11.16 Mbps | 15.2% faster |
| Test duration | 4.40 seconds | 3.86 seconds | 12.3% shorter |

Frankfurt performed better in all four measurements during this comparison. The ping was lower, both download and upload speeds were higher, and the overall test finished faster.

Because of these results, we decided to keep Frankfurt as our final deployment and remove the Belgium service.

These percentages are based on the measurements we recorded, so they do not mean that Frankfurt will always be faster. Internet speed can change depending on network traffic, server load, and the connection being used.

## 4. Frontend

### Implementation

We developed the frontend using HTML, CSS, and JavaScript.

HTML is used for the page structure, CSS for the design, and JavaScript for the actual speed measurements and updating the results.

The frontend displays the ping, download speed, upload speed, progress bar, transferred data amounts, and test duration.

### Changes We Made to the JavaScript

We made several changes while testing the website because we wanted the measurements to be more consistent and finish in a reasonable amount of time.

**1. Changed sequential transfers to parallel transfers**

Initially, the JavaScript downloaded and uploaded test data one request at a time.

We noticed that this approach could give lower speed readings because each request had its own overhead, and the connection was not being used as fully as it could be.

We changed the code to use `Promise.all()` so that multiple download requests run together and multiple upload requests run together.

This lets us measure the combined throughput of several transfers instead of measuring each request separately.

**2. Changed how download speed is calculated**

Previously, we measured the duration of each download separately and added the durations together.

After switching to parallel downloads, we changed the timing method. Now we start the timer before launching the download requests and stop it when all of them finish.

We calculate the speed using:

`Speed (Mbps) = (Total bytes × 8) / (Time in seconds × 1,000,000)`

This gives us the combined download speed over the whole transfer interval.

**3. Improved upload timing**

For the upload test, we generate random data using `crypto.getRandomValues()`.

Originally, we generated the data as part of each upload operation. We changed the code so that all the upload data is prepared before starting the timer.

This prevents the time spent generating random data from being included in the upload speed calculation.

**4. Improved upload progress tracking**

When we started using parallel uploads, we also had to change how the progress bar was updated.

Each upload request now tracks its own progress, and we add the uploaded bytes together to calculate the total progress.

This avoids counting the same bytes more than once.

**5. Kept data usage controlled**

We use three different transfer sizes for each speed test.

Download sizes:
- 1 MB
- 2 MB
- 4 MB

Upload sizes:
- 0.5 MB
- 1 MB
- 2 MB

In total, one successful test transfers **7 MB of download data and 3.5 MB of upload data**, excluding small HTTP overheads.

We chose these sizes to balance speed measurement with data usage.

**6. Added error handling and verification**

We added a 20-second timeout for requests so the test does not wait indefinitely if something goes wrong.

The JavaScript also checks that the number of downloaded bytes matches the requested amount and that the server confirms the correct number of uploaded bytes.

### Frontend Challenges

The main challenge was getting reasonable speed measurements without using too much data.

At first, our results varied quite a lot between tests. We tried to improve this by changing the way transfers were performed and timed.

We also had to make sure the progress bar worked correctly when multiple requests were running at the same time.

Another challenge was that the results were not always the same as those from other speed testing websites. We realized that different tools use different servers, transfer sizes, and testing methods, so identical results are not expected.

## 5. Testing and Accuracy

We tested NetPulse several times on the same internet connection and compared the results with FAST.com and Speedtest.net.

We noticed that the results were not always identical, even when using the same Wi-Fi or mobile hotspot.

For example, one comparison gave us:

| Tool | Download | Upload | Ping |
|---|---:|---:|---:|
| NetPulse | 59.71 Mbps | 11.23 Mbps | 90 ms |
| FAST.com | 77 Mbps | 11 Mbps | 35 ms (unloaded) |
| Speedtest.net | 91.76 Mbps | 17.29 Mbps | 30 ms |

The upload results from NetPulse and FAST.com were very close in this comparison, while the download and ping results differed more.

One reason is that our website measures the connection to our own Google Cloud server, while FAST.com and Speedtest.net use different servers and measurement methods.

We also use a relatively small amount of test data compared with some commercial speed testing tools. This keeps our tests short but can make the results more sensitive to startup overhead and network fluctuations.

Our goal was not to reproduce the exact results of commercial tools, but to build our own working measurement algorithm and find a reasonable balance between accuracy, test duration, and data usage.

## 6. Technologies Used

**Backend**
- Python
- FastAPI
- Uvicorn

**Frontend**
- HTML
- CSS
- JavaScript
- Fetch API
- XMLHttpRequest

**Deployment**
- Docker
- Google Cloud Run
- Google Cloud Build
- GitHub

## 7. How to Run the Project Locally

### Requirements

- Python 3.9 or newer
- pip
- An internet connection for testing

### Steps

1. Download or clone the project repository.
2. Open a terminal in the project folder.
3. Create a Python virtual environment:

   `python3 -m venv .venv`

4. Activate the environment:

   macOS/Linux: `source .venv/bin/activate`

   Windows: `.venv\Scripts\activate`

5. Install the required packages:

   `pip install -r backend/requirements.txt`

6. Start the server:

   `python -m uvicorn backend.main:app --reload`

7. Open `http://127.0.0.1:8000` in a browser.

8. Click **Start Test** to measure the connection.

## 8. Cloud Deployment

We deployed NetPulse using Google Cloud Run.

Our final server region is **Frankfurt (`europe-west3`)**.

We use a Dockerfile to build the application and Cloud Build to deploy it from our GitHub repository.

This allows the website to be accessed online without requiring users to install Python or run the backend themselves.

## 9. Conclusion

Through this project, we learned how to build a speed testing tool using our own backend and frontend code, how to measure data transfer speeds, and how different testing methods affect the results.

The biggest improvements we made were switching to parallel transfers, improving the upload timing, and moving our cloud deployment from Belgium to Frankfurt.

We also learned that network speed measurements naturally vary, and that the server location and the amount of data transferred can affect the results.

Overall, NetPulse meets our main goal of providing a simple web-based tool that measures ping, download speed, and upload speed while showing the progress and data usage of each test.