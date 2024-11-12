import pkg from 'lodash';

import Gallery from '../models/gallery.js';

const { extend }  = pkg;

const SaveGalleries = async ({
  galleries,
  pageNumber,
  userEmail,
  platform
}) => {
  const writeData = galleries.map((gallery) => {
    const {
      collectionId,
      eventDate,
      galleryName: name,
      numberOfPhotos,
      categories: eventCategory
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
            platform
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


export {
  GetGalleries,
  SaveGalleries,
  UpdateGallery
};

