# save as test_minimal.py
import subprocess
import json
import sys

test = ['Paris is capital of France.', 'Hello world.']
result = subprocess.run(
    [sys.executable, 'classify_sentences.py', json.dumps(test)],
    capture_output=True,
    text=True,
    timeout=5
)
print('Code:', result.returncode)
print('Output:', result.stdout)
if result.stderr:
    print('Error:', result.stderr[:500])