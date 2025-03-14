import fs from 'fs';
import yauzl from 'yauzl';
import axios from 'axios';
import path from 'path';

import { GetGalleries, UpdateGallery } from "../../db-services/gallery.js";
import { GetGalleryPhotos, UpdateGalleryPhotos } from "../../db-services/photo.js";
import { sleep } from "../helpers/common.js";
import { GetAccount } from '../../db-services/account.js';
import { UpdateGallerySets } from '../../db-services/gallery-set.js';

const DownloadGalleryPhotos = async ({
  page,
  authorizationToken,
  userEmail,
  collectionId,
  galleryName,
  coverPhoto,
  brandId,
  photoIds
}) => {
  const response = await axios({
    url: `https://api.shootproof.com/studio/brand/${brandId}/event/${collectionId}/zip-bundle`,
    method: 'POST',
    headers: {
      'content-type': 'application/vnd.shootproof+json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Authorization: authorizationToken
    },
    data: {
      type: 'zip-bundle',
      photoIds
    }
  });

  let { data: { zipBundleStatus, downloadPageUrl } = {} } = response;

  console.log({
    zipBundleStatus,
    downloadPageUrl
  });

  while (zipBundleStatus !== 'downloadable') {
    await sleep(15);
    await DownloadGalleryPhotos({
      page,
      authorizationToken,
      userEmail,
      collectionId,
      galleryName,
      coverPhoto,
      brandId,
      photoIds
    });
    console.log('after Recursive call');
    return;
  }

  await page.goto(downloadPageUrl);

  const filesList = await page.$('.bullet');

  console.log({
    filesList
  });

  if (filesList) {
    const listLink = await filesList.$('li a');

    const downloadLink = await listLink.evaluate((ele) => ele.href);
    console.log({
      downloadLink
    });

    const downloadResponse = await axios({
      url: downloadLink,
      method: 'GET',
      responseType: 'stream'
    });

    const directoryPath = path.join(process.cwd(), `ShootProof/${userEmail}/${galleryName}-${collectionId}.zip`);

    // const directoryPath = path.join('D:', `ShootProof/${userEmail}/${galleryName}-${collectionId}.zip`);

    const directory = path.dirname(directoryPath);

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
      console.log('Directory Created!');
    }

    console.log('Starting download...');
    await new Promise((resolve, reject) => {
      const writableStream = fs.createWriteStream(directoryPath);

      downloadResponse.data.pipe(writableStream);

      writableStream.on('finish', () => {
        console.log('Finished writing file to', directoryPath);
        resolve();
      });

      writableStream.on('error', (err) => {
        console.error('Error while writing the file:', err);
        reject(err);
      });
    });


    const extractPath = path.join(process.cwd(), `ShootProof/${userEmail}/${galleryName}-${collectionId}`);

    // const extractPath = path.join('D:', `ShootProof/${userEmail}/${galleryName}-${collectionId}`);

    await new Promise((resolve, reject) => {
      yauzl.open(directoryPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) throw err;

        zipfile.on("entry", (entry) => {
          const entryPath = path.join(extractPath, entry.fileName);
          console.log({
            entryPath
          });

          // Ensure the directory exists before writing the file
          const dirPath = path.dirname(entryPath);
          console.log({
            dirPath
          });
          fs.promises.mkdir(dirPath, { recursive: true })
            .then(() => {
              // Open the entry for reading
              zipfile.openReadStream(entry, (err, readStream) => {
                if (err) throw err;

                // Create a write stream to the destination path
                const writeStream = fs.createWriteStream(entryPath);

                // Pipe the read stream to the write stream to extract the file
                readStream.pipe(writeStream);

                writeStream.on("close", () => {
                  console.log(`Extracted: ${entry.fileName}`);
                  zipfile.readEntry();  // This reads the next entry
                });
              });
            })
            .catch((mkdirError) => {
              console.error("Error creating directories:", mkdirError);
              reject(mkdirError);
            });
        });

        zipfile.on("end", () => {
          console.log("All files extracted!");
          fs.unlink(directoryPath, () => console.log('File Deleted'));
          resolve();
        });

        zipfile.readEntry();
      });
    });

    console.log('AFTER EXTRACTING ALL FILES....');
    return { directoryPath: extractPath };
  }
};

const DownloadShootProofPhotos = async ({
  page,
  authorizationToken,
  userEmail,
  platform
}) => {
  console.log('IN DOWNLOAD PHOTOS METHOD', userEmail);
  const account = await GetAccount({
    filterParams: {
      email: userEmail,
      platform
    }
  });

  console.log({account})

  const { shootProofBrandId: brandId } = account || {};

  console.log({
    brandId
  })
  let gallery;

  if (brandId) {
    do {
      [gallery] = await GetGalleries({
        filterParams: {
          userEmail,
          platform,
          isDownloaded: { $exists: false },
          $and: [{
            $or: [{
              isLocked: { $exists: false },
            }, {
              isLocked: false
            }]
          },{
            $or: [
              { retryCount: { $exists: false } },
              { retryCount: { $lt: 3 } }
            ]}
          ]
        },
        limit: 1
      });
      if (gallery) {
        const photos = await GetGalleryPhotos({
          filterParams: {
            userEmail,
            platform,
            isDownloaded: { $exists: false },
            collectionId: gallery.collectionId
          }
        });
  
        console.log({
          photos: photos.length
        });
  
        console.log({
          collection: gallery.collectionId
        });
  
        const galleryPhotos = photos.filter((photo) => photo.collectionId === gallery.collectionId);
        const photoIds = galleryPhotos.map((photo) => photo.photoId);
  
        console.log({
          galleryPhotos: galleryPhotos.length,
          photoIds: photoIds.length
        });
  
        await UpdateGallery({
          filterParams: {
            collectionId: gallery.collectionId
          },
          updateParams: {
            isLocked: true
          }
        });
        let updateObj;
        let gallerySetUpdateObj;
        try {
          const { directoryPath } = await DownloadGalleryPhotos({
            page,
            authorizationToken,
            userEmail,
            collectionId: gallery.collectionId,
            galleryName: gallery.name,
            coverPhoto: gallery.coverPhoto,
            brandId,
            photoIds
          });

          await UpdateGalleryPhotos({
            filterParams: {
              userEmail,
              photoId: { $in: photoIds }
            },
            updateParams: [{
              $set: {
                isDownloaded: true,
                filePath: { $concat: [directoryPath, '/', '$name']}
              }
             }]
          });

          updateObj = {
            isLocked: false,
            isDownloaded: true
          }
          gallerySetUpdateObj = {
            isDownloaded: true
          }
        } catch (err) {
          console.log('Error while Downloading Gallery!', err);
          updateObj = {
            isLocked: false,
            retryCount: 1
          }
          gallerySetUpdateObj = {
            problematic: true
          }
        }
  
        await UpdateGallery({
          filterParams: {
            collectionId: gallery.collectionId
          },
          updateParams: {
            ...updateObj
          }
        });
  
        await UpdateGallerySets({
          filterParams: {
            collectionId: gallery.collectionId
          },
          updateParams: {
            ...gallerySetUpdateObj
          }
        });
      }
    } while (gallery);
  }
  return true;
};

export default DownloadShootProofPhotos;
