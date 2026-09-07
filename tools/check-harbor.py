"""Validate generated tasks using the installed, pinned Harbor parser."""
import json
import sys
from pathlib import Path
from importlib.metadata import version
from harbor.models.task.task import Task

assert version('harbor') == '0.22.0'
root = Path(sys.argv[1]).resolve()
index = json.loads((root / 'export.json').read_text())
for item in index['tasks']:
    directory = root / item['directory']
    task = Task(directory)
    public_files = [p.relative_to(directory / 'environment').as_posix() for p in (directory / 'environment').rglob('*') if p.is_file()]
    assert not any(p.startswith(('evaluator/', 'tests/', 'solution/', '.git/')) for p in public_files)
    assert task.config.environment.network_mode.value == 'no-network'
    print(f"Validated {item['id']}: public environment isolated from oracle/verifier sources")
