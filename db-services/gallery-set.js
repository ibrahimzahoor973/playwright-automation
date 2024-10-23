import GallerySet from '../models/gallery-set.js';

const SaveGallerySets = async ({
  gallerySets
}) => {
  const writeData = gallerySets.map((set) => {
    const {
      collection_id: collectionId,
      id: setId,
      photo_count: numberOfPhotos,
      name
    } = set;

    return {
      updateOne: {
        filter: {
          setId
        },
        update: {
          $set: {
            collectionId,
            numberOfPhotos,
            name
          }
        },
        upsert: true
      }
    }
  });
  if (writeData.length) {
    const res = await GallerySet.bulkWrite(writeData);
    console.log({ SaveGallerySets: res });
  }
};

const UpdateGallerySet = async ({
  filterParams,
  updateParams
}) => {
  await GallerySet.updateOne({
    ...filterParams
  }, {
    ...updateParams
  });
};

const GetGallerySets = async ({
  filterParams
}) => {
  const gallerySets = await GallerySet.find(filterParams);
  return gallerySets;
};


export {
  GetGallerySets,
  SaveGallerySets,
  UpdateGallerySet
};

