"""Concurrency regression test for project analysis claiming."""
from __future__ import annotations

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

from fastapi import HTTPException

import main
from models import AppSettings, Project, delete_project, save_project


def test_only_one_analysis_claim_succeeds() -> None:
    project_id = f"proj_{uuid.uuid4().hex[:8]}"
    project = Project(
        id=project_id,
        title="Concurrent analysis test",
        source_type="upload",
        duration=2.0,
        status="ready",
    )
    save_project(project)
    entered_analysis = threading.Event()
    release_analysis = threading.Event()
    calls = 0
    calls_lock = threading.Lock()
    original = main.analyze_project

    def slow_analysis(*_args, **_kwargs):
        nonlocal calls
        with calls_lock:
            calls += 1
        entered_analysis.set()
        if not release_analysis.wait(timeout=10):
            raise TimeoutError("test analysis was not released")
        return [], [], "test"

    main.analyze_project = slow_analysis
    try:
        stale_snapshot = project.model_copy(deep=True)
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(main._run_analysis, project, AppSettings())
            assert entered_analysis.wait(timeout=5), "first analysis did not start"
            try:
                main._run_analysis(stale_snapshot, AppSettings())
                raise AssertionError("second analysis unexpectedly started")
            except HTTPException as exc:
                assert exc.status_code == 409, exc.status_code
            finally:
                release_analysis.set()
            completed = first.result(timeout=10)
        assert calls == 1, f"expected one analysis invocation, got {calls}"
        assert completed.status == "ready"
    finally:
        release_analysis.set()
        main.analyze_project = original
        delete_project(project_id)


if __name__ == "__main__":
    test_only_one_analysis_claim_succeeds()
    print("analysis concurrency regression OK")
