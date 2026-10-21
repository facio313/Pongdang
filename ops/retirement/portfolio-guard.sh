# Multtara production is retired. Source before reading any credentials.
if [[ ${SSH_ORIGINAL_COMMAND-} =~ ^deploy[[:space:]]+multtara([[:space:]]|$) ]]; then
  printf 'Multtara production is retired; deployment refused.\n' >&2
  exit 1
fi
