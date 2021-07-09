'use strict';


const branch = require('metalsmith-branch');
const sharp  = require('metalsmith-sharp'); // requires g++ to be installed in order to build it when running npm install


const jpeg = (quality = 80, progressive = false) => ({
    namingPattern: '{dir}{name}{ext}',
    moveFile: true,
    methods: [{
        name: 'jpeg',
        args: metadata => {
            return [{
                chromaSubsampling: quality < 90 ? '4:4:4' : '4:2:0',
                overshootDeringing: true,
                quality,
                progressive: progressive
            }]
        }
    }]
});

const optimizeImages = (glob, width, height, namingPattern, moveFile = false, progressive = false) => {
    return branch(glob)
        .use(sharp({
            // Downsize large images
            src: '**/*.!(svg)',
            namingPattern: namingPattern,
            moveFile: moveFile,
            methods: 
            [
                {
                    name: 'rotate', // required to keep the correct rotation, otherwise some images have the wrong orientation
                },
                {
                    name: 'resize',
                    args: 
                    [
                        width,
                        height,
                        {
                            fit: 'contain', // create border where the image doesn't fit into the constraints (width, height)
                            kernel: 'lanczos3', // Use a Lanczos kernel with a=3 (the default)
                            //withoutEnlargement: true, // do not enlarge if the width or height are already less than the specified dimensions
                            background: '#CCC' // the color which is used to pad/letterbox the image if it doesn't fit exactly into constraints
                        }
                    ]
                }
            ]
        }))
        .use(sharp({
            // Compress images
            src: '**/*.!(svg)',
            ...jpeg(80)
        }));
};

module.exports.productImages = (glob, width, height) => {
    const progressive = true
    const namingPattern = `assets/images/{name}{ext}`
    const moveFile = true;
    return optimizeImages(glob, width, height, namingPattern, moveFile, progressive);
}

module.exports.thumbnails = (glob, size) => {
    const namingPattern = `assets/thumbnails/images/{name}{ext}`;
    return optimizeImages(glob, size, size, namingPattern);
}