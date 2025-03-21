import pkg from 'lodash';

import Gallery from '../models/gallery.js';

import { sleep } from '../src/helpers/common.js';

const { extend, chunk }  = pkg;

const SaveGalleries = async ({
  galleries: galleriesData,
  pageNumber,
  userEmail,
  platform,
  baseUrl
}) => {
  const galleryChunks = chunk(galleriesData, 200);

  console.log({ galleryChunks: galleryChunks.length });

    for (let i = 0; i < galleryChunks.length; i += 1 ) {
      const galleries = galleryChunks[i];
  
      const writeData = galleries.map((gallery) => {
        const {
          collectionId,
          eventDate,
          galleryName: name,
          numberOfPhotos,
          categories: eventCategory,
          coverPhoto,
          storageId,
          coverPhotoUrl,
          externalProjRef
        } = gallery;
    
        return {
          updateOne: {
            filter: {
              userEmail,
              collectionId
            },
            update: {
              $set : {
                pageNumber,
                name,
                numberOfPhotos,
                eventDate,
                eventCategory,
                coverPhoto,
                platform,
                baseUrl,
                storageId,
                coverPhotoUrl,
                externalProjRef
              }
            },
            upsert: true
          }
        }
      });
  
      if (writeData.length) {
        let retries = 3;
        while (retries > 0) {
        try {
        const res =  await Gallery.bulkWrite(writeData);
        console.log({ SaveGalleries: res });
        break;
      } catch (err) {
        console.log('Error in Save Galleries Bulk Write', err);
        retries -=1;
        if (retries === 0) {
          throw err;
        }
        console.log(`Retrying... attempts left: ${retries}`);
        await sleep(5);
      }
    }
  }
}};

const GetGalleries = async ({
  filterParams,
  limit,
  sort
}) => {
  const galleries = await Gallery.find(filterParams).limit(limit).sort(sort);

  return galleries;
};

const UpdateGallery = async ({
  filterParams,
  updateParams
}) => {
  const { retryCount } = updateParams || {};

  delete updateParams.retryCount;

  const updateObj = { $set: updateParams };

  if (retryCount) {
    extend(updateObj, { $inc: { retryCount: 1 } });
  }

  await Gallery.updateOne({
    ...filterParams
  }, {
    ...updateObj
  });
};

const UpdateGalleries = async ({
  filterParams,
  updateParams
}) => {
  await Gallery.updateMany({
    ...filterParams
  }, {
    ...updateParams
  });
};


export {
  GetGalleries,
  SaveGalleries,
  UpdateGallery,
  UpdateGalleries
};

