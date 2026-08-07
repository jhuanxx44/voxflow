from __future__ import annotations

import json
from pathlib import Path

from voxflow.domain.models import Artifact, Job, Project, RenderPlan, TimelineRevision, Transcript
from voxflow.domain.operations import EditPlan


def test_committed_json_schemas_match_canonical_models() -> None:
    root = Path(__file__).resolve().parents[2] / "voxflow" / "schemas"
    schemas = {
        "project-v1.schema.json": Project,
        "transcript-v1.schema.json": Transcript,
        "timeline-v1.schema.json": TimelineRevision,
        "artifact-v1.schema.json": Artifact,
        "job-v1.schema.json": Job,
        "render-plan-v1.schema.json": RenderPlan,
        "edit-plan-v1.schema.json": EditPlan,
    }
    for filename, model in schemas.items():
        committed = json.loads((root / filename).read_text(encoding="utf-8"))
        assert committed == model.model_json_schema(), filename
