const fs = require('fs');
const archiver = require('archiver');

const FILE_OUTPUT_PATH = './extension-bundle.zip'

const output = fs.createWriteStream(FILE_OUTPUT_PATH);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
    console.info(`Written ${archive.pointer()} bytes to ${FILE_OUTPUT_PATH}`)
});

archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
        console.warn(err);
    } else {
        throw err;
    }
});

archive.on('error', (err) => {
    throw err;
});

archive.pipe(output);

archive.file('manifest.json', { name: 'manifest.json' });
archive.file('background.js', { name: 'background.js' });
archive.file('icon.png', { name: 'icon.png' });
archive.file('styles.css', { name: 'styles.css' });
archive.file('interceptor.js', { name: 'interceptor.js' });

archive.finalize();
