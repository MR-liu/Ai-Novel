from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

VectorSource = Literal["worldbook", "outline", "chapter", "story_memory"]


@dataclass(frozen=True, slots=True)
class VectorChunk:
    id: str
    text: str
    metadata: dict[str, Any]


ALL_VECTOR_SOURCES: list[VectorSource] = ["worldbook", "outline", "chapter", "story_memory"]
