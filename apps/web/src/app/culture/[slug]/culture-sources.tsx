import type { PublicCultureSource } from "@/modules/culture/culture.types";

import {
  safeCultureSourceUrl,
  sortCultureSources,
} from "./culture-source-utils";

type CultureSourceWithOptionalPublisher = PublicCultureSource & {
  publisher?: string | null;
};

export default function CultureSources({
  sources,
}: {
  sources: readonly CultureSourceWithOptionalPublisher[];
}) {
  const orderedSources = sortCultureSources(sources);

  return (
    <section
      className="culture-detail-section culture-sources"
      aria-labelledby="culture-sources-title"
      data-culture-slot="sources"
    >
      <h2 id="culture-sources-title">Nguồn tham khảo</h2>

      {orderedSources.length === 0 ? (
        <p className="culture-detail-muted">
          Nội dung này chưa có nguồn tham khảo được công bố
        </p>
      ) : (
        <ol className="culture-source-list">
          {orderedSources.map((source, index) => {
            const sourceUrl = safeCultureSourceUrl(source.url);
            const title = source.title?.trim() || null;
            const publisher = source.publisher?.trim() || null;
            const citation = source.citation?.trim() || null;

            return (
              <li className="culture-source-item" key={`${source.sortOrder}-${index}`}>
                {title ? (
                  sourceUrl ? (
                    <h3 className="culture-source-title">
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {title}
                      </a>
                    </h3>
                  ) : (
                    <h3 className="culture-source-title">{title}</h3>
                  )
                ) : null}

                {publisher ? (
                  <p className="culture-source-publisher">
                    Nhà xuất bản: {publisher}
                  </p>
                ) : null}

                {citation ? (
                  <p className="culture-source-citation">{citation}</p>
                ) : null}

                {sourceUrl && !title ? (
                  <a
                    className="culture-source-link"
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Mở nguồn tham khảo
                  </a>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
