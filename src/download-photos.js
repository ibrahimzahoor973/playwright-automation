import axios from 'axios';
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
  index
}) => {
  const {
    galleryName,
    collectionId,
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
      const filePath = path.join(process.cwd(), 'PhotoGallery', `${galleryName}/${collectionId}/${photoId}.jpg`);
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

        return DownloadPhoto({ filteredCookies, photo, index, retries: retries - 1 })
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
  filteredCookies
}) => {
  axios.defaults.timeout = 30000;
  axios.defaults.httpsAgent = new https.Agent({ keepAlive: true });

  let galleries;
  do {
    galleries = await GetGalleries({ filterParams: { isDownloaded: { $exists: false } }, limit: 10 });
    let photosData;
    try {
      console.log({ galleries: galleries.length });

      for (let i = 0; i < galleries.length; i += 1) {
        const gallery = galleries[i];
        const gallerySets = await GetGallerySets({ filterParams: { collectionId: gallery.collectionId, isDownloaded: { $exists: false } }});
        console.log({ gallerySets: gallerySets.length });

        for (let j = 0; j < gallerySets.length; j += 1) {
          const set = gallerySets[j];
          console.log('Gallery Set', j);
          photosData = await GetGalleryPhotos({
            filterParams: {
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
                index: k
              });
            await UpdateGalleryPhoto({ filterParams: { photoId: photo.photoId }, updateParams: { isDownloaded: true } });
            } catch (err) {
              console.log('Error while downloading Photo', photo.photoId);
            }
          }
         
          console.log('All photos downloaded for Set', set.setId);

          await UpdateGallerySet({
            filterParams: { setId: set.setId },
            updateParams: { isDownloaded: true }
          });
          console.log('Set updated!', set.name);
        }

        await UpdateGallery({
          filterParams: { collectionId: gallery.collectionId },
          updateParams: { isDownloaded: true }
        });

        console.log('Gallery updated!', gallery.collectionId);

        await sleep(10);
      }
    } catch (err) {
      console.log('Error in Download Photos Method!', err);
      throw err;
    }
  } while (galleries.length)
};

export default DownloadPhotos;
