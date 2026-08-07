"""Structured application errors shared by every interface."""

from __future__ import annotations

from typing import Any


class VoxFlowError(Exception):
    code = "VOXFLOW_ERROR"
    retryable = False
    exit_code = 6

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def as_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "retryable": self.retryable,
            "details": self.details,
        }


class ValidationError(VoxFlowError):
    code = "VALIDATION_ERROR"
    exit_code = 2


class NotFoundError(VoxFlowError):
    code = "NOT_FOUND"
    exit_code = 3


class RevisionConflictError(VoxFlowError):
    code = "REVISION_CONFLICT"
    retryable = True
    exit_code = 4


class LockConflictError(VoxFlowError):
    code = "LOCK_CONFLICT"
    retryable = True
    exit_code = 4


class DependencyError(VoxFlowError):
    code = "DEPENDENCY_MISSING"
    exit_code = 5


class JobFailedError(VoxFlowError):
    code = "JOB_FAILED"
    exit_code = 6


class JobCancelledError(VoxFlowError):
    code = "JOB_CANCELLED"
    exit_code = 6


class ConfigError(VoxFlowError):
    code = "CONFIG_ERROR"
    exit_code = 7


class InternalError(VoxFlowError):
    code = "INTERNAL_ERROR"
    exit_code = 6


class IdempotencyConflictError(VoxFlowError):
    code = "IDEMPOTENCY_CONFLICT"
    exit_code = 4
