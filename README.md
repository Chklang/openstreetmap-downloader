# HOW TO INSTALL
1. Clone repo
2. "pnpm i"
3. Use "npm start -- [options]" (help = npm start -- -h)

# HOW TO USE
```
npm start -- [lat min] [lon min] [lat max] [lon max] [zoom]
  lat/lon min/max : Number between -180 and 180
  zoom : Number 0 and 19 (zoom max = 19, see zoom by map on openstreetmap website)
  --verbose : Show debug logs
  --output (-o) [filepath] : Set output path (default is ./output.png)
  --baseUrl  (-u) [baseUrl] : Base URL to download pictures (default is https://a.tile.openstreetmap.fr/openriverboatmap/), see https://layers.openstreetmap.fr/ and https://wiki.openstreetmap.org/wiki/Featured_tile_layers
  --help (-h): Show this help
Ex: npm start -- 44.466051 1.393995 44.436990 1.476352 14
```
# LICENSE

           DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
                   Version 2, December 2004
 
Copyright (C) 2004 Sam Hocevar <sam@hocevar.net>

Everyone is permitted to copy and distribute verbatim or modified
copies of this license document, and changing it is allowed as long
as the name is changed.
 
           DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
  TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

 0. You just DO WHAT THE FUCK YOU WANT TO.