"""Exact physical unit ratios only; no implicit aggregation or model approval."""

import math
from dataclasses import dataclass
from fractions import Fraction


@dataclass(frozen=True)
class UnitConversion:
    quantity: str
    source_value: float
    source_unit: str
    value: float
    unit: str
    ratio_numerator: int
    ratio_denominator: int
    transform_version: str = "exact-unit-ratios.1"
    parameter_id: str = "PAR_INPUT_UNIT_TRANSFORMS"


def convert_exact(
    value: float, source_unit: str, target_unit: str, *, quantity: str
) -> UnitConversion:
    """Arithmetic helper, deliberately not an approved input transformation.

    Unit ratios are exact; binary floating output is not claimed to be exact.
    Input quantity prevents treating air/water/thermal-index labels as synonyms.
    No station mapping, temporal mean, or water-level-to-flow inference occurs.
    """
    if type(value) not in {int, float} or not math.isfinite(value):
        raise ValueError("A finite numeric measurement is required")
    if quantity in {"air_temperature", "water_temperature"}:
        ratios = {"degC": Fraction(1), "°C": Fraction(1)}
    elif quantity == "wind_speed":
        ratios = {"m/s": Fraction(1), "km/h": Fraction(5, 18)}
    elif quantity == "current_speed":
        ratios = {"m/s": Fraction(1), "cm/s": Fraction(1, 100)}
    else:
        raise ValueError("Quantity has no supported exact arithmetic helper")
    if source_unit not in ratios or target_unit not in ratios:
        raise ValueError("Unknown or dimensionally incompatible unit")
    ratio = ratios[source_unit] / ratios[target_unit]
    result = float(value) * ratio.numerator / ratio.denominator
    if not math.isfinite(result):
        raise ValueError("Converted value is nonfinite")
    return UnitConversion(
        quantity=quantity,
        source_value=float(value),
        source_unit=source_unit,
        value=result,
        unit=target_unit,
        ratio_numerator=ratio.numerator,
        ratio_denominator=ratio.denominator,
    )
