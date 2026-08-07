"""Stable CLI success/error envelope and stdout/stderr policy."""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, TypeVar

import typer
from pydantic import ValidationError as PydanticValidationError

from voxflow.domain.errors import InternalError, ValidationError, VoxFlowError
from voxflow.domain.ids import new_request_id

T = TypeVar("T")


@dataclass
class Output:
    json_mode: bool = False

    def success(self, data: Any) -> None:
        envelope = {
            "ok": True,
            "data": data,
            "meta": {"request_id": new_request_id(), "schema_version": 1},
        }
        self._write(envelope, compact=self.json_mode)

    def error(self, error: VoxFlowError) -> None:
        envelope = {
            "ok": False,
            "error": error.as_dict(),
            "meta": {"request_id": new_request_id(), "schema_version": 1},
        }
        self._write(envelope, compact=self.json_mode)

    @staticmethod
    def _write(value: Any, *, compact: bool) -> None:
        if compact:
            text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        else:
            text = json.dumps(value, ensure_ascii=False, indent=2)
        typer.echo(text)

    def run(self, action: Callable[[], T]) -> None:
        try:
            value = action()
            if hasattr(value, "model_dump"):
                value = value.model_dump(mode="json")
            self.success(value)
        except VoxFlowError as error:
            self.error(error)
            raise typer.Exit(error.exit_code) from error
        except PydanticValidationError as error:
            converted = ValidationError(
                "Input does not match the required schema",
                details={"errors": error.errors(include_url=False, include_input=False)},
            )
            self.error(converted)
            raise typer.Exit(converted.exit_code) from error
        except (OSError, ValueError, json.JSONDecodeError) as error:
            converted = ValidationError(str(error))
            self.error(converted)
            raise typer.Exit(converted.exit_code) from error
        except Exception as error:  # adapter boundary: keep stdout machine-readable
            internal_error = InternalError(
                "Unexpected internal error", details={"error_type": type(error).__name__}
            )
            self.error(internal_error)
            raise typer.Exit(internal_error.exit_code) from error

    def progress(self, message: str) -> None:
        typer.echo(message, err=True)
