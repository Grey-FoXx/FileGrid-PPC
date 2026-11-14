from pathlib import Path
import sys, joblib, os

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
from intelligence import train

out = Path(
    os.environ.get(
        "MODEL_OUTPUT_DIR", str(Path(__file__).resolve().parents[1] / "models")
    )
)
out.mkdir(parents=True, exist_ok=True)
joblib.dump(train(), out / "impact.joblib")
print("Built deterministic synthetic Random Forest artifact")
