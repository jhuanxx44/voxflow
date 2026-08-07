"""Transactional edit preview, apply, history, idempotency, and undo use cases."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from voxflow.domain.errors import IdempotencyConflictError, RevisionConflictError, ValidationError
from voxflow.domain.models import utc_now
from voxflow.domain.operations import EditDiff, EditPlan, EditPreview, reduce_edit_plan
from voxflow.infrastructure.project_store import ProjectStore


class EditService:
    def __init__(self, store: ProjectStore) -> None:
        self.store = store

    @staticmethod
    def _plan_hash(plan: EditPlan) -> str:
        canonical = json.dumps(
            plan.model_dump(mode="json"), ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        return hashlib.sha256(canonical.encode()).hexdigest()

    def preview(self, plan: EditPlan) -> EditPreview:
        project = self.store.get(plan.project_id)
        if project.revision != plan.expected_revision:
            raise RevisionConflictError(
                "Edit Plan is based on an outdated revision",
                details={
                    "expected_revision": plan.expected_revision,
                    "current_revision": project.revision,
                },
            )
        transcript = self.store.get_transcript(plan.project_id)
        timeline = self.store.get_timeline(plan.project_id)
        return reduce_edit_plan(timeline, transcript, plan)

    def apply(self, plan: EditPlan) -> dict[str, Any]:
        payload_hash = self._plan_hash(plan)
        with self.store.lock(plan.project_id):
            existing = self.store.catalog.get_idempotency(plan.project_id, plan.client_request_id)
            if existing:
                if existing["payload_sha256"] != payload_hash:
                    raise IdempotencyConflictError(
                        "client_request_id was already used for a different Edit Plan",
                        details={"client_request_id": plan.client_request_id},
                    )
                result = json.loads(existing["result_json"])
                result["idempotent_replay"] = True
                return result

            project = self.store.get(plan.project_id)
            committed_revision_number = plan.expected_revision + 1
            committed = (
                self.store.get_timeline(plan.project_id, committed_revision_number)
                if project.revision >= committed_revision_number
                else None
            )
            if committed and committed.client_request_id == plan.client_request_id:
                if committed.operation_digest != payload_hash:
                    raise IdempotencyConflictError(
                        "client_request_id was committed with a different Edit Plan"
                    )
                recovered = dict(committed.metadata.get("apply_result", {}))
                if recovered:
                    recovered["idempotent_replay"] = True
                    result_json = json.dumps(recovered, ensure_ascii=False, sort_keys=True)
                    self.store.catalog.put_idempotency(
                        plan.project_id,
                        plan.client_request_id,
                        payload_hash,
                        result_json,
                    )
                    return recovered
            if project.revision != plan.expected_revision:
                raise RevisionConflictError(
                    "Edit Plan is based on an outdated revision",
                    details={
                        "expected_revision": plan.expected_revision,
                        "current_revision": project.revision,
                    },
                )
            transcript = self.store.get_transcript(plan.project_id)
            timeline = self.store.get_timeline(plan.project_id)
            preview = reduce_edit_plan(timeline, transcript, plan)
            preview.timeline.source = "edit_plan"
            preview.timeline.created_at = utc_now()
            result = {
                "project_id": plan.project_id,
                "revision": preview.timeline.revision,
                "diff": preview.diff.model_dump(mode="json"),
                "idempotent_replay": False,
            }
            preview.timeline.client_request_id = plan.client_request_id
            preview.timeline.operation_digest = payload_hash
            preview.timeline.metadata["apply_result"] = result
            self.store.commit_timeline(project, preview.timeline)
            result_json = json.dumps(result, ensure_ascii=False, sort_keys=True)
            self.store.catalog.put_idempotency(
                plan.project_id, plan.client_request_id, payload_hash, result_json
            )
            return result

    def history(self, project_id: str, *, limit: int = 20) -> dict[str, Any]:
        if not 1 <= limit <= 200:
            raise ValidationError("Edit history requires 1 <= limit <= 200")
        revisions = self.store.history(project_id, limit=limit)
        return {
            "project_id": project_id,
            "items": [
                {
                    "revision": item.revision,
                    "parent_revision": item.parent_revision,
                    "created_at": item.created_at.isoformat(),
                    "reason": item.reason,
                    "source": item.source,
                    "clip_count": len(item.clips),
                    "duration_ms": item.duration_ms,
                }
                for item in revisions
            ],
        }

    def undo_preview(
        self, project_id: str, *, expected_revision: int, to_revision: int
    ) -> EditPreview:
        current = self.store.get_timeline(project_id)
        if current.revision != expected_revision:
            raise RevisionConflictError(
                "Undo is based on an outdated revision",
                details={
                    "expected_revision": expected_revision,
                    "current_revision": current.revision,
                },
            )
        target = self.store.get_timeline(project_id, to_revision).model_copy(deep=True)
        target.parent_revision = current.revision
        target.revision = current.revision + 1
        target.created_at = utc_now()
        target.reason = f"Restore revision {to_revision}"
        target.source = "undo"
        old_ids = {clip.id for clip in current.clips}
        new_ids = {clip.id for clip in target.clips}
        diff = EditDiff(
            base_revision=current.revision,
            result_revision=target.revision,
            deleted_clip_ids=sorted(old_ids - new_ids),
            added_clip_ids=sorted(new_ids - old_ids),
            moved_clip_ids=[],
            changed_clip_ids=[],
            duration_before_ms=current.duration_ms,
            duration_after_ms=target.duration_ms,
            duration_delta_ms=target.duration_ms - current.duration_ms,
        )
        return EditPreview(project_id=project_id, timeline=target, diff=diff)

    def undo_apply(
        self,
        project_id: str,
        *,
        expected_revision: int,
        to_revision: int,
        client_request_id: str,
    ) -> dict[str, Any]:
        pseudo_plan = EditPlan.model_construct(
            project_id=project_id,
            expected_revision=expected_revision,
            client_request_id=client_request_id,
            reason=f"Restore revision {to_revision}",
            operations=[],
            schema_version=1,
        )
        payload_hash = hashlib.sha256(
            f"undo:{project_id}:{expected_revision}:{to_revision}".encode()
        ).hexdigest()
        with self.store.lock(project_id):
            existing = self.store.catalog.get_idempotency(project_id, client_request_id)
            if existing:
                if existing["payload_sha256"] != payload_hash:
                    raise IdempotencyConflictError("client_request_id already has another meaning")
                result = json.loads(existing["result_json"])
                result["idempotent_replay"] = True
                return result
            preview = self.undo_preview(
                project_id, expected_revision=expected_revision, to_revision=to_revision
            )
            project = self.store.get(project_id)
            self.store.commit_timeline(project, preview.timeline)
            result = {
                "project_id": project_id,
                "revision": preview.timeline.revision,
                "restored_revision": to_revision,
                "diff": preview.diff.model_dump(mode="json"),
            }
            self.store.catalog.put_idempotency(
                project_id,
                pseudo_plan.client_request_id,
                payload_hash,
                json.dumps(result, ensure_ascii=False, sort_keys=True),
            )
            return result
