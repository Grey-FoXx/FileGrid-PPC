import importlib.util, tempfile, unittest, json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "simulator", Path(__file__).parents[1] / "src/simulator.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class JournalTest(unittest.TestCase):
    def test_restart_preserves_original_bytes_and_sequence(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "events.sqlite"
            j = module.Journal(path)
            id, payload = j.generate("MTR-1001")
            j.retry(id)
            j.db.close()
            j = module.Journal(path)
            self.assertEqual(j.pending(), [(id, payload, 1)])
            next_id, next_payload = j.generate("MTR-1001")
            self.assertNotEqual(id, next_id)
            self.assertEqual(json.loads(next_payload)["sequence_number"], 2)
            j.ack(id)
            self.assertEqual(j.size(), 1)
            j.db.close()

    def test_rejected_event_is_retained_for_inspection(self):
        with tempfile.TemporaryDirectory() as d:
            j = module.Journal(Path(d) / "events.sqlite")
            id, payload = j.generate("MTR-1")
            j.reject(id, 422)
            self.assertEqual(j.size(), 0)
            self.assertEqual(
                j.db.execute("SELECT payload,status FROM rejected").fetchone(),
                (payload, 422),
            )
            j.db.close()


if __name__ == "__main__":
    unittest.main()
