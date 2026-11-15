import importlib.util
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('controlled_simulator', Path(__file__).parents[1] / 'src/simulator.py')
simulator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(simulator)

class ControlTest(unittest.TestCase):
    def test_control_is_consumed_and_demo_readings_have_separate_valid_identity_and_scope(self):
        calls = []
        class Reply:
            status = 201
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, *args): return json.dumps({'multiplier':10,'demoInitialized':True,'demoEpoch':'2026-11-15 00:00:00+00'}).encode()
        def open_request(request, **kwargs):
            if request.full_url.endswith('/simulator'): return Reply()
            calls.append(request)
            if len(calls) == 2: raise KeyboardInterrupt()
            return Reply()
        with tempfile.TemporaryDirectory() as root:
            with patch.dict(simulator.os.environ, {'SIMULATOR_STATE':str(Path(root)/'pending.sqlite'),'FILEGRID_URL':'http://fixture/api/v1','SIMULATOR_RATE':'1','SIMULATOR_DUPLICATE_EVERY':'0'}), patch.object(simulator,'credentials',return_value=('meter','fixture')), patch.object(simulator.urllib.request,'urlopen',side_effect=open_request):
                with self.assertRaises(KeyboardInterrupt): simulator.main()
        self.assertIsNone(calls[0].get_header('X-filegrid-demo'))
        self.assertEqual(calls[1].get_header('X-filegrid-demo'),'true')
        payloads = [json.loads(r.data) for r in calls]
        self.assertNotEqual(payloads[0]['reading_id'],payloads[1]['reading_id'])
        for event in payloads:
            self.assertRegex(event['meter_id'],r'^[a-zA-Z0-9_.:-]{1,120}$')
            self.assertRegex(event['reading_id'],r'^[a-zA-Z0-9_.:-]{1,120}$')

if __name__ == '__main__': unittest.main()
