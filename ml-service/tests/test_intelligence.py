import sys, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "app"))
from intelligence import train, analyze, cluster


class IntelligenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = train()

    def incident(self, **kw):
        return dict(
            id="a",
            severity=5,
            affectedCustomers=2000,
            latitude=44.18,
            longitude=28.65,
            createdAt="2026-11-14T10:00:00Z",
            **kw,
        )

    def test_safety_rule_overrides_score(self):
        i = self.incident(safetyCritical=True)
        r = analyze(self.model, i, [i])
        self.assertEqual(r["recommendation"], "IMMEDIATE_HUMAN_REVIEW")
        self.assertTrue(r["synthetic"])
        self.assertEqual(len(r["modelVersions"]), 2)

    def test_spatial_and_temporal_distance_separate_incidents(self):
        a = self.incident()
        b = {**a, "id": "b", "latitude": 44.181}
        c = {**a, "id": "c", "createdAt": "2026-11-14T12:00:00Z"}
        label, size = cluster(a, [a, b, c])
        self.assertGreaterEqual(label, 0)
        self.assertEqual(size, 2)

    def test_missing_coordinates_are_not_invented(self):
        a = {"id": "a", "severity": 2, "affectedCustomers": 5}
        r = analyze(self.model, a, [])
        self.assertEqual(r["clusterId"], -1)
        self.assertEqual(r["clusterSize"], 1)


if __name__ == "__main__":
    unittest.main()
