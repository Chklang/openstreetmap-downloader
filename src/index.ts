//npm start -- --baseUrl https://c.tile.openstreetmap.fr/osmfr/ --output ../carte-17.jpg 45.069040 0.865393 44.150070 2.340308 17
import * as https from 'https';
import * as fs from 'fs';
import * as sharp from 'sharp';
import * as progress from 'progress';
import * as crypto from 'crypto';
import * as path from 'path';

let verboseMode = false;
let lastGetHttp: Promise<any> = Promise.resolve();
let promiseInitCache: Promise<any> = fs.promises.access('./.cache').catch(() => {
    return fs.promises.mkdir('./.cache');
});
let lastRequestTime: number = 0;
const rootCacheFolder = './.cache';

const MAX_PARALLEL_FS_OPERATION = 1000;
const wgetCheckCache = (function () {
    let nbInProgress = 0;
    const waiting: { resolve: (content?: string) => void, urlToDo: string }[] = [];

    function doIt(resolve: (content?: string) => void, urlToDo: string) {
        nbInProgress++;
        const fileName = Buffer.from(urlToDo).toString('base64url');

        const hashed = crypto.createHash('sha256').update(fileName + '.png').digest('base64url').toLowerCase();
        const pathCache = path.join(rootCacheFolder, hashed[0], hashed[1], fileName + '.png');
        return promiseInitCache.then(() => fs.promises.access(pathCache)).then(() => {
            if (verboseMode) {
                console.log('Get', urlToDo, 'from cache');
            }
            resolve(pathCache);
        }, () => {
            resolve(undefined);
        }).finally(() => {
            nbInProgress--;
            if (waiting.length > 0) {
                const next = waiting.splice(0, 1);
                doIt(next[0].resolve, next[0].urlToDo);
            }
        });;
    }

    return function (url: string): Promise<string | undefined> {
        if (nbInProgress > MAX_PARALLEL_FS_OPERATION) {
            // Wait!
            let resolve: (content: string | undefined) => void;
            const prom = new Promise<string | undefined>((_resolve) => {
                resolve = _resolve;
            });
            waiting.push({
                resolve: resolve!,
                urlToDo: url,
            });
            return prom;
        }

        return new Promise<string | undefined>((resolve) => {
            doIt(resolve, url);
        });
    }
})();

function downloadDatas(url: string): Promise<string> {
    return wgetCheckCache(url).then((result) => {
        if (result) {
            return result;
        }
        lastGetHttp = lastGetHttp.then(() => {
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

                const fileName = Buffer.from(url).toString('base64url');

                const hashed = crypto.createHash('sha256').update(fileName + '.png').digest('base64url').toLowerCase();
                const pathCache = path.join(rootCacheFolder, hashed[0], hashed[1], fileName + '.png');

                const firstFolder = hashed[0];
                return fs.promises.access(path.join(rootCacheFolder, firstFolder)).catch(() => {
                    fs.promises.mkdir(path.join(rootCacheFolder, firstFolder), { recursive: true });
                }).then(() => {
                    const secondFolder = hashed[1];
                    return fs.promises.access(path.join(rootCacheFolder, firstFolder, secondFolder)).catch(() => {
                        fs.promises.mkdir(path.join(rootCacheFolder, firstFolder, secondFolder), { recursive: true });
                    }).then(() => {
                        return fs.promises.writeFile(pathCache, img).then(() => pathCache);
                    })
                })
            });
        });
        return lastGetHttp;
    });
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
    const promises: Promise<{ x: number, y: number, filePath: string }>[] = [];

    const nbReq = (maxX - minX + 1) * (maxY - minY + 1);

    if (verboseMode) {
        console.log('Nb picture to download :', nbReq);
    }
    let bar: progress | undefined;
    if (verboseMode === false) {
        bar = new progress.default('Downloading [:bar] :percent (:current/:total) :eta', { total: nbReq, curr: 0 });
    }

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            const prom = downloadDatas(`${baseUrl}${zoom}/${x}/${y}.png`).then((filePath: string) => {
                if (bar) {
                    bar.tick();
                }
                return { x, y, filePath };
            });
            promises.push(prom);
        }
    }

    return Promise.all(promises).then((tiles) => {
        if (tiles.length === 0) {
            throw new Error('No tile downloaded');
        }
        // get size of first tile
        return fs.promises.readFile(tiles[0].filePath).then((contentOfFirstTile) => {
            return sharp.default(contentOfFirstTile).metadata().then((metadatas) => {
                return { width: metadatas.width!, height: metadatas.height! };
            });
        }).then((sizeSingle) => {
            if (verboseMode) {
                console.log('Size', sizeSingle.width * Math.max(1, maxX - minX), 'x', sizeSingle.height * Math.max(1, maxY - minY));
            }
            let finalImage = sharp.default({
                limitInputPixels: 0,
                unlimited: true,
                create: {
                    width: sizeSingle.width * Math.max(1, maxX - minX + 1),
                    height: sizeSingle.height * Math.max(1, maxY - minY + 1),
                    channels: 4,
                    background: { r: 255, g: 255, b: 255 },
                },
            });

            // return finalImage.toFile(output);
            // let lastImageCompose = Promise.resolve(finalImage);
            // let nbCompose = 0;
            let bufferCompose = finalImage.raw().toBuffer();
            bar = new progress.default('Compose [:bar] :percent (:current/:total) :eta', { total: tiles.length, curr: 0 });
            for (let i = 0; i < tiles.length; i++) {
                bufferCompose = bufferCompose.then((from) => {
                    return fs.promises.readFile(tiles[i].filePath).then((contentOfTile) => {
                        return sharp.default(contentOfTile).ensureAlpha().raw().toBuffer();
                    }).then((tileInput) => {
                        copyImage({
                            rect: {
                                h: sizeSingle.height,
                                w: sizeSingle.width,
                                y: (tiles[i].y - minY) * sizeSingle.height,
                                x: (tiles[i].x - minX) * sizeSingle.width,
                            }, input: tileInput,
                        }, from, {
                            w: sizeSingle.width * Math.max(1, maxX - minX + 1),
                            h: sizeSingle.height * Math.max(1, maxY - minY + 1),
                        });
                        bar?.tick();
                        return from;
                    });
                });
            }
            return bufferCompose.then((buff) => {
                return sharp.default(buff, {
                    limitInputPixels: 0,
                    unlimited: true,
                    raw: {
                        width: sizeSingle.width * Math.max(1, maxX - minX + 1),
                        height: sizeSingle.height * Math.max(1, maxY - minY + 1),
                        channels: 4,
                    }
                }).toFile(output);
            });
        });
    })
}


interface ITileRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

// Thanks to https://github.com/rpav/tileutil.js/blob/master/makeatlas.js#L448
function copyImage(rect: { rect: ITileRect, input: Buffer }, buf: Buffer, bufDims: { w: number, h: number }) {
    const r = { ...rect.rect };

    function pxi(a: [number, number], dims: { w: number, h: number }) {
        const [x, y] = a;
        return y * (dims.w * 4) + (x * 4);
    }

    function copyPx(toBuffer: Buffer, toP: [number, number], fromBuffer: Buffer, fromP: [number, number]) {
        let fromI = pxi(fromP, r);

        if (fromI < fromBuffer.length) {
            toBuffer.writeUInt32LE(fromBuffer.readUInt32LE(fromI), pxi(toP, bufDims));
        }
    }

    for (let x = 0; x < r.w; ++x) {
        for (let y = 0; y < r.h; ++y) {
            copyPx(buf, [r.x + x, r.y + y], rect.input, [x, y]);
        }
    }
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
                console.error('After --baseUrl please give output path');
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
    console.log('Map générée :', output);
}, (e) => {
    console.error('Error', e);
});