"""Fixed domain failure codes safe to persist without exception details."""


class SourceScopeTooLargeError(ValueError):
    def __init__(self):
        super().__init__("SOURCE_SCOPE_TOO_LARGE")
