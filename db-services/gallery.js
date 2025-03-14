import pkg from 'lodash';

import Gallery from '../models/gallery.js';

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
      const res =  await Gallery.bulkWrite(writeData);
      console.log({ SaveGalleries: res });
    }
  }
};

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

