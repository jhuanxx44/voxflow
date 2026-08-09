"""Setuptools hook for bundling the canonical companion skill in wheels."""

from pathlib import Path
from shutil import copytree

from setuptools import setup
from setuptools.command.build_py import build_py

ROOT = Path(__file__).resolve().parent


class BuildPyWithCompanionSkill(build_py):
    def run(self) -> None:
        super().run()
        copytree(
            ROOT / "skills" / "voxflow",
            Path(self.build_lib) / "voxflow" / "skills" / "voxflow",
            dirs_exist_ok=True,
        )


setup(cmdclass={"build_py": BuildPyWithCompanionSkill})
