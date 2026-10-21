# Domain Glossary

- **RAG document:** An Admin-managed private source file with metadata, review state, content versions, indexing generations, and retrieval data.
- **Original source (nguồn gốc):** A published article or web page used to substantiate content compiled into a RAG document.
- **Original-source attribution:** A declaration within a RAG document that a section or passage draws on a named original source.
- **Disabled RAG document:** A document in terminal `DISABLED` status that is excluded from future retrieval.
- **Soft-deleted RAG document:** A document marked with `deletedAt` and hidden from the active list and retrieval while its file and history remain available to Admin for recovery.
- **Restored RAG document:** A previously soft-deleted document whose marker is cleared and whose status is `DISABLED` with public-Q&A approval revoked.
