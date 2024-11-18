import pkg from 'lodash';

import GallerySet from '../models/gallery-set.js';

import PLATFORMS from '../constants.js';

const { chunk } = pkg;

const SaveGallerySets = async ({
  gallerySets: gallerySetsData,
  galleryName,
  userEmail,
  platform
}) => {
  let collectionId;
  let setId;
  let numberOfPhotos;
  let name;

  const gallerySetsChunks = chunk(gallerySetsData, 200);

  console.log({ gallerySetsChunks: gallerySetsChunks.length });


  for (let i = 0; i < gallerySetsChunks.length; i += 1) {
    const gallerySets = gallerySetsChunks[i];

    const writeData = gallerySets.map((set) => {
      if (platform === PLATFORMS.PIXIESET) {
        const {
          collection_id,
          id,
          photo_count,
          name: setName
        } = set;
  
        collectionId = collection_id;
        setId = id;
        numberOfPhotos = photo_count;
        name = setName
      } else if (platform === PLATFORMS.PIC_TIME) {
        const {
          galleryId,
          sceneId,
          name: setName
        } = set;
  
        collectionId = galleryId;
        setId = sceneId;
        name = setName
      }
  
      return {
        updateOne: {
          filter: {
            userEmail,
            setId
          },
          update: {
            $set: {
              collectionId,
              galleryName,
              numberOfPhotos,
              name,
              platform
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

const UpdateGallerySets = async ({
  filterParams,
  updateParams
}) => {
  await GallerySet.updateMany({
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
  UpdateGallerySet,
  UpdateGallerySets
};

