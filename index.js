'use strict';

const Metalsmith       = require('metalsmith');
const assets           = require('metalsmith-assets-improved');
const cssUnused        = require('metalsmith-css-unused');
const cleanCSS         = require('metalsmith-clean-css');
const concat           = require('metalsmith-concat');
const discoverPartials = require('metalsmith-discover-partials');
const discoverHelpers  = require('metalsmith-discover-helpers');
const fingerprint      = require('metalsmith-fingerprint-ignore');
const htmlMinifier     = require('metalsmith-html-minifier');
const layouts          = require('metalsmith-layouts');
const markdown         = require('metalsmith-markdown');
const serve            = require('metalsmith-serve');
const metadataDir      = require('metalsmith-metadata-directory')
const filenames        = require('metalsmith-filenames')
const renamer          = require('metalsmith-renamer');
const sitemap          = require('metalsmith-sitemap');
const msIf             = require('metalsmith-if');

const { thumbnails, productImages } = require('./lib/sharp');

const cssOutputFile = 'assets/css/styles.css';

const productImageWidth = 1134;
const productImageHeight = 850;
const thumbnailWidthAndHeight = 300;

// is the build run localy for development or for production (github actions)
const devBuild = (process.env.NODE_ENV || 'development').toLowerCase() === 'development';

// used to fetch image names on the server so they don't always get re-processed
async function fetchImageDataFromServer() {
    const SftpClient = require('ssh2-sftp-client');
    const sftp = new SftpClient();

    try {
        await sftp.connect({
            host: process.env.SFTP_SITE,
            port: process.env.SFTP_PORT,
            username: process.env.SFTP_USERNAME,
            password: process.env.SFTP_PASSWORD
        });
    
        const productImages = await sftp.list('/assets/images', '*.+(jpg|JPG|jpeg|JPEG|png|PNG|gif|GIF|webp|WEBP)');
        const thumbnails = await sftp.list('/assets/thumbnails/images', '*.+(jpg|JPG|jpeg|JPEG|png|PNG|gif|GIF|webp|WEBP)');
    
        // merge the names of all productImages and thumbnails, and return only unique names
        return [
            ...new Set([
                ...productImages.map(file => 'uploads/' + file.name), 
                ...thumbnails.map(file => 'uploads/' + file.name)
            ])
        ];

    } catch (err) {
        console.log(err.message);
    } finally {
        if(sftp !== null) {
            sftp.end();
        }
    }
}

async function buildWebsite(alreadyUploadedImages = []) {
    Metalsmith(__dirname)
        .source('./src')          // source directory for the pipeline
        .use(metadataDir({
            directory: 'data/*.json'
        }))
        .use(discoverPartials())  // find and register template partials
        .use(discoverHelpers())   // find and register template helper functions
        .use(markdown())          // parse and convert markdown files to html files. deletes the source .md files from the stream at the end
        .use(assets({
            src: 'assets/',
            dest: 'assets'
        }))
        .use(assets({
            src: 'admin/',
            dest: 'admin'
        }))
        // put google web console verification into ./build without changing it (otherwise the hash doesn't match anymore)
        .use(assets({
            src: 'google/'
        }))
    
        // prep for image processing, replace with rsync + github actions + netlify cms editorial workflow in the future 
        .use((files, metalsmith, callback) => {    

            // remove alredy uploaded/processed images from the pipeline so they don't get processed and uploaded again, wasting unecessary time
            alreadyUploadedImages.forEach(fileName => {
                if (fileName in files) {
                    delete files[fileName];
                }
            });

            callback();
        })
        // generate thumbnails for the images
        .use(thumbnails('uploads/*', thumbnailWidthAndHeight))
        // generate product images (e.g. shrink 9 MB images to a web friendly size and upsize small old images)
        .use(productImages('uploads/*', productImageWidth, productImageHeight))

        // combine css files
        .use(concat({            
            files: 'css/*.css',
            output: cssOutputFile,
            keepConcatenated: false
        }))

        // creates a cash busting hash for the css file. it needs to come before the handlebars layouts call to be available there.
        // it doesn't matter that cssUnused and cleanCss are run after fingerpinting (they need to, because they are required to run after layouts)
        // since the minifcation has no relevant impact on the fingerprint, only changes to the source css files are important
        .use(fingerprint({pattern: cssOutputFile}))

        // links netlifycms relations with full relation data
        .use((files, metalsmith, callback) => {
            const sculptures = [];
            
            for(let linked_sculpture of files['index.html'].linked_sculptures) {
                for(let fileName in files) {

                    if(files.hasOwnProperty(fileName) && fileName.startsWith('wohnskulpturen/') && fileName.endsWith(linked_sculpture + '.html')) {
                        sculptures.push(
                            {...{url: fileName}, ...files[fileName]}
                        );
                    }
                }
            }

            let meta = metalsmith.metadata()
            meta.resolved_linked_sculptures = sculptures;
            metalsmith.metadata(meta)

            callback();
        })

        // get all sculptures and add them to the metadata in order to later loop through them on the overview page (wohnskulpturen.html)
        .use((files, metalsmith, callback) => {
            const sculptures = [];
            
            for(let fileName in files) {
                if(files.hasOwnProperty(fileName) && fileName.startsWith('wohnskulpturen/') && fileName.endsWith('.html')) {
                    sculptures.push(
                        {...{url: fileName}, ...files[fileName]}
                    );
                }
            }
            
            let meta = metalsmith.metadata()
            meta.all_sculptures = sculptures;
            metalsmith.metadata(meta)

            callback();
        })

        // adds the filename to the frontmatter data
        .use(filenames())
        //.use(collections({all_sculptures: "wohnskulpturen/**.md"}))

        // process all HTML files with Handlebars. required to come after fingerprint creation so it can be used in templates
        .use(layouts({            
            pattern: "**/*.html",
            engine: 'handlebars',
        }))

        .use(renamer({
            "change robots.txt extension from .html (due to layouts) to txt": {
                pattern: "robots.html",
                rename: "robots.txt",
            }
        }))

        // remove unused CSS rules (required to come after layouts so it has access to the created html with all css classes)
        .use(cssUnused())
        // minify css files (required to come after cssUnused so it can minify the already shrunk css file)        
        .use(cleanCSS({
            //files: cssOutputFile,
            cleanCSS: {
            rebase: false
            }
        }))

        .use(htmlMinifier({       // minify HTML files
            minifierOptions: {
                // Fix metalsmith-html-minifier defaults
                removeRedundantAttributes: false,
                removeAttributeQuotes: false,
                // Additional minification rules
                minifyCSS: true,
                minifyJS: true,
                quoteCharacter: '"',
                removeScriptTypeAttributes: true,
                removeStyleLinkTypeAttributes: true
            }
        }))

        // instead of hardcoding it, provide the sitemap plugin with the hostname from the metdata which can be edited through NetlifyCMS
        .use((files, metalsmith, callback) => {
            sitemap({
                hostname: metalsmith.metadata().settings.company_website
            })(files, metalsmith, callback);
        })

        .destination('./build')   // destination directory of the pipeline
        .clean(true)              // clean the destination directory before build

        // only start the dev server if we run it locally
        .use(msIf(devBuild, serve()))

        .build(function (err) {   // execute the build
            if (err) {
                throw err;
            }
        });

    return Promise.resolve('end of buildWebsite()');
}

async function main() {
    try {
        const alreadyUploadedImages = await fetchImageDataFromServer();
        return await buildWebsite(alreadyUploadedImages);
    } catch(err) {
        console.log(err);
    }
}


main();

