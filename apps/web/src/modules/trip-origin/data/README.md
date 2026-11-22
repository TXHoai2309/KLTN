# Vietnam origin coverage

`vietnam-adm0.json` is the unmodified full-resolution geoBoundaries gbOpen
VNM ADM0 GeoJSON, downloaded 2026-11-04. WGS84 / CRS84, longitude first.

- Metadata: https://www.geoboundaries.org/api/current/gbOpen/VNM/ADM0/
- Pinned source: https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/VNM/ADM0/geoBoundaries-VNM-ADM0.geojson
- Boundary ID: VNM-ADM0-46766057. Represented year: 2016. Build: 2023-12-12.
- Source listed by publisher: geoBoundaries, Wikipedia.
- SHA256: `2e82dbe0662f0f592902ef3e79011e438d63c7a356d43b3df0553b38866b501b`.
- License reviewed in publisher metadata: Creative Commons Attribution 4.0
  International, https://creativecommons.org/licenses/by/4.0/ . Attribution:
  geoBoundaries / William & Mary geoLab; source geoBoundaries, Wikipedia.
- geoBoundaries documentation: https://www.geoboundaries.org/api.html .

The dataset may be redistributed and used with attribution under CC BY 4.0.
Keep this notice and attribution alongside the dataset; responses expose source
metadata for the frontend to credit. No provider entitlement or credential is
required. This is application coverage evidence, not a legal territorial claim
or evidence of route availability. The publisher's source/license links are
incomplete (`File`); retain their actual metadata rather than inventing a more
specific original file or claiming government authority.

Server point-in-multipolygon checks include holes and islands, using the full
geometry rather than its rectangular bounds. A 0.001-degree uncertainty margin
around polygon edges returns UNKNOWN and asks for reselection. Small omitted
islands or outdated/generalized coastline remain a limitation of this version;
unsupported coordinates never receive PASS solely from a country search filter.
Updating the dataset requires provenance/license/hash and coverage regression
review. Runtime requests do not download or mutate coverage data.
