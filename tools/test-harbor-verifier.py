"""No Docker or inference required: verify the independent grader's failure gates."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('verifier', Path(__file__).with_name('harbor-verify.py'))
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)

class VerifierTests(unittest.TestCase):
    def test_invalid_shape_and_clean_output(self):
        self.assertTrue(verifier.valid_shape({'findings': [], 'limitations': []}))
        self.assertFalse(verifier.valid_shape({'findings': [], 'limitations': [3]}))
        self.assertFalse(verifier.valid_shape({'findings': [], 'limitations': [], 'score': 1}))

    def test_hash_mismatch_and_path_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'capture.png').write_bytes(b'captured-bytes')
            artifact = {'path': 'capture.png', 'sha256': hashlib.sha256(b'captured-bytes').hexdigest(), 'kind': 'screenshot'}
            finding = {'id': 'f1', 'title': 'Reported symptom', 'description': 'Observed difference',
                       'expected': 'Visible', 'actual': 'Hidden', 'reproduction': ['Open'],
                       'targets': ['chromium-mobile'], 'evidence': [artifact]}
            report = {'findings': [finding], 'limitations': []}
            def check():
                (root / 'review.json').write_text(json.dumps(report))
                return verifier.verify(root)
            self.assertEqual(check(), (True, True))
            artifact['sha256'] = '0' * 64
            self.assertEqual(check(), (True, False))
            artifact['path'] = '../external.png'
            self.assertEqual(check(), (True, False))
            finding['targets'] = []
            self.assertEqual(check(), (False, False))

if __name__ == '__main__':
    unittest.main()
