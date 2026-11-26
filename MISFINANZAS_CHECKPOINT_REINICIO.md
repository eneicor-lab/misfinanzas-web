# MISFINANZAS_CHECKPOINT_REINICIO
Public source checkpoint. Version 2.7.0-rc2; integration/misfinanzas-2.7-rc2.
This file contains only public repository and test references. Private operational notes are excluded.
Supervisor: Chat 5, MisFinanzas.
No main merge or production publication was performed. This is an unreleased candidate.

## Source
Recover this branch at its latest commit; do not recreate the original candidate.
The latest application change before this checkpoint is cde2d5a344f1fa06aaa9167a226d17ad4ae4b2c7 (embedded mobile logout).
Previous changes: unified financial book, explicit installment counts, typed explicit synchronization, isolated PostgreSQL validation.

## Evidence
https://github.com/eneicor-lab/misfinanzas-web/pull/2 (draft)
https://github.com/eneicor-lab/misfinanzas-web/actions/runs/45737321538 (SQL/isolated restore passed)
https://github.com/eneicor-lab/misfinanzas-web/actions/runs/45737795602 (regression/SQL/Android passed; browser40passed/2failed, subsequently corrected)
https://github.com/eneicor-lab/misfinanzas-web/actions/runs/45738213309 (regression/Android passed; browser31passed/1failed embedded logout, subsequently corrected)
https://github.com/eneicor-lab/misfinanzas-web/actions/runs/45738386957 (isolated HTTP test: consult result)
https://github.com/eneicor-lab/misfinanzas-web/actions/runs/45738611254 (may be superseded by next full run)

## Exact next operation
Inspect latest Actions run for this branch; repair any failing tests before release.
Use artifacts source-<commit>, android-rc2-<commit>, browser-<commit>, database-<commit>, regression-<commit>.
The source artifact contains a ZIP, SHA256 manifest and SOURCE_COMMIT.txt. Android includes SHA256SUMS.txt and COMMIT.txt.
Commands: npm test; npm run test:browser; python -m unittest discover -s tests -v; python tests/check_candidate.py.
Android: gradle -p android :app:assembleDebug --no-daemon (Java17, SDK35).
Keep the original icon and exact attribution: Creado por: Eduardo Neisa Cortés.
No real financial data or credentials are required by synthetic QA.
Acceptance and production integration remain with Chat5. No automatic handoff has occurred.

## Continuation after public checkpoint
Application source commit2a7e40e8cdae998abc8a15cee42ce7160684c08b:
https://github.com/eneicor-lab/misfinanzas-web/actions/runs/45740436079
Affected synchronization4/4 passed; reminder recovery refresh verified. Android build/assets/emulator passed.
APK artifact15081480538; inner APK SHA25630c494d374fbf6b8068fd370f8ef2b17c5467c122a7bc4e98d37680d790f6d9a.
Original icon preserved. Do not confuse this with the artifact ZIP digest.
The new isolated HTTP concurrency probe found automatic retries on custom SQLSTATE40001. Commitac27f1a50452c3b13b13ab9c24ecd92a0f8bcddd changes application revision conflicts to PT409 in004/006, with SQL/HTTP expectations updated. No remote deployment.
Next: run the database-only verification for this checkpoint commit, then build final source/web archives without repeating unchanged browser/Android suites.
