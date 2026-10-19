# Neon read comparison

12 read-flow pairs;5 samples per variant, alternating old/new order, same local
host/PrismaNeon/poolmax2/Production READ ONLY. Five private workloads are separately
BLOCKED. This is a service/repository microbenchmark, not authenticated API or
Vercel latency. All12 DTO hashes match; changed-code live HTTP acceptance remains
unverified. Percentiles use nearest rank; n5 p95 is sample maximum.

DB_CONNECTION_MS = warm pool checkout wait (union of overlapping spans). It is
not physical TCP/TLS creation. Driver roundtrip includes network/driver decode,
not server-only query time. Serialization is JSON.stringify of the returned DTO.
Local total = service + serialization; not all columns are additive, since
connection/query spans can overlap. Negative improvement is retained.

| FLOW | QUERY_COUNT | DB_CONNECTION_MS | DRIVER_ROUNDTRIP_MS | SERIALIZATION_MS | BEFORE_P50 | BEFORE_P95 | AFTER_P50 | AFTER_P95 | IMPROVEMENT_PERCENT |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| landing | 4 -> 2 | 0.505 -> 0.311 | 199.716 -> 146.032 | 0.02 -> 0.02 | 209.377 | 393.366 | 149.581 | 349.284 | 28.559 |
| explore-list | 3 -> 2 | 0.494 -> 0.11 | 131.352 -> 131.886 | 0.018 -> 0.019 | 133.703 | 140.925 | 133.552 | 378.565 | 0.112 |
| explore-map | 3 -> 2 | 0.39 -> 0.137 | 138.204 -> 131.48 | 0.022 -> 0.024 | 141.91 | 473.067 | 135.258 | 209.905 | 4.687 |
| explore-keyword | 3 -> 3 | 0.475 -> 0.305 | 132.892 -> 133.327 | 0.017 -> 0.014 | 134.654 | 267.664 | 134.585 | 418.296 | 0.052 |
| explore-category | 3 -> 3 | 0.383 -> 0.385 | 134.094 -> 135.601 | 0.015 -> 0.015 | 135.933 | 264.453 | 137.092 | 188.569 | -0.853 |
| destination-1 | 18 -> 16 | 241.938 -> 185.565 | 627.594 -> 648.388 | 0.072 -> 0.101 | 841.954 | 901.37 | 777.426 | 1378.552 | 7.664 |
| destination-2 | 18 -> 16 | 265.987 -> 192.166 | 831.844 -> 696.961 | 0.224 -> 0.227 | 1061.876 | 1433.1 | 830.57 | 1574.479 | 21.783 |
| destination-3 | 18 -> 16 | 260.615 -> 192.395 | 691.203 -> 656.992 | 0.119 -> 0.144 | 900.142 | 1092.951 | 786.981 | 830.541 | 12.571 |
| public-editorial | 10 -> 8 | 132.643 -> 80.842 | 394.505 -> 441.425 | 0.051 -> 0.064 | 528.572 | 961.211 | 510.352 | 821.896 | 3.447 |
| planner-candidates | 4 -> 4 | 0.393 -> 0.419 | 258.302 -> 260.243 | 0.048 -> 0.043 | 260.618 | 271.299 | 262.692 | 351.971 | -0.796 |
| planner-recheck | 5 -> 5 | 0.425 -> 0.399 | 325.229 -> 304.731 | 0.001 -> 0.001 | 329.332 | 345.329 | 308.345 | 336.056 | 6.373 |
| rag-retrieval | 4 -> 4 | 0.181 -> 0.108 | 369.15 -> 376.164 | 0.046 -> 0.048 | 387.317 | 644.558 | 390.648 | 445.026 | -0.86 |

Full mandatory columns ROUTE/API/QUERY_COUNT/DB_CONNECTION_MS/DB_QUERY_MS/
SERIALIZATION_MS/TOTAL_LATENCY_MS/BEFORE_P50/BEFORE_P95/AFTER_P50/AFTER_P95/
IMPROVEMENT_PERCENT/REGRESSION_STATUS plus raw attribution are in
[CSV](evidence/neon-read-comparison.csv) and [JSON](evidence/neon-read-comparison.json).
DB_QUERY_MS (original request server-only), session, function start, Prisma-only
CPU, response transfer and total API latency are NOT_MEASURED, never inferred.
Separately replayed safe SELECT EXPLAIN server timings are in
[raw paired evidence](evidence/neon-read-flows-paired.json), not substituted for
original-request DB_QUERY_MS.

Private Favorites, My Trips, Dashboard, CMS Admin and AI history: all metrics
NOT_MEASURED/BLOCKED_NO_VALID_SESSION. No credentials/session impersonation or
synthetic user identity was used against Production. Planner and RAG rows measure
public eligibility/repository reads only; they do not authorize a proposal/answer.
