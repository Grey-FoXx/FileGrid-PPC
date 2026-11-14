"""Durable synthetic readings; an acknowledgment is required before deleting an event."""

import base64, json, os, sqlite3, time, random, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path


class Journal:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.executescript(
            "CREATE TABLE IF NOT EXISTS counters(meter TEXT PRIMARY KEY,seq INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS pending(id TEXT PRIMARY KEY,payload BLOB NOT NULL,attempts INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS rejected(id TEXT PRIMARY KEY,payload BLOB NOT NULL,status INTEGER NOT NULL);"
        )

    def generate(self, meter):
        with self.db:
            row = self.db.execute(
                "SELECT seq FROM counters WHERE meter=?", (meter,)
            ).fetchone()
            sequence = (row[0] if row else 0) + 1
            self.db.execute(
                "INSERT INTO counters VALUES (?,?) ON CONFLICT(meter) DO UPDATE SET seq=excluded.seq",
                (meter, sequence),
            )
            event = {
                "schema_version": 1,
                "reading_id": f"{meter}-{sequence:012d}",
                "meter_id": meter,
                "sequence_number": sequence,
                "measured_at": datetime.now(timezone.utc).isoformat(),
                "energy_kwh": round(1000 + sequence * 0.25, 3),
            }
            payload = json.dumps(
                event, separators=(",", ":"), ensure_ascii=True
            ).encode()
            self.db.execute(
                "INSERT INTO pending(id,payload) VALUES (?,?)",
                (event["reading_id"], payload),
            )
        return event["reading_id"], payload

    def pending(self):
        return self.db.execute(
            "SELECT id,payload,attempts FROM pending ORDER BY rowid LIMIT 100"
        ).fetchall()

    def ack(self, id):
        with self.db:
            self.db.execute("DELETE FROM pending WHERE id=?", (id,))

    def retry(self, id):
        with self.db:
            self.db.execute("UPDATE pending SET attempts=attempts+1 WHERE id=?", (id,))

    def reject(self, id, status):
        with self.db:
            self.db.execute(
                "INSERT OR REPLACE INTO rejected SELECT id,payload,? FROM pending WHERE id=?",
                (status, id),
            )
            self.db.execute("DELETE FROM pending WHERE id=?", (id,))

    def size(self):
        return self.db.execute("SELECT count(*) FROM pending").fetchone()[0]


def credentials():
    for line in (
        Path(os.environ.get("ACCOUNTS_FILE", "/run/filegrid/accounts.properties"))
        .read_text()
        .splitlines()
    ):
        if line.startswith("meter="):
            return "meter", line.split("=", 1)[1].split(":", 1)[0]
    raise RuntimeError("Meter account is missing")


def main():
    state = Path(os.environ.get("SIMULATOR_STATE", "pending.sqlite"))
    state.parent.mkdir(parents=True, exist_ok=True)
    journal = Journal(state)
    rate = float(os.environ.get("SIMULATOR_RATE", "1"))
    meters = int(os.environ.get("SIMULATOR_METERS", "10"))
    duplicate_every = int(os.environ.get("SIMULATOR_DUPLICATE_EVERY", "10"))
    if not 0 < rate <= 10000 or not 1 <= meters <= 100000:
        raise ValueError("Invalid simulator rate/meters")
    url = os.environ.get("FILEGRID_URL", "http://api:8080/api/v1") + "/meter-readings"
    user, password = credentials()
    auth = "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()
    next_due = time.monotonic()
    index = 0
    acked = 0
    while True:
        now = time.monotonic()
        generated = 0
        while now >= next_due and journal.size() < 10000 and generated < 100:
            journal.generate(f"MTR-{1001 + index % meters}")
            index += 1
            generated += 1
            next_due += 1 / rate
        pending = journal.pending()
        if not pending:
            time.sleep(min(0.1, max(0.001, next_due - time.monotonic())))
            continue
        failed = False
        for id, payload, attempts in pending:
            request = urllib.request.Request(
                url,
                data=payload,
                headers={
                    "Authorization": auth,
                    "Content-Type": "application/json",
                    "X-Correlation-ID": id,
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(request, timeout=10) as response:
                    if response.status not in (200, 201):
                        raise RuntimeError("Unacknowledged event")
                    response.read()
                # Simulate a lost acknowledgment by intentionally retaining every Nth event once.
                if (
                    duplicate_every
                    and (acked + 1) % duplicate_every == 0
                    and attempts == 0
                ):
                    journal.retry(id)
                else:
                    journal.ack(id)
                    acked += 1
                    if acked % 10 == 0:
                        print(
                            json.dumps(
                                {"acknowledged": acked, "pending": journal.size()}
                            ),
                            flush=True,
                        )
            except urllib.error.HTTPError as error:
                if error.code in (400, 409, 413, 422):
                    journal.reject(id, error.code)
                    print(
                        json.dumps({"rejected": id, "status": error.code}), flush=True
                    )
                else:
                    journal.retry(id)
                    failed = True
            except (OSError, RuntimeError):
                journal.retry(id)
                failed = True
        if failed:
            time.sleep(
                min(30, 0.5 * 2 ** min(6, max(x[2] for x in pending)))
                + random.random() * 0.2
            )


if __name__ == "__main__":
    main()
