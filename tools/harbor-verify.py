"""Independent structural verifier. No model, keyword matching, or quality reward."""
import hashlib
import json
import re
from pathlib import Path

def nonempty(value):
    return isinstance(value, str) and bool(value)

def valid_shape(report):
    if not isinstance(report, dict) or set(report) != {'findings', 'limitations'}:
        return False
    if not isinstance(report['limitations'], list) or not all(map(nonempty, report['limitations'])):
        return False
    if not isinstance(report['findings'], list):
        return False
    ids = set()
    for finding in report['findings']:
        if not isinstance(finding, dict) or set(finding) != {
            'id', 'title', 'description', 'reproduction', 'expected', 'actual', 'targets', 'evidence'
        }:
            return False
        if not all(nonempty(finding[key]) for key in ['id', 'title', 'description', 'expected', 'actual']):
            return False
        if finding['id'] in ids:
            return False
        ids.add(finding['id'])
        for key in ['reproduction', 'targets']:
            if not isinstance(finding[key], list) or not finding[key] or not all(map(nonempty, finding[key])):
                return False
        if not isinstance(finding['evidence'], list):
            return False
        for artifact in finding['evidence']:
            if not isinstance(artifact, dict) or set(artifact) != {'path', 'sha256', 'kind'}:
                return False
            if not nonempty(artifact['path']) or not isinstance(artifact['sha256'], str):
                return False
            if not re.fullmatch('[a-f0-9]{64}', artifact['sha256']):
                return False
            if artifact['kind'] not in ['screenshot', 'video', 'trace', 'log', 'receipt', 'oracle']:
                return False
    return True

def verify(root):
    root = Path(root).resolve()
    try:
        report = json.loads((root / 'review.json').read_text())
    except (ValueError, OSError):
        return False, False
    if not valid_shape(report):
        return False, False
    try:
        for finding in report['findings']:
            for artifact in finding['evidence']:
                path = (root / artifact['path']).resolve()
                if Path(artifact['path']).is_absolute() or not path.is_relative_to(root):
                    return True, False
                if hashlib.sha256(path.read_bytes()).hexdigest() != artifact['sha256']:
                    return True, False
    except (ValueError, OSError):
        return True, False
    return True, True

if __name__ == '__main__':
    valid, artifacts_valid = verify('/logs/artifacts')
    output = Path('/logs/verifier')
    output.mkdir(parents=True, exist_ok=True)
    (output / 'reward.json').write_text(json.dumps({
        'report_valid': int(valid), 'artifact_integrity': int(artifacts_valid),
    }))
    (output / 'adjudication-status.json').write_text(json.dumps({
        'semantic_adjudication': 'pending', 'release_certified': False,
    }))
