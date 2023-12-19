import * as https from 'https';
import * as fs from 'fs';
import * as sharp from 'sharp';
import * as progress from 'progress';

let verboseMode = false;
let lastGet: Promise<any> = Promise.resolve();
let lastRequestTime: number = 0;
function wget(url: string): Promise<Buffer> {
    const fileName = Buffer.from(url).toString('base64url');
    const pathCache = './.cache/' + fileName + '.png';
    return fs.promises.access('./.cache').catch(() => {
        return fs.promises.mkdir('./.cache');
    }).then(() => {
        return fs.promises.access(pathCache);
    }).then(() => {
        if (verboseMode) {
            console.log('Get', url, 'from cache');
        }
        return fs.promises.readFile(pathCache);
    },
        () => {
            lastGet = lastGet.then(() => {
                const now = Date.now();
                const diff = now - lastRequestTime;
                if (diff > 100) {
                    return Promise.resolve();
                }
                return new Promise((resolve) => setTimeout(resolve, 100 - diff));
            }).then(() => {
                if (verboseMode) {
                    console.log('Get', url, 'from openstreetmap');
                }
                return new Promise<Buffer>((resolve, reject) => {
                    https.get(url, {
                        headers: {
                            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
                            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
                        }
                    }, (res) => {
                        const buffers: Buffer[] = [];
                        res.on('data', (data: Buffer) => {
                            buffers.push(data);
                        });
                        res.on('close', () => {
                            const result = Buffer.concat(buffers);
                            resolve(result);
                        });
                        res.on('error', reject);
                    });
                }).then((img) => {
                    lastRequestTime = Date.now();
                    return fs.promises.writeFile(pathCache, img).then(() => img);
                });
            });
            return lastGet;
        }
    );
}
function printHelp() {
    console.log('npm start -- [lat min] [lon min] [lat max] [lon max] [zoom]');
    console.log('  lat/lon min/max : Number between -180 and 180');
    console.log('  zoom : Number 0 and 19 (zoom max = 19, see zoom by map on openstreetmap website)');
    console.log('  --verbose : Show debug logs');
    console.log('  --output (-o) [filepath] : Set output path (default is ./output.png)');
    console.log('  --baseUrl  (-u) [baseUrl] : Base URL to download pictures (default is https://a.tile.openstreetmap.fr/openriverboatmap/), see https://layers.openstreetmap.fr/ and https://wiki.openstreetmap.org/wiki/Featured_tile_layers');
    console.log('  --help (-h): Show this help');
    console.error('Ex: npm start -- 44.466051 1.393995 44.436990 1.476352 14');
}

let baseUrl = 'https://a.tile.openstreetmap.fr/openriverboatmap/';
// const baseUrl = 'https://tile.openstreetmap.org/';
function lon2tile(lon: number, zoom: number) { return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom))); }
function lat2tile(lat: number, zoom: number) { return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom))); }

interface IPoint {
    x: number;
    y: number;
    z: number;
}
function latLngToPoint(lat: number, lon: number, z: number): IPoint {
    return {
        x: lon2tile(lon, z),
        y: lat2tile(lat, z),
        z,
    };
}

function run(latMin: number, lonMin: number, latMax: number, lonMax: number, zoom: number, baseUrl: string, output: string) {
    const hg = latLngToPoint(latMin, lonMin, zoom);
    const bd = latLngToPoint(latMax, lonMax, zoom);
    const minX = Math.min(hg.x, bd.x);
    const maxX = Math.max(hg.x, bd.x);
    const minY = Math.min(hg.y, bd.y);
    const maxY = Math.max(hg.y, bd.y);
    const promises: Promise<{ x: number, y: number, content: Buffer }>[] = [];

    const nbReq = (maxX - minX + 1) * (maxY - minY + 1);
    let bar: progress | undefined;
    if (verboseMode === false) {
        bar = new progress.default('Downloading [:bar] :percent (:current/:total) :eta', { total: nbReq, curr: 0 });
    }

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            const prom = wget(`${baseUrl}${zoom}/${x}/${y}.png`).then((content: Buffer) => {
                if (bar) {
                    bar.tick();
                }
                return { x, y, content };
            });
            promises.push(prom);
        }
    }

    return Promise.all(promises).then((tiles) => {
        if (tiles.length === 0) {
            throw new Error('No tile downloaded');
        }
        // get size of first tile
        return sharp.default(tiles[0].content).metadata().then((metadatas) => {
            return { width: metadatas.width!, height: metadatas.height! };
        }).then((sizeSingle) => {
            const finalImage = sharp.default({
                create: {
                    width: sizeSingle.width * (maxX - minX),
                    height: sizeSingle.height * (maxY - minY),
                    channels: 3,
                    background: { r: 255, g: 255, b: 255 },
                },
            });
            return finalImage.composite(tiles.map((tile) => {
                return {
                    input: tile.content,
                    top: (tile.y - minY) * sizeSingle.height,
                    left: (tile.x - minX) * sizeSingle.width,
                };
            })).toFile(output);
        });
    })
}


// Extract params
const args: string[] = [];
let output = 'output.png';
for (let i = 2; i < process.argv.length; i++) {
    switch (process.argv[i]) {
        case '-o':
        case '--output': {
            if (process.argv.length <= i + 1) {
                console.error('After --output please give output path');
                printHelp();
                process.exit(3);
            }
            output = process.argv[i + 1];
            i++;
            break;
        }
        case '-u':
        case '--baseUrl': {
            if (process.argv.length <= i + 1) {
                console.error('After --output please give output path');
                printHelp();
                process.exit(3);
            }
            baseUrl = process.argv[i + 1];
            i++;
            break;
        }
        case '--verbose': {
            verboseMode = true;
            break;
        }
        case '-h':
        case '--help': {
            printHelp();
            process.exit(0);
        }
        default: {
            args.push(process.argv[i]);
        }
    }
}
if (args.length != 5) {
    console.error('Please give latitude min, longitude min, latitude max, longitude max and zoom between 0 and 19');
    printHelp();
    process.exit(1);
}
const latMin = Number(args[0]);
const lonMin = Number(args[1]);
const latMax = Number(args[2]);
const lonMax = Number(args[3]);
const zoom = Number(args[4]);
if (isNaN(latMin) || isNaN(lonMin) || isNaN(latMax) || isNaN(lonMax)) {
    console.error('lat and lon and zoom must be numbers');
    printHelp();
    process.exit(2);
}
run(latMin, lonMin, latMax, lonMax, zoom, baseUrl, output).then(() => {
    console.log('Map générée : output.png');
}, (e) => {
    console.error('Error', e);
});