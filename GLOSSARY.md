# Domain Glossary

- **RAG document:** An Admin-managed private source file with metadata, review state, content versions, indexing generations, and retrieval data.
- **Original source (nguồn gốc):** A published article or web page used to substantiate content compiled into a RAG document.
- **Original-source attribution:** A declaration within a RAG document that a section or passage draws on a named original source.
- **Disabled RAG document:** A document in terminal `DISABLED` status that is excluded from future retrieval.
- **Soft-deleted RAG document:** A document marked with `deletedAt` and hidden from the active list and retrieval while its file and history remain available to Admin for recovery.
- **Restored RAG document:** A previously soft-deleted document whose marker is cleared and whose status is `DISABLED` with public-Q&A approval revoked.

## Public Q&A language

**Knowledge expansion (Mở rộng kiến thức)**:
An explicitly enabled Q&A capability that permits model knowledge to supplement retrieved documents and add relevant Hà Giang travel context or advice. Model knowledge remains distinct from verified document evidence.
_Avoid_: Web search, verified source.

**Model knowledge (kiến thức của model)**:
Information supplied from the language model's learned knowledge rather than established by this turn's retrieved documents.
_Avoid_: Original source, verified document evidence.

**QA question understanding (hiểu câu hỏi)**:
Interpretation of the user's intended subject and requested information so that Q&A can search for relevant material and respond to the actual question.
_Avoid_: Source verification, factual answer.
