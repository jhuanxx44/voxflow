import shutil
from pathlib import Path

import pytest

from voxflow.domain.errors import LockConflictError, ValidationError
from voxflow.infrastructure.project_store import ProjectStore
from voxflow.settings import Settings


def test_project_persists_and_can_be_reopened(settings: Settings, wav_file: Path) -> None:
    store = ProjectStore(settings)
    created = store.create(wav_file, name="fixture")
    assert created.source.media.has_audio
    assert Path(created.source.managed_path).is_file()

    reopened = ProjectStore(settings).get(created.id)
    assert reopened.id == created.id
    assert reopened.source.sha256 == created.source.sha256
    projects, total = store.list()
    assert total == 1
    assert projects[0].id == created.id


def test_catalog_can_be_rebuilt_from_project_and_artifact_manifests(
    settings: Settings, wav_file: Path
) -> None:
    store = ProjectStore(settings)
    created = store.create(wav_file)
    source_artifact_id = created.source.artifact_id
    settings.catalog_path.unlink()
    rebuilt = ProjectStore(settings)
    counts = rebuilt.rebuild_catalog()
    assert counts == {"projects": 1, "artifacts": 1}
    assert rebuilt.catalog.get_artifact(source_artifact_id) is not None


def test_catalog_rebuild_removes_stale_discovery_rows(settings: Settings, wav_file: Path) -> None:
    store = ProjectStore(settings)
    kept = store.create(wav_file)
    stale = store.create(wav_file)
    shutil.rmtree(store.project_dir(stale.id))
    counts = store.rebuild_catalog()
    assert counts == {"projects": 1, "artifacts": 1}
    projects, total = store.list()
    assert total == 1
    assert projects[0].id == kept.id


def test_same_source_creates_isolated_managed_projects(settings: Settings, wav_file: Path) -> None:
    store = ProjectStore(settings)
    first = store.create(wav_file)
    second = store.create(wav_file)
    first_path = Path(first.source.managed_path)
    second_path = Path(second.source.managed_path)
    assert first.id != second.id
    assert first_path != second_path
    assert first_path.read_bytes() == second_path.read_bytes()
    first_path.write_bytes(first_path.read_bytes() + b"project-one-only")
    assert first_path.read_bytes() != second_path.read_bytes()


def test_invalid_id_and_corrupt_manifest_have_structured_errors(
    settings: Settings, wav_file: Path
) -> None:
    store = ProjectStore(settings)
    with pytest.raises(ValidationError, match="Invalid project ID"):
        store.get("../../outside")

    project = store.create(wav_file)
    store.manifest_path(project.id).write_text("{not valid json", encoding="utf-8")
    with pytest.raises(ValidationError, match="manifest is invalid"):
        store.get(project.id)


def test_concurrent_project_lock_reports_conflict(settings: Settings, wav_file: Path) -> None:
    first = ProjectStore(settings)
    project = first.create(wav_file)
    second = ProjectStore(settings)
    with (
        first.lock(project.id),
        pytest.raises(LockConflictError),
        second.lock(project.id, timeout=0.01),
    ):
        raise AssertionError("unreachable")


def test_allowed_roots_reject_outside_and_symlink_escape(tmp_path: Path, wav_file: Path) -> None:
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    inside = allowed / "inside.wav"
    shutil.copy2(wav_file, inside)
    restricted = Settings(
        home=tmp_path / "restricted-home", allowed_input_roots=(allowed.resolve(),)
    )
    store = ProjectStore(restricted)
    assert store.create(inside).source.original_name == "inside.wav"
    with pytest.raises(ValidationError, match="outside the configured allowed roots"):
        store.create(wav_file)
    escape = allowed / "escape.wav"
    escape.symlink_to(wav_file)
    with pytest.raises(ValidationError, match="outside the configured allowed roots"):
        store.create(escape)


def test_configured_media_size_limit_is_enforced_before_probe(
    tmp_path: Path, wav_file: Path
) -> None:
    restricted = Settings(home=tmp_path / "size-home", max_input_bytes=1)
    with pytest.raises(ValidationError, match="size limit"):
        ProjectStore(restricted).create(wav_file)
