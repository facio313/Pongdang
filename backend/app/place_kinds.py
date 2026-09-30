"""Water-place classification is independent of activity permission and safety."""

from typing import Literal

WaterPlaceKind = Literal["beach", "valley", "lake", "reservoir"]
WATER_PLACE_KINDS = frozenset({"beach", "valley", "lake", "reservoir"})
INLAND_PLACE_KINDS = frozenset({"valley", "lake", "reservoir"})
