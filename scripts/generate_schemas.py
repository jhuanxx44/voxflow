"""Regenerate committed JSON Schemas from canonical Pydantic models."""

from __future__ import annotations

import json
from pathlib import Path

from voxflow.domain.models import Artifact, Job, Project, RenderPlan, TimelineRevision, Transcript
from voxflow.domain.operations import EditPlan

SCHEMAS = {
    "project-v1.schema.json": Project,
    "transcript-v1.schema.json": Transcript,
    "timeline-v1.schema.json": TimelineRevision,
    "artifact-v1.schema.json": Artifact,
    "job-v1.schema.json": Job,
    "render-plan-v1.schema.json": RenderPlan,
    "edit-plan-v1.schema.json": EditPlan,
}


def main() -> None:
    destination = Path(__file__).resolve().parents[1] / "voxflow" / "schemas"
    destination.mkdir(parents=True, exist_ok=True)
    for filename, model in SCHEMAS.items():
        path = destination / filename
        path.write_text(
            json.dumps(model.model_json_schema(), ensure_ascii=False, indent=2, sort_keys=True)
            + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
