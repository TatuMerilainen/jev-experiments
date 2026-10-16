"""TypeSafe API client for Jev."""

import json
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict

API_URL = "https://api.typesafe.ai/v1/systemone"
MODEL = "jev-1.14.0"
HTTP_TIMEOUT_S = 10


class JevError(Exception):
    pass


@dataclass
class Usage:
    requests: int = 0
    input_tokens: int = 0
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)

    def add(self, input_tokens: int) -> None:
        with self.lock:
            self.requests += 1
            self.input_tokens += input_tokens


class Jev:
    def __init__(self, api_key: str, model: str = MODEL):
        self.api_key = api_key
        self.model = model

    def ask(self, state: Any, questions: Dict[str, Any], usage: Usage) -> Dict[str, Any]:
        """One request. Returns the answer object for each question id."""
        body = json.dumps({"model": self.model, "state": state, "questions": questions}).encode()
        request = urllib.request.Request(
            API_URL,
            data=body,
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        for attempt in (1, 2):
            try:
                with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_S) as response:
                    data = json.load(response)
                break
            except urllib.error.HTTPError as e:
                if attempt == 1 and e.code in (429, 500, 502, 503, 529):
                    time.sleep(min(float(e.headers.get("retry-after") or 0.5), 2.0))
                    continue
                raise JevError(f"HTTP {e.code}: {e.read().decode(errors='replace')[:200]}") from e
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                raise JevError(f"TypeSafe API not reachable: {e}") from e
        usage.add(int(data.get("usage", {}).get("input_tokens") or 0))
        return data["answers"]
