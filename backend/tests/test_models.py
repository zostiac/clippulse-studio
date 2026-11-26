import os
import stat
import sys
import threading

import pytest

import models
from models import (
    Clip,
    Project,
    delete_project,
    is_valid_project_id,
    load_project,
    mutate_project,
    save_project,
    save_settings,
    AppSettings,
)


def _project(pid="proj_0a1b2c3d"):
    return Project(id=pid, title="t", source_type="demo")


@pytest.mark.parametrize("pid", ["..", ".", "", "../x", "proj_zzzzzzzz", "proj_1234", "/etc", "proj_0a1b2c3d/.."])
def test_invalid_project_ids_rejected(pid):
    assert not is_valid_project_id(pid)
    assert load_project(pid) is None
    assert delete_project(pid) is False


def test_delete_dotdot_never_touches_data_dir():
    sentinel = models.DATA_DIR / "sentinel.txt"
    sentinel.write_text("keep me")
    assert delete_project("..") is False
    assert sentinel.exists()


def test_save_load_delete_roundtrip():
    p = _project("proj_11111111")
    save_project(p)
    assert load_project(p.id).title == "t"
    assert delete_project(p.id) is True
    assert load_project(p.id) is None


def test_mutate_project_reentrant_lock_does_not_deadlock():
    # Regression: the export job used `with _store_lock: ... save_project()`, and
    # save_project locks again. With a plain Lock that deadlocks the thread.
    p = _project("proj_22222222")
    save_project(p)
    done = threading.Event()

    def work():
        with models._store_lock:
            save_project(p)
        mutate_project(p.id, lambda proj: setattr(proj, "title", "changed"))
        done.set()

    t = threading.Thread(target=work, daemon=True)
    t.start()
    assert done.wait(timeout=5), "re-acquiring the store lock deadlocked"
    assert load_project(p.id).title == "changed"


def test_concurrent_mutations_are_not_lost():
    p = _project("proj_33333333")
    save_project(p)

    def add_clip(i):
        def fn(proj):
            proj.clips.append(Clip(project_id=proj.id, title=f"c{i}", start=0, end=5))
        mutate_project(p.id, fn)

    threads = [threading.Thread(target=add_clip, args=(i,)) for i in range(25)]
    [t.start() for t in threads]
    [t.join(timeout=10) for t in threads]
    assert len(load_project(p.id).clips) == 25


def test_mutate_missing_project_returns_none():
    assert mutate_project("proj_deadbeef", lambda p: None) is None


def test_failed_mutation_is_not_saved():
    p = _project("proj_44444444")
    save_project(p)

    def boom(proj):
        proj.title = "half-applied"
        raise RuntimeError("nope")

    with pytest.raises(RuntimeError):
        mutate_project(p.id, boom)
    assert load_project(p.id).title == "t"


@pytest.mark.skipif(sys.platform.startswith("win"), reason="POSIX permissions")
def test_settings_file_is_private():
    save_settings(AppSettings(api_key="sk-secret"))
    mode = stat.S_IMODE(os.stat(models.SETTINGS_FILE).st_mode)
    assert mode == 0o600
