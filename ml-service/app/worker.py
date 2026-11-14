import json, os, time, urllib.request, urllib.error
from pathlib import Path
import joblib
from intelligence import analyze

base = os.environ.get("FILEGRID_URL", "http://api:8080") + "/internal/v1"
token = (
    Path(os.environ.get("WORKER_TOKEN_FILE", "/run/filegrid/worker.token"))
    .read_text()
    .strip()
)
model = joblib.load(
    os.environ.get(
        "MODEL_FILE", str(Path(__file__).resolve().parents[1] / "models/impact.joblib")
    )
)


def request(path, data):
    req = urllib.request.Request(
        base + path,
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json", "X-Worker-Token": token},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)


while True:
    job = None
    try:
        job = request("/jobs/claim", {})
        if not job:
            time.sleep(1)
            continue
        result = analyze(model, job["incident"], job["context"])
        result["attempt"] = job["attempt"]
        request("/jobs/" + job["jobId"] + "/complete", result)
        print(
            json.dumps(
                {"jobId": job["jobId"], "state": "COMPLETED", "synthetic": True}
            ),
            flush=True,
        )
    except Exception as error:
        print(
            json.dumps({"state": "RETRY", "errorType": type(error).__name__}),
            flush=True,
        )
        if job:
            try:
                request("/jobs/" + job["jobId"] + "/fail", {"attempt": job["attempt"]})
            except Exception:
                pass
        time.sleep(2)
