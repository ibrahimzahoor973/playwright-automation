import Gallery from '../models/gallery.js';

const SaveGalleries = async ({
  galleries,
  pageNumber
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
          collectionId
        },
        update: {
          $set : {
            pageNumber,
            name,
            numberOfPhotos,
            eventDate,
            eventCategory
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
  await Gallery.updateOne({
    ...filterParams
  }, {
    ...updateParams
  });
};


export {
  GetGalleries,
  SaveGalleries,
  UpdateGallery
};

