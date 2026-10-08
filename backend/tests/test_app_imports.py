"""앱이 import 되는지 봅니다. DB 도 네트워크도 필요하지 않습니다.

단위 테스트는 `decide()` 같은 순수 함수를 직접 import 하고, 통합 테스트는 DB 가
없으면 설정 단계에서 멈춥니다. 그래서 **라우터 모듈 자체를 한 번도 읽지 않은
채** 전체가 초록일 수 있습니다. 기동 경로가 성한지를 가장 싼 값으로 따로
확인해 둡니다 -- 여기서 실패하면 그 앞의 무엇도 볼 필요가 없습니다.

이 파일은 문법·import 만 봅니다. 동작은 각자의 테스트가 봅니다.

**이 저장소는 Python 3.14 를 요구합니다**(pyproject `requires-python`). 3.13
이하로 읽으면 PEP 758 의 괄호 없는 `except A, B:` 같은 문법이 통째로
`SyntaxError` 로 보입니다 -- 결함이 아니라 해석기가 낡은 것입니다.
"""

import importlib
import sys

import pytest

#: 기동 경로에 실제로 실리는 모듈. `app.main` 이 이들을 import 하므로 한 줄로도
#: 충분하지만, 어느 모듈이 깨졌는지 실패 이름이 바로 말해 주도록 펼쳐 둡니다.
STARTUP_MODULES = (
    "app.main",
    "app.water_index.api",
    "app.water_index.condition_api",
    "app.water_index.recommendation",
    "app.water_index.recommendation_api",
    "app.place_details.api",
    "app.place_details.season",
    "app.travel.recommend",
    "app.travel.keywords",
    "app.travel.environment",
)


def test_interpreter_is_new_enough_for_the_sources():
    """낡은 해석기로 돌렸다는 사실을 문법 오류가 아니라 이 줄이 말하게 합니다."""
    assert sys.version_info >= (3, 14)


@pytest.mark.parametrize("name", STARTUP_MODULES)
def test_startup_modules_import(name):
    assert importlib.import_module(name) is not None


def test_app_factory_is_callable_without_touching_a_database():
    from app.main import create_app

    assert callable(create_app)
