# Hà Giang terrain assets

- `satellite.jpg`: EOxCloudless by EOX IT Services GmbH, contains modified
  Copernicus Sentinel data 2016 & 2017, CC BY 4.0.
  https://cloudless.eox.at/documentation/faq
- `dem.bin`: Mapzen Terrain Tiles / AWS Open Data, USGS SRTM/GMTED2010.
  https://registry.opendata.aws/terrain-tiles/
  https://github.com/tilezen/joerd/blob/master/docs/attribution.md
- `landscape.json` boundaries: geoBoundaries gbOpen VNM ADM1 2008, ADM2 2020;
  OCHA ROAP / Government of Viet Nam, CC BY 3.0 IGO. These are historical regions.
  https://www.geoboundaries.org/api.html
- `landscape.json` roads, rivers and landmark geography: © OpenStreetMap
  contributors, ODbL 1.0; OpenFreeMap / © OpenMapTiles, snapshot 20261018_080001_pt.
  https://www.openstreetmap.org/copyright
  https://openfreemap.org/quick_start/

See docs/implementation/home-terrain-map.md for crop, sampling and source details.
