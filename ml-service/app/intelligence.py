"""Synthetic models: demonstrate data flow, never operational accuracy."""

import os, math
from datetime import datetime, timezone
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.cluster import DBSCAN

MODEL_VERSION = "synthetic-rf-v1"
CLUSTER_VERSION = "spacetime-dbscan-v1"


def train():
    rng = np.random.default_rng(42)
    severity = rng.integers(1, 6, 1200)
    customers = rng.integers(0, 3001, 1200)
    x = np.column_stack([severity, customers])
    score = severity * 12 + np.minimum(customers / 40, 40)
    y = np.digitize(score, [30, 55, 80])
    model = RandomForestClassifier(
        n_estimators=40, max_depth=7, random_state=42, n_jobs=1
    )
    return model.fit(x, y)


def timestamp(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError):
        return datetime.now(timezone.utc).timestamp()


def cluster_details(current, context):
    zone = str(current.get("zone", ""))
    event_type = str(current.get("eventType", ""))
    rows = [
        x
        for x in context
        if x.get("latitude") is not None and x.get("longitude") is not None
        and str(x.get("zone", "")) == zone
        and str(x.get("eventType", "")) == event_type
    ]
    if current.get("latitude") is None or current.get("longitude") is None:
        return -1, 1, [str(current.get("id"))] if current.get("id") is not None else []
    if not any(str(x["id"]) == str(current["id"]) for x in rows):
        rows.append(current)
    origin = timestamp(current.get("occurredAt", current.get("createdAt")))
    # One spatial unit is 1km; one time unit is 15 minutes. eps=1 bounds their joint distance.
    features = [
        [
            float(x["latitude"]) * 111,
            float(x["longitude"]) * 111 * math.cos(math.radians(44)),
            (timestamp(x.get("occurredAt", x.get("createdAt"))) - origin) / 900,
        ]
        for x in rows
    ]
    labels = DBSCAN(eps=1, min_samples=2).fit_predict(np.array(features))
    index = next(i for i, x in enumerate(rows) if str(x["id"]) == str(current["id"]))
    label = int(labels[index])
    members = (
        [str(row.get("id")) for i, row in enumerate(rows) if labels[i] == label]
        if label >= 0 else [str(current.get("id"))]
    )
    return label, int(sum(labels == label)) if label >= 0 else 1, members


def cluster(current, context):
    label, size, _ = cluster_details(current, context)
    return label, size


def analyze(model, incident, context):
    severity = int(incident.get("severity", 1))
    customers = int(incident.get("affectedCustomers", 0))
    probabilities = model.predict_proba([[severity, customers]])[0]
    score = float(
        sum(float(p) * (int(c) + 1) * 25 for p, c in zip(probabilities, model.classes_))
    )
    priority = ["LOW", "MEDIUM", "HIGH", "CRITICAL"][min(3, int(score - 1) // 25)]
    label, size, member_ids = cluster_details(incident, context)
    urgency = float(os.environ.get("URGENCY_THRESHOLD", "75"))
    cluster_threshold = int(os.environ.get("CLUSTER_THRESHOLD", "3"))
    reasons = [
        f"Severitate raportată {severity}/5; {customers} clienți afectați",
        f"Scor model sintetic {score:.1f}/100",
        f"Grup spațio-temporal: {size} incident(e); nu demonstrează o cauză comună",
    ]
    if incident.get("safetyCritical"):
        recommendation = "IMMEDIATE_HUMAN_REVIEW"
        reasons.insert(
            0, "Indicator critic de siguranță: regula are prioritate față de modele"
        )
    elif score >= urgency and size >= cluster_threshold:
        recommendation = "HIGH_PRIORITY_REVIEW"
    elif score >= urgency:
        recommendation = "SPECIALIST_REVIEW"
    else:
        recommendation = "STANDARD_REVIEW"
    return {
        "priorityScore": round(score, 2),
        "priorityClass": priority,
        "clusterId": label,
        "clusterSize": size,
        "clusterMemberIds": member_ids,
        "recommendation": recommendation,
        "reasons": reasons,
        "modelVersions": {"impact": MODEL_VERSION, "correlation": CLUSTER_VERSION},
        "policyVersion": "decision-v1",
        "synthetic": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
