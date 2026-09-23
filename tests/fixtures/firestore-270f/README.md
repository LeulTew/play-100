# Frozen query-source evidence

These `.ts.txt` files are byte-for-byte Git blobs from the declared 270f client,
not executable modules. The source-wide token inventory in `manifest.json`
found the five query-bearing store modules and one prose-only match in App.
The audit parses every retained source with the TypeScript AST and confirms that
App contains no query construction. Primitive aliases, conditionals and query
array builders are inspected; unsupported indirection fails closed.

Each fixture's original Git blob is verified before use. The accepted H5 index
baseline is separately pinned so STORAGE-02 cannot silently remove a composite
or an older override. CI reads only committed fixtures; it needs neither a
private session path nor a Git history fetch.

Do not regenerate these from current source or relax their digests when a test
fails. A new rollback baseline requires a separately reviewed source inventory.
The repository's LF attributes preserve the original text bytes.
