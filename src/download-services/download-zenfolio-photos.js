import axios from '../../config/axios.js';
import https from 'https';
import path from 'path';
import fs from 'fs';

import { GetGallerySets, UpdateGallerySet } from '../../db-services/gallery-set.js';
import { GetGalleries, UpdateGallery } from '../../db-services/gallery.js';
import { GetGalleryPhotos, UpdateGalleryPhoto } from '../../db-services/photo.js';

import { sleep } from '../helpers/common.js';

const { platform } = process.env;

const BASE_DELAY_MS = 240;
const retries = 3;

const DownloadPhoto = async ({
  authorizationToken,
  photo,
  index,
  userEmail
}) => {
  const { galleryName, setName = "", name, photoId, collectionId } = photo;

  console.log("In DownloadPhoto method", index, photoId, collectionId);

  try {
    const response = await axios.put(
      "https://app.zenfolio.com/api/folders/v1/photos/download",
      {
        albumId: collectionId,
        photoId
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: authorizationToken,
        },
      }
    );

    const downloadUrl = response?.data?.downloadUrl;
    if (!downloadUrl) throw new Error("Failed to get download URL");

    const fileUrl = `https://zenfolio.creatorcdn.com${downloadUrl}`;
    // let filePath = path.join(process.cwd(), `Zenfolio/${userEmail}`, `${galleryName}/${setName}/${name}`);
    let filePath = path.join('D:', `Zenfolio/${userEmail}`, `${galleryName}/${setName}/${name}`);
    
    filePath = filePath.replace(/\|/g, '-');

    console.log({ filePath });

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const writer = fs.createWriteStream(filePath);
    const fileResponse = await axios({
      url: fileUrl,
      method: "GET",
      responseType: "stream",
    });

    return new Promise((resolve, reject) => {
      fileResponse.data
        .pipe(writer)
        .on("finish", () => {
          console.log("File downloaded successfully", photoId);
          resolve({ success: true, photo, filePath });
        })
        .on("error", (err) => {
          console.error("Error writing file:", err);
          reject(err);
        });
    });
  } catch (err) {
    console.log(`Error in Download Photo ${photoId}`, err);
    if (err?.response?.status === 429 && retries > 0) {
      console.warn(`Rate-limited on photo ${photoId}, pausing all requests for ${BASE_DELAY_MS}s`);
      console.log('Error headers', err?.response);

      const delay = err?.response?.headers['retry-after'] || BASE_DELAY_MS;
      console.log({ delay })
      await sleep(delay);

      return DownloadPhoto({ authorizationToken, photo, index, retries: retries - 1, userEmail })
    } else if (retries === 0) {
      console.error(`Max retries reached for photo ${photoId}`);
      reject({ success: false, photo });
    } else {
      reject(err);
    }
  }
};

const DownloadZenFolioPhotos = async ({
  authorizationToken,
  userEmail,
  platform
}) => {
  axios.defaults.timeout = 30000;
  axios.defaults.httpsAgent = new https.Agent({ keepAlive: true });

  let gallery;
  do {
    let errorInGallery = false;
    [gallery] = await GetGalleries({
      filterParams: {
        userEmail,
        platform,
        $or: [
          { isLocked: { $exists: false } },
          { isLocked: false }
        ],
        isDownloaded: { $exists: false },
        $or: [
          { retryCount: { $exists: false } },
          { retryCount: { $lt: 3 } }
        ]
      }, limit: 1
    });
    let photosData;
    try {
      console.log({ gallery });
  
      if (gallery) {
        await UpdateGallery({
          filterParams: {
            userEmail,
            collectionId: gallery.collectionId
          },
          updateParams: { isLocked: true }
        });

        const gallerySets = await GetGallerySets({ 
          filterParams: {
            userEmail,
            collectionId: gallery.collectionId,
            isDownloaded: { $exists: false }
          } 
        });

        console.log({ gallerySets: gallerySets.length });

        for (let j = 0; j < gallerySets.length; j += 1) {
          let errorInGallerySet = false;
          const set = gallerySets[j];

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
              const { filePath } = await DownloadPhoto({
                authorizationToken,
                photo,
                index: k,
                userEmail
              });

              await UpdateGalleryPhoto({
                filterParams: {
                  userEmail,
                  photoId: photo.photoId
                },
                updateParams: {
                  isDownloaded: true,
                  filePath
                }
              });
            } catch (err) {
              console.log('Error while downloading Photo', photo.photoId);
              await UpdateGalleryPhoto({
                filterParams: {
                  userEmail,
                  photoId: photo.photoId
                },
                updateParams: { problematic: true }
              });
              errorInGallery = true;
              errorInGallerySet = true
            }
          }

          console.log('All photos downloaded for Set', set.setId);

          if (!errorInGallerySet) {
            await UpdateGallerySet({
              filterParams: {
                userEmail,
                collectionId: gallery.collectionId,
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
            updateParams: {
              isLocked: false,
              retryCount: 1
            }
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

export default DownloadZenFolioPhotos;
