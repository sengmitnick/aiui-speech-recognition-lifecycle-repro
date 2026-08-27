# Public evidence

Only manually reviewed, reproduction-specific evidence belongs in this directory.

Raw `adb logcat` captures are written to `evidence/private/`, which is ignored by Git. The extractor removes unrelated lines and obvious local identifiers, but its output is still only a review candidate. Read every line before committing it.

Each public log should have a matching Markdown note that records:

- source commit;
- device and runtime versions;
- exact reproduction steps;
- whether the problem reproduced;
- the first abnormal event sequence;
- confirmation that the log contains no personal data.
