import axios from '../config/axios.js';
import https from 'https';
import path from 'path';
import fs from 'fs';

import { GetGallerySets, UpdateGallerySet } from '../db-services/gallery-set.js';
import { GetGalleries, UpdateGallery } from '../db-services/gallery.js';
import { GetGalleryPhotos, UpdateGalleryPhoto } from '../db-services/photo.js';

import { sleep } from './helpers.js';

const BASE_DELAY_MS = 240;
const retries = 3;

const DownloadPhoto = async ({
  filteredCookies,
  photo,
  index,
  userEmail
}) => {
  const {
    galleryName,
    setName = '',
    name,
    photoId
  } = photo;
  console.log('in DownloadPhoto method', index, photoId);
  return new Promise(async (resolve, reject) => {
    axios({
      url: `https://galleries.pixieset.com/api/v1/photos/${photoId}/download`,
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        cookie: filteredCookies
      },
      responseType: 'stream'
    }).then((streamResponse) => {
      const filePath = path.join(process.cwd(), `PhotoGallery/${userEmail}`, `${galleryName}/${setName}/${name}.jpg`);
      console.log({ filePath });

      // Check if the directory exists and create it if it doesn't
      const dir = path.dirname(filePath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true }); // Creates the directory and any necessary parent directories
      }

      const writer = fs.createWriteStream(filePath);

      // Assuming streamResponse is your response from axios or any other source
      streamResponse.data.pipe(writer)
        .on('finish', async () => {
          console.log('File downloaded successfully', photoId);
          resolve({ success: true, photo });
        })
        .on('error', (err) => {
          console.error('Error writing file:', err);
          reject(err);
        });
    }).catch(async (err) => {
      console.log(`Error in Download Photo ${photoId}`, err);
      if (err?.response?.status === 429 && retries > 0) {
        console.warn(`Rate-limited on photo ${photoId}, pausing all requests for ${BASE_DELAY_MS}s`);
        console.log('Error headers', err?.response);
        const delay = err?.response?.headers['retry-after'] || BASE_DELAY_MS;
        console.log({ delay })
        await sleep(delay);

        return DownloadPhoto({ filteredCookies, photo, index, retries: retries - 1, userEmail })
      } else if (retries === 0) {
        console.error(`Max retries reached for photo ${photoId}`);
        reject({ success: false, photo });
      } else {
        reject(err);
      }
    })
  });
};

const DownloadPhotos = async ({
  filteredCookies,
  userEmail
}) => {
  axios.defaults.timeout = 30000;
  axios.defaults.httpsAgent = new https.Agent({ keepAlive: true });

  let gallery;
  do {
    let errorInGallery = false;
    [gallery] = await GetGalleries({
      filterParams: {
        userEmail,
        $or: [
          { isLocked: { $exists: false } },
          { isLocked: false }
        ],
        isDownloaded: { $exists: false }
      }, limit: 1
    });
    let photosData;
    try {
      console.log({ gallery });

      if (gallery) {
        await UpdateGallery({
          filterParams: { userEmail, collectionId: gallery.collectionId },
          updateParams: { isLocked: true }
        });

        const gallerySets = await GetGallerySets({ filterParams: {
          userEmail,
          collectionId: gallery.collectionId,
          isDownloaded: { $exists: false }
        } });
        console.log({ gallerySets: gallerySets.length });

        for (let j = 0; j < gallerySets.length; j += 1) {
          let errorInGallerySet = false;
          const set = gallerySets[j];
          console.log('Gallery Set', j);
          photosData = await GetGalleryPhotos({
            filterParams: {
              userEmail,
              collectionId: gallery.collectionId,
              setId: set.setId,
              isDownloaded: { $exists: false }
            }
          });
          console.log({
            photosData: photosData.length
          });
          for (let k = 0; k < photosData.length; k += 1) {
            const photo = photosData[k];
            try {
              await DownloadPhoto({
                filteredCookies,
                photo,
                index: k,
                userEmail
              });
              await UpdateGalleryPhoto({ filterParams: {
                userEmail,
                photoId: photo.photoId
              },
              updateParams: { isDownloaded: true } });
            } catch (err) {
              console.log('Error while downloading Photo', photo.photoId);
              errorInGallery = true;
              errorInGallerySet = true
            }
          }

          console.log('All photos downloaded for Set', set.setId);

          if (!errorInGallerySet) {
            await UpdateGallerySet({
              filterParams: {
                userEmail,
                setId: set.setId
              },
              updateParams: { isDownloaded: true }
            });
            console.log('Set Downloaded!', set.name);
          }
        }

        if (!errorInGallery) {
          await UpdateGallery({
            filterParams: {
              userEmail,
              collectionId: gallery.collectionId
            },
            updateParams: { isDownloaded: true }
          });
        } else {
          await UpdateGallery({
            filterParams: {
              userEmail,
              collectionId: gallery.collectionId
            },
            updateParams: { isLocked: false }
          });
        }

        console.log('Gallery updated!', gallery.collectionId);

        await sleep(10);
      }
    } catch (err) {
      console.log('Error in Download Photos Method!', err);
      throw err;
    }
  } while (gallery)
    return true;
};

export default DownloadPhotos;
