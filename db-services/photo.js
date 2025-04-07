import pkg from 'lodash';

import Photo from '../models/photo.js';

import { sleep } from '../src/helpers/common.js';

import { PLATFORMS } from '../constants.js';

const { chunk } = pkg;

const SaveGalleryPhotos = async ({
  photos: photosData,
  setName,
  userEmail,
  platform
}) => {
  const photosChunks = chunk(photosData, 200);

  console.log({ photosChunks: photosChunks.length });

  for (let i = 0; i < photosChunks.length; i += 1) {
    const photos = photosChunks[i];

    const writeData = photos.map((photo) => {
      const {
        collectionId,
        setId,
        name,
        galleryName,
        setName: sceneName,
        photoId,
        photoUrl,
        xLarge,
        large,
        medium,
        thumb,
        displaySmall,
        displayMedium,
        displayLarge
      } = photo;

      let setObj = {
        galleryName,
        setName,
        name,
        platform,
        photoId,
        photoUrl,
        xLarge,
        large,
        medium,
        thumb,
        displaySmall,
        displayMedium,
        displayLarge
      };
  
      if (platform === PLATFORMS.PIC_TIME || platform === PLATFORMS.SHOOTPROOF || platform === PLATFORMS.ZENFOLIO) {
        setObj = {
          galleryName,
          setName: sceneName,
          name,
          platform
        }
      }

      return {
        updateOne: {
          filter: {
            userEmail,
            collectionId,
            setId,
            photoId
          },
          update: {
            $set: setObj
          },
          upsert: true
        }
      }
    });
    if (writeData.length) {
      let retries = 3;
      while (retries > 0) {
        try {
          const res = await Photo.bulkWrite(writeData);
          console.log({ SaveGalleryPhotos: res });
          break;
        } catch (err) {
          console.log('Error in Save Photos Bulk Write', err);
          retries -= 1;
          if (retries === 0) {
            throw err;
          }
          console.log(`Retrying... attempts left: ${retries}`);
          await sleep(5);
        }
      }
    }
  }
};

const GetGalleryPhotos = async ({
  filterParams
}) => {
  const photos = await Photo.find(filterParams);
  return photos;
};


const UpdateGalleryPhoto = async ({
  filterParams,
  updateParams
}) => {
  await Photo.updateOne({
    ...filterParams
  }, {
    ...updateParams
  });
};

const UpdateGalleryPhotos = async ({
  filterParams,
  updateParams,
  unsetParams
}) => {
  if (unsetParams) {
    await Photo.updateMany({
      ...filterParams
    },
    {
      $set: updateParams,
      $unset: unsetParams
    });
  } else {
    await Photo.updateMany({
      ...filterParams
    }, updateParams);
  }
};


export {
  GetGalleryPhotos,
  SaveGalleryPhotos,
  UpdateGalleryPhoto,
  UpdateGalleryPhotos
};

