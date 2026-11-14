import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "filegrid_smoke", Path(__file__).with_name("smoke-test.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
Client = module.Client
