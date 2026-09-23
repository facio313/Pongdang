"""An older application can restart against the additive v20 schema."""

from contextlib import nullcontext

import pytest

from app import schema


@pytest.fixture
def existing_schema(monkeypatch):
    def connection_for(version):
        statements = []
        expected = [
            "SELECT pg_advisory_xact_lock(hashtext('pongdang-schema'))",
            "SELECT to_regnamespace('pongdang_data')",
            "SELECT version FROM pongdang_data.schema_version WHERE id=1",
        ]

        class Connection:
            def execute(self, statement):
                assert statement == expected[len(statements)]
                statements.append(statement)
                return self

            def fetchone(self):
                return (version,) if len(statements) == 3 else (123,)

        connection = Connection()
        settings = object()

        def connect(actual_settings):
            assert actual_settings is settings
            return nullcontext(connection)

        def unexpected_migration(*args, **kwargs):
            pytest.fail("Existing compatible schemas must not be migrated")

        monkeypatch.setattr(schema, "connect", connect)
        for name in vars(schema):
            if name.startswith("migrate_"):
                monkeypatch.setattr(schema, name, unexpected_migration)
        return settings, statements, expected

    return connection_for


@pytest.mark.parametrize("version", [schema.VERSION, 20])
def test_supported_existing_schema_is_accepted_without_changes(
    existing_schema, version
):
    settings, statements, expected = existing_schema(version)

    assert schema.initialize(settings) is False
    assert statements == expected


@pytest.mark.parametrize("version", [0, 21])
def test_unknown_schema_is_rejected_without_changes(existing_schema, version):
    settings, statements, expected = existing_schema(version)

    with pytest.raises(ValueError, match="Unrecognized Pongdang schema version"):
        schema.initialize(settings)
    assert statements == expected
